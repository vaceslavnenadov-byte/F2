import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { wanamingo } from '../../game/bestiary';

const EXIT = { x: -46, z: 0, r: 3 };
export const NEST = { x: 30, z: 2 };

/** Проходы шахты: отрезки с радиусом. Всё, что вне них, — скала. */
const TUNNELS: [number, number, number, number, number][] = [
  [-48, 0, -14, 2, 3.2],
  [-14, 2, 0, 0, 3.6],
  [0, 0, -4, -18, 3],
  [-4, -18, 8, -26, 5.5],
  [0, 0, 6, 16, 3],
  [6, 16, -6, 26, 5],
  [0, 0, 18, 2, 3.4],
  [18, 2, NEST.x, NEST.z, 3.4],
  [NEST.x, NEST.z, NEST.x + 4, NEST.z, 10],
  [8, -26, 22, -16, 2.6],
  [22, -16, NEST.x - 4, NEST.z - 6, 2.6],
];

function segDist(x: number, z: number, [ax, az, bx, bz]: number[]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/** Насколько точка внутри выработки (>0 — внутри, метры до стены). */
function inside(x: number, z: number) {
  let best = -Infinity;
  for (const s of TUNNELS) best = Math.max(best, s[4] - segDist(x, z, s));
  return best;
}

function build(w: World, flags: Set<string>) {
  // Проходимость: всё вне выработок — скала.
  const nav = w.nav;
  for (let j = 0; j < nav.n; j++) {
    for (let i = 0; i < nav.n; i++) {
      const c = nav.center(i, j);
      if (inside(c.x, c.z) < 0.6) nav.blocked[nav.idx(i, j)] = 1;
    }
  }
  // Стены: глыбы по краю выработок.
  const rockGeo = jitter(new THREE.IcosahedronGeometry(1, 2), 0.25, 1.4, 41);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#4a4038', normalMap: w.mat.stone.normalMap, roughness: 0.95 });
  const spots: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  for (let z = -50; z <= 50; z += 1.6) {
    for (let x = -56; x <= 56; x += 1.6) {
      const d = inside(x, z);
      if (d > -0.2 || d < -2.6) continue;
      const h = 2.6 + ((x * 13 + z * 7) & 3) * 0.6;
      q.setFromEuler(new THREE.Euler(x, z, x * z));
      spots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h * 0.4, z), q, new THREE.Vector3(1.3, h, 1.3)));
    }
  }
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, spots.length);
  spots.forEach((m, i) => rocks.setMatrixAt(i, m));
  rocks.castShadow = rocks.receiveShadow = true;
  w.group.add(rocks);

  // Крепь и рельсы в штольне у входа.
  for (let x = -44; x <= -18; x += 6) {
    const frame = new THREE.Group();
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), w.mat.darkWood);
      post.position.set(0, 1.6, sz * 2.4);
      frame.add(post);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 5.2), w.mat.darkWood);
    cap.position.y = 3.2;
    frame.add(cap);
    w.place(frame, x, 0.6, 0, 0);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.08), w.mat.rust);
  for (const dz of [-0.5, 0.5]) {
    const r = rail.clone();
    r.position.set(-30, 0.05, 0.8 + dz);
    w.group.add(r);
  }
  const cart = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.2), w.mat.rust);
  tub.position.y = 0.7;
  cart.add(tub);
  w.place(cart, -26, 0.8, 0.1, 0);
  w.nav.blockCircle(-26, 0.8, 1);

  // Свет: редкие шахтёрские лампы и зелёное свечение гнезда.
  for (const [x, z] of [[-40, 0], [-22, 2], [-2, 0], [-2, -22], [2, 22], [16, 2]]) {
    const l = new THREE.PointLight(0xffb060, 9, 14, 1.7);
    l.position.set(x, 2.6, z);
    w.group.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffb060', emissiveIntensity: 3 }));
    bulb.position.copy(l.position);
    w.group.add(bulb);
  }
  const nestGlow = new THREE.PointLight(0x70ff60, flags.has('eggsDestroyed') ? 2 : 10, 20, 1.6);
  nestGlow.position.set(NEST.x + 3, 2.4, NEST.z);
  w.group.add(nestGlow);

  // Кладка яиц ванаминго.
  if (!flags.has('eggsDestroyed')) {
    const eggs = new THREE.Group();
    const eggMat = new THREE.MeshPhysicalMaterial({ color: '#8a9a70', emissive: '#304a20', emissiveIntensity: 0.8, roughness: 0.3, clearcoat: 1, transmission: 0.2 });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39;
      const r = 0.3 + (i % 3) * 0.4;
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), eggMat);
      egg.scale.set(1, 1.35, 1);
      egg.position.set(Math.cos(a) * r, 0.38, Math.sin(a) * r);
      eggs.add(egg);
    }
    w.place(eggs, NEST.x + 7, NEST.z, 0, 0);
    w.nav.blockCircle(NEST.x + 7, NEST.z, 1.4);
    w.interactable({ id: 'wanaEggs', name: 'Кладка яиц', object: eggs, approach: new THREE.Vector3(NEST.x + 4.6, 0, NEST.z) });
  }
  // Кости шахтёров.
  const boneMat = new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 0.8 });
  for (const [x, z] of [[NEST.x - 2, NEST.z + 5], [NEST.x + 2, NEST.z - 6], [-2, -26], [-6, 24]]) {
    const b = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), boneMat);
    skull.position.y = 0.12;
    b.add(skull);
    for (let k = 0; k < 4; k++) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), boneMat);
      bone.rotation.set(Math.PI / 2, k * 1.3, 0);
      bone.position.set(0.3 + k * 0.1, 0.04, k * 0.12 - 0.2);
      b.add(bone);
    }
    w.place(b, x, z, x, 0);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  const spots: [number, number][] = [[-6, -20], [6, -27], [8, 18], [-4, 26], [20, 1], [16, -18]];
  spots.forEach(([x, z], i) => add(wanamingo(`wana${i}`), x, z, 0.7));
  add(wanamingo('wanaQueen', true), NEST.x + 2, NEST.z, 0.9);
}

export const KOKOWEEF: LocationDef = {
  id: 'kokoweef',
  name: 'Шахта Кокавиф',
  indoor: true,
  terrain: {
    seed: 16,
    hills: 0,
    flatZones: [{ x: 0, z: 0, r: 80 }],
    mesas: [],
    paths: [],
    groundZones: [{ x: NEST.x + 3, z: NEST.z, r: 10, color: '#3a4a2a', strength: 0.8 }],
    palette: { sand: '#3a3028', sandDark: '#2a221c', rock: '#2a2420', rockLight: '#3a3430', dirt: '#2e2620' },
  },
  entries: { default: [-40, 0], world: [-40, 0] },
  exits: [EXIT],
  scatter: { rocks: 0, trees: 0, grass: 0, reserved: [] },
  build,
  spawn,
  onExit(g) {
    g.leaveMine();
    return true;
  },
};
