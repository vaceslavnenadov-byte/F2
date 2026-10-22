import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { brahmin, human, SKIN } from '../../game/bestiary';
import { bunker } from './sierra';

const EXIT = { x: -60, z: 0, r: 4 };

/** Отрезок бетонной стены с зубцами. */
function wallSeg(w: World, ax: number, az: number, bx: number, bz: number) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 3.4, 0.9), w.mat.concrete);
  m.position.y = 1.4;
  g.add(m);
  for (let i = 0; i < len / 2.4; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), w.mat.concrete);
    c.position.set(-len / 2 + 0.6 + i * 2.4, 3.3, 0);
    g.add(c);
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = o.receiveShadow = true) : null));
  w.place(g, (ax + bx) / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax), 0.3);
  const n = Math.ceil(len * 2);
  for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.7);
}

/** Торговый прилавок под навесом. */
function stall(w: World, x: number, z: number, rot: number, color: string) {
  const g = new THREE.Group();
  for (const [sx, sz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), w.mat.darkWood);
    post.position.set(sx, 1.2, sz);
    g.add(post);
  }
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 2.2), new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
  cloth.position.y = 2.4;
  cloth.rotation.x = 0.12;
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), w.mat.planks);
  table.position.set(0, 0.45, 0.6);
  g.add(cloth, table);
  for (let i = 0; i < 4; i++) {
    const good = w.crate(0.3);
    good.position.set(-0.9 + i * 0.6, 1.05, 0.6);
    g.add(good);
  }
  w.place(g, x, z, rot, 0);
  w.nav.blockRect(x, z, 1.5, 1.1, rot);
}

/** Флаг Республики: золотой медведь на синем. */
function flag(w: World, x: number, z: number) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), w.mat.metal);
  pole.position.y = 3.5;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2, 8, 2), new THREE.MeshStandardMaterial({ color: '#2a3a6a', roughness: 0.9, side: THREE.DoubleSide }));
  cloth.position.set(1.05, 6.3, 0);
  const bear = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), new THREE.MeshStandardMaterial({ color: '#c8a030', side: THREE.DoubleSide }));
  bear.position.set(1.05, 6.3, 0.01);
  g.add(pole, cloth, bear);
  w.place(g, x, z, 0, 0);
  w.nav.blockCircle(x, z, 0.3);
}

function build(w: World) {
  // Городская стена с воротами на западе.
  wallSeg(w, -40, -34, 40, -34);
  wallSeg(w, -40, 34, 40, 34);
  wallSeg(w, 40, -34, 40, 34);
  wallSeg(w, -40, -34, -40, -5);
  wallSeg(w, -40, 5, -40, 34);
  for (const z of [-7, 7]) {
    const tower = new THREE.Group();
    const t = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), w.mat.concrete);
    t.position.y = 3;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), w.mat.metal);
    roof.position.y = 6.2;
    tower.add(t, roof);
    w.placeFlat(tower, -40, z, 0, 2);
    w.nav.blockRect(-40, z, 1.6, 1.6);
  }
  // Капитолий, штаб рейнджеров, казармы.
  bunker(w, 0, -22, 18, 10, 6, 0, 'Капитолий');
  bunker(w, 24, 6, 10, 8, 4, -Math.PI / 2, 'Рейнджеры');
  bunker(w, -22, -22, 10, 7, 3.5, 0, 'Казармы');
  flag(w, -4, -14);
  flag(w, 4, -14);
  flag(w, 18, 10);
  // Базар: прилавки вдоль главной улицы.
  stall(w, -24, 8, Math.PI, '#8a3a2a');
  stall(w, -16, 8, Math.PI, '#3a6a4a');
  stall(w, -8, 8, Math.PI, '#c8a040');
  stall(w, -20, -6, 0, '#4a4a8a');
  w.burningBarrel(-12, 0);
  w.burningBarrel(10, -6);
  // Скотные загоны баронов-браминоводов.
  w.fence([[-30, 18], [-6, 18], [-6, 30], [-30, 30]], true);
  w.place(w.waterTower(), 30, 24, 0.2, 0);
  for (const [x, z] of [[28.9, 22.9], [31.1, 22.9], [28.9, 25.1], [31.1, 25.1]]) w.nav.blockCircle(x, z, 0.5);
  for (const [x, z] of [[8, 20], [-34, -26], [34, -26]]) w.tree(x, z, 1.1, 0);
}

function ranger(id: string, name: string, dialogue = 'ncrRanger', wander = 5) {
  return human(id, name, { skin: [SKIN.a, SKIN.b, SKIN.c][id.length % 3], cloth: '#4a4030', hair: '#2a1a10', armor: 'leather', build: 1.05 }, 'rifle', {
    dialogue, wanderRadius: wander, hp: 50, ac: 12, skill: 70, dt: 2, dr: 0.25,
  });
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('tandi', 'Президент Танди', { skin: SKIN.a, cloth: '#3a3a4a', hair: '#d8d4cc', top: '#5a4a6a', build: 0.85 }, 'none', { dialogue: 'tandi' }), 0, -15.5);
  add(ranger('rangerCmd', 'Рейнджер Кэролайн', 'rangerCmd', 0), 18, 6);
  add(ranger('ranger1', 'Рейнджер'), -34, -2);
  add(ranger('ranger2', 'Рейнджер'), -34, 3);
  add(ranger('ranger3', 'Рейнджер', 'ncrRanger', 10), 6, -6);
  add(human('buster', 'Торговец Бастер', { skin: SKIN.b, cloth: '#5a4a3a', hair: '#1a1210', top: '#8a6a3a', beard: true }, 'none', { dialogue: 'buster' }), -16, 6);
  const folk: [number, number][] = [[-22, 2], [-6, 2], [6, 12], [-28, -12], [12, -2]];
  folk.forEach(([x, z], i) =>
    add(human(`ncr${i}`, i % 2 ? 'Горожанка' : 'Горожанин', { skin: [SKIN.a, SKIN.b, SKIN.c, SKIN.pale][i % 4], cloth: ['#4a4a5a', '#5a4a3a', '#3a4a3a'][i % 3], hair: ['#2a1a10', '#8a5a2a', '#4a4a40'][i % 3], top: i % 2 ? '#6a5a4a' : undefined, build: i % 2 ? 0.9 : 1 }, 'none', { dialogue: 'ncrFolk', wanderRadius: 7 }), x, z),
  );
  for (let i = 0; i < 4; i++) add(brahmin(`nbrahmin${i}`), -26 + i * 6, 24);
}

export const NCR: LocationDef = {
  id: 'ncr',
  name: 'НКР',
  terrain: {
    seed: 17,
    hills: 4,
    flatZones: [{ x: 0, z: 0, r: 52 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 56, z: -50, r: 12, h: 10 }, { x: 60, z: 46, r: 10, h: 8 }],
    paths: [[[-60, 0], [-40, 0], [20, 0], [24, 6]], [[0, 0], [0, -16]]],
    groundZones: [{ x: 0, z: 0, r: 38, color: '#8a8070', strength: 0.5 }],
    palette: { sand: '#b8a07a', sandDark: '#9a845e', rock: '#7a6650', rockLight: '#9a846a', dirt: '#6e6048' },
  },
  entries: { default: [-52, 0], world: [-52, 0] },
  exits: [EXIT],
  nightAmbient: 0.35,
  scatter: { rocks: 160, trees: 10, grass: 1600, reserved: [{ x: 0, z: 0, r: 44 }] },
  build,
  spawn,
};
