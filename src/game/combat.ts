import { clamp, randInt } from '../core/math';
import { wait } from '../core/clock';
import type { Actor } from '../entities/actor';
import type { Cell } from '../world/nav';
import type { Game } from './game';
import type { WeaponStats } from './items';

/** Диагональ = 1 ОД, как шаг по гексу в оригинале. */
const COMBAT_DIAG = 1.001;

/** Пошаговый бой: очерёдность по Восприятию, очки действия, шанс попадания по навыку и КБ. */
export class Combat {
  readonly participants: Actor[];
  active: Actor | null = null;
  round = 1;
  private endTurnResolve: (() => void) | null = null;
  busy = false;
  private finished = false;

  constructor(private game: Game, private playerFirst: boolean, target?: Actor) {
    const p = game.player;
    // В бой вступают только те, кто рядом; остальные подтягиваются, когда игрок подойдёт к ним.
    this.participants = [p, ...game.actors.filter((a) => a.faction === 'hostile' && !a.dead && a.distanceTo(p) < a.detectRadius + 3)];
    if (target && !this.participants.includes(target)) this.participants.push(target);
  }

  get isPlayerTurn() { return this.active === this.game.player && !this.busy; }

  private order(): Actor[] {
    const g = this.game;
    const seq = (a: Actor) => (a === g.player ? g.char.sequence + (this.playerFirst ? 100 : 0) : a.sequence) + Math.random();
    return [...this.participants].sort((a, b) => seq(b) - seq(a));
  }

  /** Клетки, занятые живыми существами (кроме исключённого). */
  occupied(except?: Actor): Set<number> {
    const nav = this.game.nav;
    const s = new Set<number>();
    for (const a of this.game.actors) {
      if (a.dead || a === except) continue;
      const [i, j] = a.cell(nav);
      s.add(nav.idx(i, j));
    }
    return s;
  }

  private hostilesLeft(): Actor[] {
    const p = this.game.player;
    return this.participants.filter((a) => a !== p && !a.dead && a.distanceTo(p) < 24);
  }

  async run() {
    const g = this.game;
    // Выравниваем всех по центрам клеток — дальше всё движение пошаговое.
    await Promise.all(this.participants.map((a) => this.snap(a)));
    while (!this.finished) {
      for (const a of this.order()) {
        if (this.finished) break;
        if (a.dead) continue;
        // Новые враги, заметившие шум боя.
        for (const h of g.actors) {
          if (h.faction === 'hostile' && !h.dead && !this.participants.includes(h) && h.distanceTo(g.player) < h.detectRadius) {
            this.participants.push(h);
            await this.snap(h);
          }
        }
        if (this.hostilesLeft().length === 0 || g.player.dead) {
          this.finished = true;
          break;
        }
        this.active = a;
        if (a === g.player) {
          a.ap = g.char.maxAp;
          g.ui.updateHud();
          await new Promise<void>((resolve) => (this.endTurnResolve = resolve));
        } else {
          a.ap = a.maxAp;
          g.ui.updateHud();
          await this.aiTurn(a);
        }
      }
      this.round++;
    }
    this.active = null;
    g.onCombatEnded();
  }

  endPlayerTurn() {
    if (this.active !== this.game.player || this.busy) return;
    const r = this.endTurnResolve;
    this.endTurnResolve = null;
    r?.();
  }

  /** Принудительное завершение (смерть игрока). */
  abort() {
    this.finished = true;
    const r = this.endTurnResolve;
    this.endTurnResolve = null;
    r?.();
  }

  private async snap(a: Actor) {
    const nav = this.game.nav;
    let [i, j] = a.cell(nav);
    const occ = this.occupied(a);
    if (!nav.isWalkable(i, j, occ)) {
      const free = nav.nearestWalkable(i, j, occ);
      if (free) [i, j] = free;
    }
    await a.moveAlong([nav.center(i, j)]);
  }

  // ─── Действия ────────────────────────────────────────────────────────────

  weaponOf(a: Actor): WeaponStats {
    return a === this.game.player ? this.game.inv.weapon : a.attack!;
  }

  hitChance(attacker: Actor, target: Actor, w: WeaponStats): number {
    const g = this.game;
    const isPlayer = attacker === g.player;
    let chance = (isPlayer ? g.char.skill(w.skill) : attacker.skill) - (target === g.player ? g.char.ac : target.ac);
    if (!w.melee) {
      const pe = isPlayer ? g.char.special.pe : 5;
      chance -= Math.max(0, attacker.distanceTo(target) - pe * 1.5) * 4;
    }
    return clamp(Math.round(chance), 5, 95);
  }

  /** Путь в клетках до позиции атаки. null — нельзя дойти. */
  approachPath(a: Actor, target: Actor, range: number): Cell[] | null {
    const nav = this.game.nav;
    return nav.findPathToRange(a.cell(nav), target.cell(nav), range, { occupied: this.occupied(a), diagCost: COMBAT_DIAG });
  }

  movePath(a: Actor, cell: Cell): Cell[] | null {
    const nav = this.game.nav;
    return nav.findPath(a.cell(nav), cell, { occupied: this.occupied(a), diagCost: COMBAT_DIAG });
  }

  async moveSteps(a: Actor, steps: Cell[]) {
    if (!steps.length) return;
    const nav = this.game.nav;
    await a.moveAlong(steps.map(([i, j]) => nav.center(i, j)));
  }

  /** Стоимость атаки с подходом для игрока: { path, total } либо null. */
  planPlayerAttack(target: Actor): { path: Cell[]; total: number } | null {
    const w = this.game.inv.weapon;
    const path = this.approachPath(this.game.player, target, w.range);
    if (!path) return null;
    return { path, total: path.length + w.ap };
  }

  async playerAttack(target: Actor) {
    const g = this.game;
    const p = g.player;
    if (!this.isPlayerTurn || target.dead) return;
    const w = g.inv.weapon;
    if (w.ammo && g.inv.count(w.ammo) === 0) {
      g.ui.log('Нет патронов!', 'warn');
      return;
    }
    const plan = this.planPlayerAttack(target);
    if (!plan) {
      g.ui.log('Не подобраться к цели.', 'warn');
      return;
    }
    if (plan.total > p.ap) {
      g.ui.log(`Не хватает очков действия (нужно ${plan.total}).`, 'warn');
      return;
    }
    this.busy = true;
    await this.moveSteps(p, plan.path);
    p.ap -= plan.path.length;
    p.ap -= w.ap;
    if (w.ammo) g.inv.remove(w.ammo, 1);
    await this.strike(p, target, w);
    this.busy = false;
    this.afterPlayerAction();
  }

  async playerMove(cell: Cell) {
    const g = this.game;
    const p = g.player;
    if (!this.isPlayerTurn) return;
    const path = this.movePath(p, cell);
    if (!path || path.length === 0) return;
    if (path.length > p.ap) {
      g.ui.log(`Слишком далеко: нужно ${path.length} ОД.`, 'warn');
      return;
    }
    this.busy = true;
    await this.moveSteps(p, path);
    p.ap -= path.length;
    this.busy = false;
    this.afterPlayerAction();
  }

  /** Трата ОД на действие вне атаки (например, лечение). */
  spendPlayerAp(n: number): boolean {
    const p = this.game.player;
    if (!this.isPlayerTurn || p.ap < n) return false;
    p.ap -= n;
    this.afterPlayerAction();
    return true;
  }

  private afterPlayerAction() {
    const g = this.game;
    g.ui.updateHud();
    if (this.hostilesLeft().length === 0) {
      this.finished = true;
      this.endPlayerTurn();
      return;
    }
    if (g.player.ap <= 0) this.endPlayerTurn();
  }

  /** Сама атака: анимация, бросок на попадание, урон, эффекты. */
  async strike(attacker: Actor, target: Actor, w: WeaponStats) {
    const g = this.game;
    attacker.faceTowards(target.pos);
    await wait(0.15);
    attacker.rig.playAttack();
    if (!w.melee) g.effects.muzzle(attacker, target);
    await wait(w.melee ? 0.2 : 0.08);
    const chance = this.hitChance(attacker, target, w);
    const roll = randInt(1, 100);
    const isPlayer = attacker === g.player;
    const tName = target === g.player ? 'вас' : target.name.toLowerCase();
    if (roll > chance) {
      g.ui.floatText(target.pos.clone().setY(target.pos.y + target.rig.height + 0.3), 'Промах', '#e8dcc0');
      g.ui.log(isPlayer ? `Вы промахнулись по цели: ${tName}.` : `${attacker.name} промахивается.`);
      await wait(0.45);
      return;
    }
    let dmg = randInt(w.dmg[0], w.dmg[1]) + (w.melee && isPlayer ? g.char.meleeBonus : 0);
    const crit = randInt(1, 100) <= (isPlayer ? g.char.critChance : 3);
    if (crit) dmg *= 2;
    g.damage(target, dmg, attacker);
    const msg = isPlayer
      ? `${crit ? 'Критический удар! ' : ''}Вы поразили цель (${tName}): ${dmg} ед. урона.`
      : `${crit ? 'Критический удар! ' : ''}${attacker.name} наносит вам ${dmg} ед. урона.`;
    g.ui.log(msg, isPlayer ? (crit ? 'good' : '') : 'bad');
    await wait(0.5);
  }

  // ─── ИИ ──────────────────────────────────────────────────────────────────

  private async aiTurn(a: Actor) {
    const g = this.game;
    const p = g.player;
    const w = a.attack!;
    await wait(0.3);
    let guard = 0;
    while (a.ap > 0 && !p.dead && !a.dead && guard++ < 10) {
      const d = a.distanceTo(p);
      if (d <= w.range + 0.01) {
        if (a.ap < w.ap) break;
        a.ap -= w.ap;
        await this.strike(a, p, w);
        continue;
      }
      // Раненый зверь отступает к гнезду вместо атаки.
      if (a.hp < a.maxHp * 0.25 && Math.random() < 0.35) {
        g.ui.log(`${a.name} в панике пятится.`);
        const nav = g.nav;
        const away = a.pos.clone().sub(p.pos).setY(0).normalize().multiplyScalar(a.ap).add(a.pos);
        const path = nav.findPath(a.cell(nav), nav.cellOf(away.x, away.z), { occupied: this.occupied(a), diagCost: COMBAT_DIAG });
        if (path) await this.moveSteps(a, path.slice(0, a.ap));
        break;
      }
      const path = this.approachPath(a, p, w.range);
      if (!path || path.length === 0) break;
      const steps = path.slice(0, a.ap);
      await this.moveSteps(a, steps);
      a.ap -= steps.length;
    }
    await wait(0.2);
  }
}
