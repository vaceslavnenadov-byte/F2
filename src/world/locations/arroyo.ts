import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import { DESERT_PALETTE } from '../terrain';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { brahmin, gecko, human, SKIN } from '../../game/bestiary';

const VILLAGE = { x: 0, z: 0 };
const TEMPLE = { x: 0, z: -50 };
const NEST = { x: 56, z: 2 };
export const DOG_SPOT = { x: -50, z: -40 };
const PEN = { x: -25, z: -4 };
export const NAGOR_HOME = { x: -12.5, z: 9.5 };
const EXIT = { x: 0, z: 55, r: 4 };

function buildVillage(w: World) {
  const { x: vx, z: vz } = VILLAGE;
  const huts = [
    { x: 0, z: -17, r: 4.2, h: 3.0 },
    { x: -14, z: -8, r: 2.8, h: 2.4 },
    { x: 14, z: -9, r: 2.8, h: 2.4 },
    { x: -17, z: 7, r: 3.0, h: 2.5 },
    { x: 16, z: 9, r: 2.6, h: 2.3 },
    { x: -7, z: 16, r: 2.5, h: 2.3 },
    { x: 8, z: 17, r: 2.7, h: 2.4 },
  ];
  huts.forEach((hd, i) => {
    const x = vx + hd.x;
    const z = vz + hd.z;
    w.place(w.hut(hd.r, hd.h, i * 13 + 3), x, z, Math.atan2(vx - x, vz - z), 0.15);
    w.nav.blockCircle(x, z, hd.r + 0.4);
    for (let k = 0; k < 2; k++) {
      const a = Math.atan2(vx - x, vz - z) + (k ? 0.9 : -0.9);
      const p = w.pot();
      p.scale.setScalar(0.8 + w.rnd() * 0.6);
      w.place(p, x + Math.sin(a) * (hd.r + 0.5), z + Math.cos(a) * (hd.r + 0.5), w.rnd() * 6, 0.02);
    }
  });

  // Костёр в центре.
  const fire = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.22, 1), 0.12, 3, i), w.mat.stone);
    s.position.set(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85);
    fire.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), w.mat.darkWood);
    log.rotation.z = Math.PI / 2 - 0.5;
    log.position.y = 0.3;
    const holder = new THREE.Group();
    holder.add(log);
    holder.rotation.y = (i / 4) * Math.PI;
    fire.add(holder);
  }
  w.place(fire, vx, vz, 0, 0);
  w.addFlame(new THREE.Vector3(vx, w.y(vx, vz) + 0.3, vz), 30, 1);
  w.nav.blockCircle(vx, vz, 1.3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.2, 8), w.mat.wood);
    bench.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(bench);
    const bx = vx + Math.cos(a) * 3.6;
    const bz = vz + Math.sin(a) * 3.6;
    w.place(holder, bx, bz, -a + Math.PI / 2, -0.15);
    w.nav.blockRect(bx, bz, 1.0, 0.3, -a + Math.PI / 2);
  }

  // Частокол с проходами на восток (гнездо), север (храм), северо-запад (пёс) и юг (дорога в пустошь).
  const gaps = [0, -Math.PI / 2, Math.atan2(DOG_SPOT.z, DOG_SPOT.x), Math.PI / 2];
  const R = 26;
  const postGeo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
  const postsMatrices: THREE.Matrix4[] = [];
  const steps = Math.floor((Math.PI * 2 * R) / 0.55);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2 - Math.PI;
    if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.13)) continue;
    const x = vx + Math.cos(a) * R;
    const z = vz + Math.sin(a) * R;
    const h = 1.6 + w.rnd() * 0.7;
    postsMatrices.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, w.y(x, z) + h / 2 - 0.15, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((w.rnd() - 0.5) * 0.12, 0, (w.rnd() - 0.5) * 0.12)),
      new THREE.Vector3(1, h, 1),
    ));
    w.nav.blockCircle(x, z, 0.5);
  }
  const posts = new THREE.InstancedMesh(postGeo, w.mat.wood, postsMatrices.length);
  postsMatrices.forEach((m, i) => posts.setMatrixAt(i, m));
  posts.castShadow = posts.receiveShadow = true;
  w.group.add(posts);
  for (const g of gaps) {
    for (const side of [-1, 1]) {
      const a = g + side * 0.19;
      const tx = vx + Math.cos(a) * (R + 0.2);
      const tz = vz + Math.sin(a) * (R + 0.2);
      w.place(w.totem(), tx, tz, -a + Math.PI / 2, 0.05);
      w.nav.blockCircle(tx, tz, 0.6);
    }
    w.torch(vx + Math.cos(g + 0.3) * (R - 1.2), vz + Math.sin(g + 0.3) * (R - 1.2));
  }

  // Загон для брамінов.
  const pw = 4.5;
  w.fence([[PEN.x - pw, PEN.z - pw], [PEN.x + pw, PEN.z - pw], [PEN.x + pw, PEN.z + pw], [PEN.x - pw, PEN.z + pw]], true);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.5), w.mat.darkWood);
  trough.position.y = 0.18;
  const tg = new THREE.Group();
  tg.add(trough);
  w.place(tg, PEN.x, PEN.z - pw + 0.6, 0, 0.1);

  // Огород шамана.
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 5; k++) {
      const bush = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.3, 1), 0.15, 3, row * 5 + k), w.mat.plant);
      bush.scale.set(1, 0.7 + w.rnd() * 0.4, 1);
      w.place(bush, 9 + k * 0.9, -1.5 + row * 1.1, w.rnd() * 6, -0.15);
    }
  }
  for (const [x, z] of [[-9, -12], [12, 3], [-4, 22]]) w.tree(x, z);
}

function buildTemple(w: World) {
  const { x, z } = TEMPLE;
  const g = new THREE.Group();
  const s = w.mat.stone;
  const box = (bw: number, h: number, d: number, px: number, py: number, pz: number, m: THREE.Material = s, j = 0.08) => {
    const mesh = new THREE.Mesh(jitter(new THREE.BoxGeometry(bw, h, d, 6, 4, 6), j, 1.2, Math.floor(px * 7 + py * 3)), m);
    mesh.position.set(px, py, pz);
    g.add(mesh);
  };
  box(17, 0.8, 13, 0, 0.4, 0);
  box(13, 6, 8, 0, 3.8, -1.5);
  box(10, 1.4, 6.5, 0, 7.5, -1.5);
  box(6, 1.2, 4.5, 0, 8.8, -1.5);
  box(3.2, 3.8, 0.6, 0, 2.7, 2.35, w.mat.void, 0);
  for (const cx of [-5.4, -3.2, 3.2, 5.4]) {
    const col = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.45, 0.55, 5.2, 12, 4), 0.07, 2, cx * 10), s);
    col.position.set(cx, 3.4, 4.6);
    g.add(col);
  }
  box(13.2, 0.9, 1.6, 0, 6.3, 4.6);
  for (let i = 0; i < 3; i++) box(6 - i * 0.6, 0.3, 1, 0, 0.15 + i * 0.3 - 0.3, 7 - i * 0.8, s, 0.03);
  const piece = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.5, 0.55, 1.6, 12), 0.1, 2, 4), s);
  piece.rotation.z = Math.PI / 2;
  piece.position.set(7.5, 0.5, 6);
  g.add(piece);
  w.place(g, x, z, 0, 0.35);
  w.nav.blockRect(x, z - 0.5, 8.6, 6.2);
  w.interactable({ id: 'temple', name: 'Храм Испытаний', object: g, approach: new THREE.Vector3(x, 0, z + 9) });
}

function buildNest(w: World) {
  const { x, z } = NEST;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.5) continue;
    const r = 8 + w.rnd() * 1.5;
    const s = 1.2 + w.rnd() * 1.2;
    const bx = x + Math.cos(a) * r;
    const bz = z + Math.sin(a) * r;
    w.place(w.boulder(new THREE.Vector3(s, s * 0.8, s), i + 40), bx, bz, w.rnd() * 6, s * 0.3);
    w.nav.blockCircle(bx, bz, s * 0.9);
  }
  for (let i = 0; i < 7; i++) {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), w.mat.egg);
    egg.scale.set(1, 1.35, 1);
    w.place(egg, x + 2 + (w.rnd() - 0.5) * 1.2, z - 1 + (w.rnd() - 0.5) * 1.2, 0, -0.12);
  }
  for (let i = 0; i < 8; i++) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6 + w.rnd() * 0.4, 5), w.mat.bone);
    bone.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(bone);
    w.place(holder, x + (w.rnd() - 0.5) * 9, z + (w.rnd() - 0.5) * 9, w.rnd() * 6, -0.03);
  }
  const skull = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), w.mat.bone);
  cranium.scale.set(1, 0.8, 1.4);
  skull.add(cranium);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 8), w.mat.bone);
    horn.position.set(sx * 0.45, 0.2, 0);
    horn.rotation.z = -sx * 1.1;
    skull.add(horn);
  }
  w.place(skull, x - 3, z + 3, 0.7, -0.1);
}

function buildDogSpot(w: World) {
  const { x, z } = DOG_SPOT;
  for (let i = 0; i < 5; i++) {
    if (i === 1) continue;
    const a = (i / 5) * Math.PI * 2;
    const s = 1 + w.rnd();
    const bx = x + Math.cos(a) * 5;
    const bz = z + Math.sin(a) * 5;
    w.place(w.boulder(new THREE.Vector3(s, s * 0.7, s * 1.2), i + 70), bx, bz, w.rnd() * 6, s * 0.25);
    w.nav.blockCircle(bx, bz, s * 0.9);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('elder', 'Старейшина', { skin: '#b0805e', cloth: '#5a3d2a', hair: '#d8d4cc', top: '#7a2e22', beard: true, scale: 0.96 }, 'staff', { dialogue: 'elder' }), 0, -11.5);
  add(human('hakunin', 'Хакунин', { skin: SKIN.b, cloth: '#3e3428', hair: '#4a4a48', top: '#2f5a6a', beard: true }, 'staff', { dialogue: 'hakunin', wanderRadius: 2 }), 9, -4.5);
  add(human('nagor', 'Нагор', { skin: '#c08a62', cloth: '#7b5a3c', hair: '#2a1a10' }, 'none', { dialogue: 'nagor', wanderRadius: 3 }), NAGOR_HOME.x, NAGOR_HOME.z);
  add(human('hunter1', 'Охотник', { skin: SKIN.b, cloth: '#5e4a36', hair: '#1e140c', build: 1.1 }, 'spear', { dialogue: 'villager', wanderRadius: 8 }), -5, -4);
  add(human('hunter2', 'Охотница', { skin: SKIN.a, cloth: '#6a4030', hair: '#2a1a10', top: '#8a5a3a', build: 0.9 }, 'spear', { dialogue: 'villager', wanderRadius: 7 }), 12, 14);
  add(human('woman1', 'Жительница', { skin: '#b98260', cloth: '#7a6040', hair: '#20140c', top: '#9a7a4a', build: 0.88 }, 'none', { dialogue: 'villager', wanderRadius: 6 }), 6, 10);
  add(human('kid', 'Ребёнок', { skin: SKIN.a, cloth: '#6e5038', hair: '#3a2516', scale: 0.62 }, 'none', { dialogue: 'villager', wanderRadius: 6, speed: 2.6 }), 3, 3.5);
  for (let i = 0; i < 2; i++) add(brahmin(`brahmin${i}`), PEN.x - 1.5 + i * 3, PEN.z + (i ? 1 : -1), 0.9);

  // Пёс: в укрытии, у Нагора или уже идёт за игроком.
  const dog = g.dog;
  if (!dog.dead && !g.isInParty(dog)) {
    if (g.quests.dog?.state === 'rewarded') add(dog, NAGOR_HOME.x - 1, NAGOR_HOME.z + 1);
    else if (!g.flags.has('dogFound')) add(dog, DOG_SPOT.x, DOG_SPOT.z);
  }

  const nestSpots: [number, number][] = [[2, 3], [-2, -2], [3, -3], [-1, 3.5]];
  nestSpots.forEach(([dx, dz], i) => add(gecko(`gecko${i}`, false, 'nest'), NEST.x + dx, NEST.z + dz));
  add(gecko('goldgecko', true, 'nest'), NEST.x + 4, NEST.z, 0.7);
  add(gecko('wildgecko0', false), DOG_SPOT.x + 9, DOG_SPOT.z + 6);
  add(gecko('wildgecko1', false), DOG_SPOT.x + 7, DOG_SPOT.z + 9);
}

export const ARROYO: LocationDef = {
  id: 'arroyo',
  name: 'Арройо',
  terrain: {
    seed: 0,
    hills: 9,
    flatZones: [{ x: VILLAGE.x, z: VILLAGE.z, r: 32 }, { x: TEMPLE.x, z: TEMPLE.z, r: 13 }, { x: NEST.x, z: NEST.z, r: 9 }, { x: EXIT.x, z: EXIT.z, r: 8 }],
    mesas: [
      { x: 38, z: -25, r: 10, h: 10 },
      { x: 43, z: 29, r: 12, h: 13 },
      { x: -43, z: 31, r: 9, h: 11 },
      { x: -24, z: -54, r: 8, h: 9 },
      { x: 24, z: 56, r: 8, h: 7 },
      { x: 70, z: -36, r: 9, h: 12 },
      { x: -62, z: 2, r: 7, h: 9 },
      { x: 72, z: 40, r: 8, h: 10 },
    ],
    paths: [[[0, 24], [2, 34], [-1, 44], [0, 55]], [[24, 0], [36, 1], [47, 2]]],
    palette: DESERT_PALETTE,
  },
  entries: { default: [2, 6], world: [0, 49] },
  exits: [EXIT],
  scatter: {
    rocks: 420,
    trees: 34,
    grass: 4200,
    reserved: [
      { x: VILLAGE.x, z: VILLAGE.z, r: 29 },
      { x: TEMPLE.x, z: TEMPLE.z, r: 13 },
      { x: NEST.x, z: NEST.z, r: 10 },
      { x: DOG_SPOT.x, z: DOG_SPOT.z, r: 6 },
    ],
  },
  build(w) {
    buildVillage(w);
    buildTemple(w);
    buildNest(w);
    buildDogSpot(w);
  },
  spawn,
};
