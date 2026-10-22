import * as THREE from 'three';
import { Character, SKILLS, SPECIAL_INFO, SPECIAL_KEYS, SPECIAL_POOL, type SkillId } from '../game/character';
import { ITEMS } from '../game/items';
import { QUESTS } from '../game/quests';
import type { Game } from '../game/game';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const LOCATION_NOTES: Record<string, string> = {
  arroyo: 'Храм Испытаний — к северу. Гнездо гекконов — к востоку. Нагор живёт у западной хижины. Южная тропа ведёт к выходу в пустошь.',
  klamath: 'Салун Мэйды — на северной стороне улицы. Склад — на западной окраине, загон Торра — на востоке. Выход — по дороге на восток.',
  den: 'Гильдия работорговцев — на севере. Клетка с пленником — рядом. В юго-восточном переулке опасно. Выход — на запад.',
};

interface Floater { el: HTMLDivElement; pos: THREE.Vector3; t: number }

export type PanelKind = 'inv' | 'cha' | 'pip';

export class UI {
  private floaters: Floater[] = [];
  private bannerTimer = 0;
  panel: PanelKind | null = null;
  private selectedItem: string | null = null;

  constructor(private game: Game) {
    document.querySelectorAll<HTMLButtonElement>('.hud-buttons button').forEach((b) => {
      b.addEventListener('click', () => this.togglePanel(b.dataset.act as PanelKind));
    });
    $('btn-end').addEventListener('click', () => game.endTurn());
    $('btn-combat').addEventListener('click', () => game.requestCombat());
    $('weapon-slot').addEventListener('click', () => this.togglePanel('inv'));
  }

  // ─── Журнал и HUD ────────────────────────────────────────────────────────

  log(msg: string, cls = '') {
    const log = $('log');
    const d = document.createElement('div');
    d.className = 'm ' + cls;
    d.textContent = '• ' + msg;
    log.appendChild(d);
    while (log.children.length > 80) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
  }

  showHud(v: boolean) {
    $('hud').classList.toggle('hidden', !v);
    $('help').classList.toggle('hidden', !v || this.game.helpHidden);
  }

  updateHud(previewCost = 0) {
    const g = this.game;
    const hp = $('hp');
    hp.textContent = String(Math.max(0, g.char.hp)).padStart(3, '0');
    hp.classList.toggle('ok', g.char.hp > g.char.maxHp * 0.5);
    $('ac').textContent = String(g.char.ac).padStart(3, '0');
    const w = g.inv.weapon;
    const ammo = w.ammo ? ` · ${g.inv.count(w.ammo)} пт.` : '';
    $('weapon-slot').querySelector('.w-name')!.textContent = g.inv.weaponName;
    $('weapon-slot').querySelector('.w-info')!.textContent = `ОД ${w.ap} · ${w.dmg[0]}–${w.dmg[1] + (w.melee ? g.char.meleeBonus : 0)}${ammo}`;

    const bar = $('ap-bar');
    const max = g.char.maxAp;
    if (bar.children.length !== max) {
      bar.innerHTML = '';
      for (let i = 0; i < max; i++) bar.appendChild(Object.assign(document.createElement('div'), { className: 'pip' }));
    }
    const inCombat = g.mode === 'combat';
    const ap = inCombat ? g.player.ap : max;
    [...bar.children].forEach((p, i) => {
      p.classList.toggle('on', i < ap - previewCost);
      p.classList.toggle('cost', inCombat && i >= ap - previewCost && i < ap);
    });
    const playerTurn = inCombat && g.isPlayerTurn;
    ($('btn-end') as HTMLButtonElement).disabled = !playerTurn;
    ($('btn-combat') as HTMLButtonElement).disabled = inCombat;
    const ti = $('turn-indicator');
    ti.className = inCombat ? (playerTurn ? 'player' : 'enemy') : '';
    ti.textContent = playerTurn ? 'ВАШ ХОД' : 'ХОД ПРОТИВНИКА';
  }

  // ─── Подсказка у курсора, всплывающие цифры, баннер ──────────────────────

  tooltip(html: string | null, x = 0, y = 0) {
    const t = $('tooltip');
    if (!html) {
      t.style.display = 'none';
      return;
    }
    t.innerHTML = html;
    t.style.display = 'block';
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }

  floatText(pos: THREE.Vector3, text: string, color: string) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    $('floaters').appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0 });
  }

  banner(text: string, sec = 1.6) {
    const b = $('banner');
    b.textContent = text;
    b.classList.add('show');
    this.bannerTimer = sec;
  }

  update(dt: number, camera: THREE.Camera) {
    const v = new THREE.Vector3();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      v.copy(f.pos).add(new THREE.Vector3(0, f.t * 0.9, 0)).project(camera);
      f.el.style.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
      f.el.style.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
      f.el.style.opacity = String(Math.min(1, 2.5 - f.t * 1.6));
      if (f.t > 1.6 || v.z > 1) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').classList.remove('show');
    }
  }

  // ─── Диалог ──────────────────────────────────────────────────────────────

  showDialogue(name: string, text: string, options: { text: string; check?: string }[], onPick: (i: number) => void) {
    $('dialogue').classList.remove('hidden');
    $('dlg-name').textContent = name;
    $('dlg-text').textContent = text;
    const box = $('dlg-options');
    box.innerHTML = '';
    options.forEach((o, i) => {
      const d = document.createElement('div');
      d.className = 'opt';
      d.innerHTML = `${i + 1}. ${o.check ? `<span class="chk">${esc(o.check)}</span> ` : ''}${esc(o.text)}`;
      d.addEventListener('click', () => onPick(i));
      box.appendChild(d);
    });
  }

  hideDialogue() { $('dialogue').classList.add('hidden'); }

  // ─── Панели ──────────────────────────────────────────────────────────────

  togglePanel(kind: PanelKind) {
    if (this.panel === kind) this.closePanel();
    else this.openPanel(kind);
  }

  openPanel(kind: PanelKind) {
    if (this.game.mode === 'dialogue' || this.game.mode === 'dead' || this.game.mode === 'menu') return;
    this.panel = kind;
    $('panel').classList.remove('hidden');
    this.renderPanel();
  }

  closePanel() {
    this.panel = null;
    $('panel').classList.add('hidden');
  }

  renderPanel() {
    if (!this.panel) return;
    const p = $('panel');
    if (this.panel === 'inv') p.innerHTML = this.inventoryHtml();
    else if (this.panel === 'cha') p.innerHTML = this.characterHtml();
    else p.innerHTML = this.pipboyHtml();
    p.querySelector('[data-close]')?.addEventListener('click', () => this.closePanel());
    p.querySelectorAll<HTMLElement>('[data-item]').forEach((el) =>
      el.addEventListener('click', () => {
        this.selectedItem = el.dataset.item!;
        this.renderPanel();
      }),
    );
    p.querySelectorAll<HTMLElement>('[data-use]').forEach((el) =>
      el.addEventListener('click', () => {
        this.game.useItem(el.dataset.use!);
        this.renderPanel();
      }),
    );
    p.querySelectorAll<HTMLElement>('[data-equip]').forEach((el) =>
      el.addEventListener('click', () => {
        this.game.equip(el.dataset.equip === '-' ? null : el.dataset.equip!);
        this.renderPanel();
      }),
    );
    p.querySelectorAll<HTMLElement>('[data-skill]').forEach((el) =>
      el.addEventListener('click', () => {
        this.game.spendSkillPoint(el.dataset.skill as SkillId);
        this.renderPanel();
      }),
    );
  }

  private inventoryHtml(): string {
    const g = this.game;
    const items = [...g.inv.items.entries()];
    if (this.selectedItem && !g.inv.count(this.selectedItem)) this.selectedItem = null;
    const sel = this.selectedItem ? ITEMS[this.selectedItem] : null;
    const list = items
      .map(([id, n]) => {
        const def = ITEMS[id];
        const eq = g.inv.equipped === id ? ' <span class="eq">[в руках]</span>' : '';
        return `<div class="item ${id === this.selectedItem ? 'sel' : ''}" data-item="${id}"><span>${esc(def.name)}${eq}</span><span>×${n}</span></div>`;
      })
      .join('') || '<div class="desc">Сумка пуста.</div>';
    let actions = '';
    if (sel) {
      if (sel.weapon) {
        actions += g.inv.equipped === sel.id
          ? `<button data-equip="-">Убрать</button>`
          : `<button data-equip="${sel.id}">Взять в руки</button>`;
      }
      if (sel.kind === 'consumable') actions += `<button data-use="${sel.id}">Использовать${g.mode === 'combat' ? ` (${sel.useAp} ОД)` : ''}</button>`;
    }
    const w = sel?.weapon;
    const stats = w
      ? `<div class="row"><span>Урон</span><span class="v">${w.dmg[0]}–${w.dmg[1]}</span></div>
         <div class="row"><span>Очки действия</span><span class="v">${w.ap}</span></div>
         <div class="row"><span>Дальность</span><span class="v">${w.range} м</span></div>
         <div class="row"><span>Навык</span><span class="v">${SKILLS.find((s) => s.id === w.skill)!.name} (${g.char.skill(w.skill)}%)</span></div>`
      : sel?.heal
        ? `<div class="row"><span>Лечение</span><span class="v">${sel.heal[0]}–${sel.heal[1]} ОЗ</span></div>`
        : '';
    return `
      <div class="panel-title"><span>ИНВЕНТАРЬ</span><button data-close>Закрыть [I]</button></div>
      <div class="panel-cols">
        <div class="box crt"><h3>Сумка</h3>${list}</div>
        <div class="box crt"><h3>${sel ? esc(sel.name) : 'Выберите предмет'}</h3>
          ${stats}
          <div class="desc">${sel ? esc(sel.desc) : ''}</div>
          <div class="actions">${actions}</div>
          <h3 style="margin-top:14px">В руках</h3>
          <div class="row"><span>${esc(g.inv.weaponName)}</span><span class="v">ОЗ ${g.char.hp}/${g.char.maxHp}</span></div>
        </div>
      </div>`;
  }

  private characterHtml(): string {
    const c = this.game.char;
    const special = SPECIAL_KEYS.map(
      (k) => `<div class="row" title="${esc(SPECIAL_INFO[k].desc)}"><span>${SPECIAL_INFO[k].name}</span><span class="v">${c.special[k]}</span></div>`,
    ).join('');
    const skills = SKILLS.map((s) => {
      const tag = c.tags.has(s.id) ? '<span class="eq">■</span> ' : '';
      const btn = c.skillPoints > 0 ? ` <button class="inline-btn" data-skill="${s.id}">+</button>` : '';
      return `<div class="row"><span>${tag}${s.name}</span><span class="v">${c.skill(s.id)}%${btn}</span></div>`;
    }).join('');
    return `
      <div class="panel-title"><span>${esc(c.name.toUpperCase())}</span><button data-close>Закрыть [C]</button></div>
      <div class="panel-cols">
        <div class="box crt"><h3>S.P.E.C.I.A.L.</h3>${special}
          <h3 style="margin-top:12px">Показатели</h3>
          <div class="row"><span>Очки здоровья</span><span class="v">${c.hp}/${c.maxHp}</span></div>
          <div class="row"><span>Очки действия</span><span class="v">${c.maxAp}</span></div>
          <div class="row"><span>Класс брони</span><span class="v">${c.ac}</span></div>
          <div class="row"><span>Урон в ближнем бою</span><span class="v">+${c.meleeBonus}</span></div>
          <div class="row"><span>Очерёдность</span><span class="v">${c.sequence}</span></div>
          <div class="row"><span>Шанс крит. удара</span><span class="v">${c.critChance}%</span></div>
        </div>
        <div class="box crt"><h3>Уровень ${c.level}</h3>
          <div class="row"><span>Опыт</span><span class="v">${c.xp} / ${c.nextLevelXp}</span></div>
          <div class="row"><span>Очки навыков</span><span class="v">${c.skillPoints}</span></div>
          <h3 style="margin-top:12px">Навыки</h3>${skills}
          <div class="desc">■ — отмеченные навыки: +20% и двойная отдача от очков.</div>
        </div>
      </div>`;
  }

  private pipboyHtml(): string {
    const g = this.game;
    const quests = Object.entries(g.quests)
      .map(([id, q]) => {
        const def = QUESTS[id];
        return `<div class="quest ${q.state === 'rewarded' ? 'done' : ''}"><div class="t">${esc(def.title)}</div><div>${esc(def.desc(q))}</div></div>`;
      })
      .join('') || '<div class="desc">Активных заданий нет. Поговори со Старейшиной.</div>';
    return `
      <div class="panel-title"><span>ПИП-БОЙ 2000</span><button data-close>Закрыть [P]</button></div>
      <div class="panel-cols">
        <div class="box crt"><h3>Задания</h3>${quests}</div>
        <div class="box crt"><h3>Статус</h3>
          <div class="row"><span>Дата</span><span class="v">${g.dateText()}</span></div>
          <div class="row"><span>Местность</span><span class="v">${esc(g.location.name)}</span></div>
          <div class="row"><span>Координаты</span><span class="v">${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)}</span></div>
          <div class="row"><span>Убито врагов</span><span class="v">${g.kills}</span></div>
          <h3 style="margin-top:12px">Заметки</h3>
          <div>${esc(LOCATION_NOTES[g.location.id] ?? 'Опасная пустошь. Уйти можно через любой край карты.')}</div>
          <div class="row" style="margin-top:8px"><span>Отряд</span><span class="v">${esc(g.party.map((a) => a.name).join(', ') || 'никого')}</span></div>
        </div>
      </div>`;
  }

  // ─── Полноэкранные экраны ────────────────────────────────────────────────

  private screen(html: string, dim = false): HTMLElement {
    const s = $('screen');
    s.className = dim ? 'dim' : '';
    s.innerHTML = html;
    return s;
  }

  get screenEl() { return $('screen'); }

  hideScreen() { $('screen').className = 'hidden'; }

  showMainMenu(hasSave: boolean, onNew: () => void, onLoad: () => void) {
    const s = this.screen(`
      <div class="menu">
        <div class="logo">ПУСТОШЬ 2241<small>АРРОЙО · 3D</small></div>
        <div class="buttons">
          <button id="m-new">Новая игра</button>
          <button id="m-load" ${hasSave ? '' : 'disabled'}>Загрузить</button>
        </div>
        <div class="note">Фанатское переосмысление Fallout 2 в полном 3D. Вся графика процедурная, ассеты оригинала не используются.</div>
      </div>`);
    s.querySelector('#m-new')!.addEventListener('click', onNew);
    s.querySelector('#m-load')!.addEventListener('click', onLoad);
  }

  showCreation(onDone: (c: Character) => void) {
    const c = new Character();
    const render = () => {
      const used = SPECIAL_KEYS.reduce((a, k) => a + c.special[k], 0);
      const left = SPECIAL_POOL - used;
      const rows = SPECIAL_KEYS.map(
        (k) => `<div class="sp-row" title="${esc(SPECIAL_INFO[k].desc)}">
          <span class="ab">${SPECIAL_INFO[k].abbr}</span><span>${SPECIAL_INFO[k].name}</span>
          <button class="inline-btn" data-dec="${k}" ${c.special[k] <= 1 ? 'disabled' : ''}>−</button>
          <span class="val">${c.special[k]}</span>
          <button class="inline-btn" data-inc="${k}" ${c.special[k] >= 10 || left <= 0 ? 'disabled' : ''}>+</button>
        </div>`,
      ).join('');
      const skills = SKILLS.map(
        (s) => `<div class="row tag ${c.tags.has(s.id) ? 'on' : ''}" data-tag="${s.id}"><span>${s.name}</span><span class="v">${c.skill(s.id)}%</span></div>`,
      ).join('');
      const s = this.screen(`
        <div id="panel-c" class="creation" style="position:relative;padding:14px;background:linear-gradient(160deg,#4a4033,#2a251d 50%,#1a1712);border:4px solid #6b5f4a;">
          <div class="panel-title"><span>СОЗДАНИЕ ПЕРСОНАЖА</span><span class="points">Очков: ${left}</span></div>
          <div class="crt intro">2241 год. Деревня Арройо. Ты — потомок Выходца из Убежища и только что прошёл Храм Испытаний. Племя ждёт от тебя многого.</div>
          <div class="panel-cols">
            <div class="box crt"><h3>Имя</h3><input id="c-name" maxlength="18" value="${esc(c.name)}" />
              <h3 style="margin-top:12px">S.P.E.C.I.A.L.</h3>${rows}
            </div>
            <div class="box crt"><h3>Отметь 3 навыка (${c.tags.size}/3)</h3>${skills}
              <h3 style="margin-top:12px">Показатели</h3>
              <div class="row"><span>Здоровье</span><span class="v">${c.maxHp}</span></div>
              <div class="row"><span>Очки действия</span><span class="v">${c.maxAp}</span></div>
              <div class="row"><span>Класс брони</span><span class="v">${c.ac}</span></div>
              <div class="row"><span>Урон в ближнем бою</span><span class="v">+${c.meleeBonus}</span></div>
              <div class="desc">${c.special.in <= 3 ? 'С таким интеллектом разговоры будут... особенными.' : 'Распредели все очки и отметь три навыка.'}</div>
            </div>
          </div>
          <div class="actions" style="justify-content:flex-end">
            <button id="c-start" ${left === 0 && c.tags.size === 3 ? '' : 'disabled'}>Начать игру</button>
          </div>
        </div>`, true);
      const nameInput = s.querySelector<HTMLInputElement>('#c-name')!;
      nameInput.addEventListener('input', () => (c.name = nameInput.value.trim() || 'Избранный'));
      s.querySelectorAll<HTMLElement>('[data-inc]').forEach((b) => b.addEventListener('click', () => {
        c.special[b.dataset.inc as keyof typeof c.special]++;
        render();
      }));
      s.querySelectorAll<HTMLElement>('[data-dec]').forEach((b) => b.addEventListener('click', () => {
        c.special[b.dataset.dec as keyof typeof c.special]--;
        render();
      }));
      s.querySelectorAll<HTMLElement>('[data-tag]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.tag as SkillId;
        if (c.tags.has(id)) c.tags.delete(id);
        else if (c.tags.size < 3) c.tags.add(id);
        render();
      }));
      s.querySelector('#c-start')!.addEventListener('click', () => {
        c.hp = c.maxHp;
        this.hideScreen();
        onDone(c);
      });
    };
    c.tags = new Set<SkillId>(['melee', 'speech', 'unarmed']);
    render();
  }

  showGameOver(onLoad: (() => void) | null, onRestart: () => void) {
    const s = this.screen(`
      <div class="menu">
        <div class="logo" style="color:#c8402a">ТЫ ПОГИБ<small>ПУСТОШЬ НЕ ПРОЩАЕТ ОШИБОК</small></div>
        <div class="buttons">
          ${onLoad ? '<button id="g-load">Загрузить сохранение</button>' : ''}
          <button id="g-new">Начать заново</button>
        </div>
      </div>`, true);
    s.querySelector('#g-load')?.addEventListener('click', () => onLoad?.());
    s.querySelector('#g-new')!.addEventListener('click', onRestart);
  }
}
