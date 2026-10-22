import * as THREE from 'three';
import { heightAt } from './terrain';
import { WORLD_SIZE } from './config';

export type Cell = [number, number];

const DIRS: Cell[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

export interface PathOptions {
  /** Клетки, занятые другими существами. */
  occupied?: Set<number>;
  /** Стоимость диагонального шага: ~1.41 для естественного пути, ~1 для пошагового боя (там шаг = 1 ОД). */
  diagCost?: number;
  maxCost?: number;
}

/** Сетка проходимости 1×1 м поверх рельефа и A* по ней. */
export class NavGrid {
  readonly n = WORLD_SIZE;
  readonly blocked: Uint8Array;

  constructor() {
    this.blocked = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const p = this.center(i, j);
        const h = p.y;
        let maxDiff = 0;
        for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
          maxDiff = Math.max(maxDiff, Math.abs(heightAt(p.x + dx, p.z + dz) - h));
        }
        const edge = Math.max(Math.abs(p.x), Math.abs(p.z));
        if (maxDiff > 0.45 || edge > WORLD_SIZE / 2 - 6) this.blocked[this.idx(i, j)] = 1;
      }
    }
  }

  idx(i: number, j: number) { return j * this.n + i; }
  inBounds(i: number, j: number) { return i >= 0 && j >= 0 && i < this.n && j < this.n; }

  cellOf(x: number, z: number): Cell {
    return [Math.floor(x + WORLD_SIZE / 2), Math.floor(z + WORLD_SIZE / 2)];
  }

  center(i: number, j: number): THREE.Vector3 {
    const x = i - WORLD_SIZE / 2 + 0.5;
    const z = j - WORLD_SIZE / 2 + 0.5;
    return new THREE.Vector3(x, heightAt(x, z), z);
  }

  isWalkable(i: number, j: number, occupied?: Set<number>) {
    if (!this.inBounds(i, j)) return false;
    const k = this.idx(i, j);
    return this.blocked[k] === 0 && !(occupied && occupied.has(k));
  }

  blockCircle(x: number, z: number, r: number) {
    const [ci, cj] = this.cellOf(x, z);
    const R = Math.ceil(r) + 1;
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (!this.inBounds(i, j)) continue;
        const c = this.center(i, j);
        if (Math.hypot(c.x - x, c.z - z) <= r) this.blocked[this.idx(i, j)] = 1;
      }
    }
  }

  /** Повёрнутый прямоугольник (локальные полуразмеры hw × hd). */
  blockRect(cx: number, cz: number, hw: number, hd: number, rotY = 0) {
    const R = Math.ceil(Math.hypot(hw, hd)) + 1;
    const [ci, cj] = this.cellOf(cx, cz);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (!this.inBounds(i, j)) continue;
        const c = this.center(i, j);
        const dx = c.x - cx;
        const dz = c.z - cz;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[this.idx(i, j)] = 1;
      }
    }
  }

  unblockCircle(x: number, z: number, r: number) {
    const [ci, cj] = this.cellOf(x, z);
    const R = Math.ceil(r) + 1;
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (!this.inBounds(i, j)) continue;
        const c = this.center(i, j);
        if (Math.hypot(c.x - x, c.z - z) <= r) this.blocked[this.idx(i, j)] = 0;
      }
    }
  }

  /**
   * A* до первой клетки, удовлетворяющей goal. Возвращает путь без стартовой клетки
   * (пустой массив — уже на месте, null — недостижимо).
   */
  search(start: Cell, goal: (i: number, j: number) => boolean, heuristic: (i: number, j: number) => number, opts: PathOptions = {}): Cell[] | null {
    const diag = opts.diagCost ?? 1.41;
    const maxCost = opts.maxCost ?? Infinity;
    if (goal(start[0], start[1])) return [];
    const startK = this.idx(start[0], start[1]);
    const g = new Map<number, number>([[startK, 0]]);
    const from = new Map<number, number>();
    const closed = new Set<number>();
    const open = new MinHeap();
    open.push(startK, heuristic(start[0], start[1]));
    let expanded = 0;
    while (open.size > 0 && expanded < 30000) {
      const k = open.pop();
      if (closed.has(k)) continue;
      closed.add(k);
      expanded++;
      const i = k % this.n;
      const j = (k - i) / this.n;
      if (k !== startK && goal(i, j)) {
        const path: Cell[] = [];
        let cur = k;
        while (cur !== startK) {
          const ci = cur % this.n;
          path.push([ci, (cur - ci) / this.n]);
          cur = from.get(cur)!;
        }
        return path.reverse();
      }
      const gk = g.get(k)!;
      for (const [dx, dj] of DIRS) {
        const ni = i + dx;
        const nj = j + dj;
        if (!this.isWalkable(ni, nj, opts.occupied)) continue;
        const isDiag = dx !== 0 && dj !== 0;
        // Не срезаем углы препятствий по диагонали.
        if (isDiag && (!this.isWalkable(i + dx, j, opts.occupied) || !this.isWalkable(i, j + dj, opts.occupied))) continue;
        const nk = this.idx(ni, nj);
        const ng = gk + (isDiag ? diag : 1);
        if (ng > maxCost) continue;
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          from.set(nk, k);
          open.push(nk, ng + heuristic(ni, nj));
        }
      }
    }
    return null;
  }

  findPath(start: Cell, target: Cell, opts: PathOptions = {}): Cell[] | null {
    const diag = opts.diagCost ?? 1.41;
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - target[0]);
      const dy = Math.abs(j - target[1]);
      return dx + dy + (diag - 2) * Math.min(dx, dy);
    };
    return this.search(start, (i, j) => i === target[0] && j === target[1], h, opts);
  }

  /** Путь до любой свободной клетки на расстоянии ≤ range от цели (подход для атаки или разговора). */
  findPathToRange(start: Cell, target: Cell, range: number, opts: PathOptions = {}): Cell[] | null {
    const diag = opts.diagCost ?? 1.41;
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - target[0]);
      const dy = Math.abs(j - target[1]);
      return Math.max(0, dx + dy + (diag - 2) * Math.min(dx, dy) - range);
    };
    const goal = (i: number, j: number) => Math.hypot(i - target[0], j - target[1]) <= range;
    return this.search(start, goal, h, opts);
  }

  /** Есть ли прямая проходимая линия между клетками (для сглаживания пути). */
  lineWalkable(a: Cell, b: Cell, occupied?: Set<number>): boolean {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a[0] + 0.5 + (b[0] - a[0]) * t;
      const z = a[1] + 0.5 + (b[1] - a[1]) * t;
      // Проверяем небольшой «коридор», чтобы не задевать углы.
      for (const [ox, oz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
        if (!this.isWalkable(Math.floor(x + ox), Math.floor(z + oz), occupied)) return false;
      }
    }
    return true;
  }

  smooth(start: Cell, path: Cell[]): Cell[] {
    if (path.length < 2) return path;
    const out: Cell[] = [];
    let anchor = start;
    let i = 0;
    while (i < path.length) {
      let far = i;
      for (let k = path.length - 1; k > i; k--) {
        if (this.lineWalkable(anchor, path[k])) {
          far = k;
          break;
        }
      }
      out.push(path[far]);
      anchor = path[far];
      i = far + 1;
    }
    return out;
  }

  nearestWalkable(i: number, j: number, occupied?: Set<number>): Cell | null {
    for (let r = 0; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.isWalkable(i + di, j + dj, occupied)) return [i + di, j + dj];
        }
      }
    }
    return null;
  }
}
