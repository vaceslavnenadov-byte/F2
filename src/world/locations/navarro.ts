import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { enclaveSoldier } from '../../game/bestiary';
import { vertibird } from '../props';

const EXIT = { x: 0, z: 56, r: 4 };
/** Периметр базы: внутри без допуска — тревога. */
const BASE = { x0: -22, x1: 30, z0: -28, z1: 20 };
const GATE_X = 5;
export const NAVARRO_SOLDIERS = ['navgate', 'navsoldier1', 'navsoldier2', 'navsoldier3', 'navsoldier4', 'quartermaster'];

function build(w: World) {
  const b = BASE;
  // Сетчатый забор с колючкой и воротами на юге.
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#6a6c70', roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.55 });
  const postMat = w.mat.metal;
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), fenceMat);
    mesh.material.side = THREE.DoubleSide;
    mesh.position.set((ax + bx) / 2, w.y((ax + bx) / 2, (az + bz) / 2) + 1.3, (az + bz) / 2);
    mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    w.group.add(mesh);
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const px = ax + ((bx - ax) * i) / n;
      const pz = az + ((bz - az) * i) / n;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 6), postMat);
      post.position.set(px, w.y(px, pz) + 1.45, pz);
      post.castShadow = true;
      w.group.add(post);
    }
    const m = Math.ceil(len * 2);
    for (let i = 0; i <= m; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / m, az + ((bz - az) * i) / m, 0.45);
  };
  fence(b.x0, b.z0, b.x1, b.z0);
  fence(b.x0, b.z0, b.x0, b.z1);
  fence(b.x1, b.z0, b.x1, b.z1);
  fence(b.x0, b.z1, GATE_X - 2.5, b.z1);
  fence(GATE_X + 2.5, b.z1, b.x1, b.z1);

  // Вертолётная площадка с винтокрылом.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.2, 40), new THREE.MeshStandardMaterial({ color: '#3a3c40', roughness: 0.8 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c8a020' }));
  ring.position.y = 0.12;
  const pg = new THREE.Group();
  pg.add(pad, ring);
  w.placeFlat(pg, 14, -10, 0, 8);
  const vb = vertibird(w);
  w.placeFlat(vb, 14, -10, 0.6, 6);
  vb.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  w.nav.blockRect(14, -10, 2, 6, 0.6);
  w.nav.blockRect(14, -10, 6, 1.2, 0.6);

  // Казармы и командный бункер.
  const barracks = (x: number, z: number, rot: number, seed: number) => {
    const s = w.shack(10, 6, 3.2, seed);
    s.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === w.mat.planks ? ((o as THREE.Mesh).material = w.mat.tin) : null));
    w.placeFlat(s, x, z, rot, 5.5);
    w.nav.blockRect(x, z, 5.3, 3.3, rot);
  };
  barracks(-12, -18, 0, 41);
  barracks(-12, 6, Math.PI, 42);
  const bunker = new THREE.Group();
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(10, 4, 8, 4, 2, 4), 0.05, 1, 5), w.mat.concrete);
  body.position.y = 2;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), w.mat.void);
  door.position.set(0, 1.2, 4.05);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6, 6), w.mat.metal);
  antenna.position.set(3, 7, -2);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), w.mat.metal);
  dish.position.set(-3, 4.6, -1);
  dish.rotation.x = -0.8;
  bunker.add(body, door, antenna, dish);
  w.placeFlat(bunker, 18, 10, Math.PI, 6);
  w.nav.blockRect(18, 10, 5.3, 4.3);
  const terminal = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.6), w.mat.metal);
  tb.position.y = 0.65;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ color: '#100808', emissive: '#ff6040', emissiveIntensity: 1.3 }));
  scr.position.set(0, 1.05, 0.31);
  terminal.add(tb, scr);
  w.place(terminal, 14, 5, Math.PI, 0);
  w.nav.blockCircle(14, 5, 0.6);
  w.interactable({ id: 'navTerminal', name: 'Терминал командного бункера', object: terminal, approach: new THREE.Vector3(14, 0, 3.3) });

  // Прожекторы на вышках.
  for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) {
    const tower = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 5, 6), w.mat.metal);
    legs.position.y = 2.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), w.mat.metal);
    top.position.y = 5.2;
    tower.add(legs, top);
    w.place(tower, x, z, 0, 0);
    const spot = new THREE.SpotLight(0xfff4d8, 30, 30, 0.45, 0.5, 1.5);
    spot.position.set(x, w.y(x, z) + 5.6, z);
    spot.target.position.set(x * 0.5 + 4, 0, z * 0.5 - 4);
    w.group.add(spot, spot.target);
    w.nav.blockCircle(x, z, 0.6);
  }
  for (const [x, z] of [[-4, -8], [-3, -9.5], [26, -22], [-18, 14]]) {
    const c = w.crate(0.9);
    c.position.y = 0.45;
    const g = new THREE.Group();
    g.add(c);
    w.place(g, x, z, x, 0);
    w.nav.blockCircle(x, z, 0.6);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  const alarm = g.flags.has('navarroAlarm');
  const mk = (id: string, dialogue: string, wander = 0) => {
    const s = enclaveSoldier(id, { dialogue, wanderRadius: wander });
    if (alarm) {
      s.faction = 'hostile';
      s.dialogue = undefined;
      s.detectRadius = 16;
    }
    return s;
  };
  const gate = mk('navgate', 'navGate');
  gate.name = 'Сержант Дорнан';
  add(gate, GATE_X + 3, BASE.z1 + 2);
  add(mk('navsoldier1', 'enclaveTalk', 5), -4, -2);
  add(mk('navsoldier2', 'enclaveTalk', 5), 8, -20);
  add(mk('navsoldier3', 'enclaveTalk', 4), 22, 2);
  add(mk('navsoldier4', 'enclaveTalk', 6), -14, -6);
  const qm = mk('quartermaster', 'quartermaster');
  qm.name = 'Интендант Белл';
  add(qm, -12, 2);
}

export const NAVARRO: LocationDef = {
  id: 'navarro',
  name: 'Наварро',
  terrain: {
    seed: 9,
    hills: 6,
    flatZones: [{ x: 4, z: -4, r: 40 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 45, z: -40, r: 10, h: 10 }, { x: 50, z: 30, r: 8, h: 8 }],
    paths: [[[0, 56], [GATE_X, 30], [GATE_X, 0], [14, -4]], [[GATE_X, 0], [-12, -6]]],
    groundZones: [{ x: 4, z: -4, r: 30, color: '#5a5a52', strength: 0.55 }],
    palette: { sand: '#a89a7c', sandDark: '#8a7e64', rock: '#6a6056', rockLight: '#8a8074', dirt: '#5a564c' },
    coast: { x: -42, depth: 10, width: 6 },
    water: -1.2,
  },
  entries: { default: [0, 48], world: [0, 48] },
  exits: [EXIT],
  scatter: { rocks: 220, trees: 30, grass: 2400, reserved: [{ x: 4, z: -4, r: 34 }] },
  build,
  spawn,
  update(g) {
    // Посторонний за забором — тревога.
    if (g.flags.has('navarroIn') || g.flags.has('navarroAlarm')) return;
    const p = g.player.pos;
    if (p.x > BASE.x0 && p.x < BASE.x1 && p.z > BASE.z0 && p.z < BASE.z1) {
      g.ui.log('ТРЕВОГА! Посторонний на базе!', 'bad');
      g.turnHostile(NAVARRO_SOLDIERS, 'navarroAlarm');
    }
  },
};
