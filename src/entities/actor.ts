import * as THREE from 'three';
import { angleLerp, clamp } from '../core/math';
import { heightAt } from '../world/terrain';
import type { NavGrid, Cell } from '../world/nav';
import type { Rig } from './rigs';
import type { WeaponStats } from '../game/items';

export type Faction = 'player' | 'villager' | 'hostile' | 'animal' | 'companion';

export interface ActorDef {
  id: string;
  name: string;
  faction: Faction;
  rig: Rig;
  hp: number;
  ap: number;
  ac: number;
  /** Базовый шанс попадания для существ (у игрока считается по навыкам). */
  skill?: number;
  attack?: WeaponStats;
  xp?: number;
  sequence?: number;
  speed?: number;
  dialogue?: string;
  tag?: string;
  loot?: [string, number, number][];
  wanderRadius?: number;
  detectRadius?: number;
  /** Порог и сопротивление урону (естественная броня или одежда). */
  dt?: number;
  dr?: number;
}

export class Actor {
  readonly id: string;
  name: string;
  faction: Faction;
  rig: Rig;
  readonly pos = new THREE.Vector3();
  heading = 0;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  ac: number;
  skill: number;
  attack?: WeaponStats;
  xp: number;
  sequence: number;
  speed: number;
  readonly baseSpeed: number;
  dialogue?: string;
  tag?: string;
  loot: [string, number, number][];
  home = new THREE.Vector3();
  wanderRadius: number;
  detectRadius: number;
  dead = false;
  dt: number;
  dr: number;
  /** Искалеченные конечности после прицельных попаданий. */
  crippled = new Set<'arm' | 'leg'>();
  /** Следует за этим актёром (пёс за игроком). */
  follow: Actor | null = null;
  wanderTimer = Math.random() * 5;

  private path: THREE.Vector3[] = [];
  private onArrive: (() => void) | null = null;
  private curSpeed = 0;
  private targetHeading: number | null = null;

  constructor(def: ActorDef) {
    this.id = def.id;
    this.name = def.name;
    this.faction = def.faction;
    this.rig = def.rig;
    this.hp = this.maxHp = def.hp;
    this.ap = this.maxAp = def.ap;
    this.ac = def.ac;
    this.skill = def.skill ?? 50;
    this.attack = def.attack;
    this.xp = def.xp ?? 0;
    this.sequence = def.sequence ?? 5;
    this.speed = this.baseSpeed = def.speed ?? 3.2;
    this.dialogue = def.dialogue;
    this.tag = def.tag;
    this.loot = def.loot ?? [];
    this.wanderRadius = def.wanderRadius ?? 0;
    this.detectRadius = def.detectRadius ?? 0;
    this.dt = def.dt ?? 0;
    this.dr = def.dr ?? 0;
    this.rig.root.userData.actor = this;
  }

  get object() { return this.rig.root; }

  /** Замена модели (например, когда надели броню): переносим позицию и «хитбокс». */
  replaceRig(rig: Rig) {
    const old = this.rig.root;
    const parent = old.parent;
    const proxy = old.children.find((c) => c.userData.actor === this);
    if (proxy) rig.root.add(proxy);
    rig.root.position.copy(old.position);
    rig.root.rotation.copy(old.rotation);
    rig.root.userData.actor = this;
    if (parent) {
      parent.remove(old);
      parent.add(rig.root);
    }
    this.rig = rig;
  }
  get moving() { return this.path.length > 0; }

  place(x: number, z: number) {
    this.pos.set(x, heightAt(x, z), z);
    this.home.copy(this.pos);
    this.object.position.copy(this.pos);
  }

  cell(nav: NavGrid): Cell { return nav.cellOf(this.pos.x, this.pos.z); }

  distanceTo(o: Actor | THREE.Vector3) {
    const p = o instanceof Actor ? o.pos : o;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  faceTowards(p: THREE.Vector3) {
    this.targetHeading = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Движение по точкам; промис завершается по прибытии или при остановке. */
  moveAlong(points: THREE.Vector3[]): Promise<void> {
    this.stop();
    // Неподвижные (турели) никуда не идут.
    if (this.speed <= 0) return Promise.resolve();
    this.path = points.map((p) => p.clone());
    return new Promise((resolve) => {
      if (this.path.length === 0) resolve();
      else this.onArrive = resolve;
    });
  }

  stop() {
    this.path = [];
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  /** Прямое управление (WASD): шаг на вектор, если клетка проходима. */
  steer(dir: THREE.Vector3, dt: number, nav: NavGrid) {
    if (this.path.length) this.stop();
    const step = dir.clone().multiplyScalar(this.speed * 1.1 * dt);
    const tryMove = (dx: number, dz: number) => {
      const nx = this.pos.x + dx;
      const nz = this.pos.z + dz;
      // Проверяем точку чуть впереди, чтобы не «влипать» в стены.
      const [i, j] = nav.cellOf(nx + Math.sign(dx) * 0.3, nz + Math.sign(dz) * 0.3);
      if (!nav.isWalkable(i, j)) return false;
      this.pos.x = nx;
      this.pos.z = nz;
      return true;
    };
    if (!tryMove(step.x, step.z)) {
      tryMove(step.x, 0) || tryMove(0, step.z);
    }
    this.targetHeading = Math.atan2(dir.x, dir.z);
    this.curSpeed = this.speed * 1.1;
  }

  update(dt: number) {
    if (this.path.length > 0 && !this.dead) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        this.path.shift();
        if (this.path.length === 0) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.targetHeading = Math.atan2(dx, dz);
      }
      this.curSpeed = this.speed;
    }
    if (this.targetHeading !== null && !this.dead) {
      this.heading = angleLerp(this.heading, this.targetHeading, clamp(dt * 10, 0, 1));
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.heading;
    this.rig.update(dt, this.curSpeed);
    // curSpeed от WASD держится только один кадр.
    if (this.path.length === 0) this.curSpeed = 0;
  }
}
