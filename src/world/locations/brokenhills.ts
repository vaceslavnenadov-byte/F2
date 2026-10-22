import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { ghoul, human, marcus, radscorpion, superMutant, SKIN } from '../../game/bestiary';

const EXIT = { x: -56, z: 0, r: 4 };
/** Вход в шахту в склоне горы на северо-востоке. */
const MINE = { x: 30, z: -30 };

function build(w: World) {
  // Портал шахты: деревянная крепь и тёмный зев.
  const portal = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 2), w.mat.void);
  hole.position.y = 1.8;
  portal.add(hole);
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), w.mat.darkWood);
    beam.position.set(sx * 2.2, 2, 1);
    portal.add(beam);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.45), w.mat.darkWood);
  lintel.position.set(0, 4, 1);
  portal.add(lintel);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.08), w.mat.paintRed);
  sign.position.set(0, 4.6, 1.1);
  portal.add(sign);
  w.placeFlat(portal, MINE.x, MINE.z, -0.4, 3);
  w.nav.blockRect(MINE.x, MINE.z, 2.6, 1.2, -0.4);

  // Рельсы и вагонетки с рудой во дворе шахты.
  const railMat = w.mat.rust;
  for (let i = 0; i < 12; i++) {
    const x = MINE.x - 3 - i * 1.6;
    const z = MINE.z + 3 + i * 1.1;
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.3), w.mat.darkWood);
    const g = new THREE.Group();
    g.add(sleeper);
    w.place(g, x, z, -0.6, -0.02);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 22), railMat);
  const rg = new THREE.Group();
  for (const sx of [-0.5, 0.5]) {
    const r = rail.clone();
    r.position.x = sx;
    rg.add(r);
  }
  w.place(rg, MINE.x - 12, MINE.z + 9, -0.97, -0.05);
  const oreMat = new THREE.MeshStandardMaterial({ color: '#4a6a2a', emissive: '#40ff40', emissiveIntensity: 0.5, roughness: 0.6 });
  for (const [x, z] of [[MINE.x - 6, MINE.z + 6], [MINE.x - 14, MINE.z + 11]]) {
    const cart = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.8), w.mat.rust);
    tub.position.y = 0.7;
    const ore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), oreMat);
    ore.scale.set(1, 0.5, 1.4);
    ore.position.y = 1.15;
    cart.add(tub, ore);
    w.place(cart, x, z, -0.97, 0);
    w.nav.blockCircle(x, z, 1);
  }
  const glow = new THREE.PointLight(0x60ff50, 6, 14, 1.8);
  glow.position.set(MINE.x - 8, w.y(MINE.x - 8, MINE.z + 7) + 2, MINE.z + 7);
  w.group.add(glow);

  // Город: хибары, офис шерифа, водокачка.
  const shacks: [number, number, number, string?][] = [[-20, -10, 0, 'Шериф'], [-8, -12, 0], [6, -12, 0, 'Лавка'], [-22, 10, Math.PI], [-8, 12, Math.PI], [8, 12, Math.PI]];
  shacks.forEach(([x, z, rot, s], i) => {
    const sh = w.shack(7, 6, 3, 1200 + i, { porch: i === 0 || i === 2, sign: s });
    w.placeFlat(sh, x, z, rot, 4);
    w.nav.blockRect(x, z, 3.8, 3.3, rot);
  });
  w.place(w.waterTower(), 22, 10, 0.2, 0);
  for (const [x, z] of [[20.9, 8.9], [23.1, 8.9], [20.9, 11.1], [23.1, 11.1]]) w.nav.blockCircle(x, z, 0.5);
  w.burningBarrel(-2, 2);
  for (const [x, z] of [[-34, -20], [40, 20], [-40, 30]]) w.tree(x, z, 1.2, 2);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  if (!g.isJoined('marcus')) add(marcus(), -20, -5.5);
  add(ghoul('zeyna', 'Мэр Зейна', 1, { dialogue: 'mayorZeyna' }), -4, -6);
  add(human('betty', 'Бетти', { skin: SKIN.a, cloth: '#5a4a3a', hair: '#8a5a2a', top: '#6a5a4a', build: 0.9 }, 'none', { dialogue: 'betty' }), 6, -7);
  const mut = superMutant('hillsmutant', undefined);
  mut.faction = 'villager';
  mut.detectRadius = 0;
  mut.dialogue = 'hillsFolk';
  mut.name = 'Шахтёр-мутант';
  mut.wanderRadius = 6;
  add(mut, 4, 2);
  add(human('miner1', 'Шахтёр', { skin: SKIN.b, cloth: '#4a4030', hair: '#1a1210', top: '#6a5a40', build: 1.1 }, 'sledge', { dialogue: 'hillsFolk', wanderRadius: 7 }), -12, 2);
  add(ghoul('miner2', 'Шахтёр-гуль', 2, { dialogue: 'hillsFolk', wanderRadius: 7 }), 12, 4);
  const scorps: [number, number][] = [[MINE.x - 4, MINE.z + 4], [MINE.x - 9, MINE.z + 8], [MINE.x + 2, MINE.z + 5], [MINE.x - 14, MINE.z + 3]];
  scorps.forEach(([x, z], i) => add(radscorpion(`scorp${i}`, 'scorp'), x, z, 0.8));
}

export const BROKEN_HILLS: LocationDef = {
  id: 'brokenhills',
  name: 'Брокен-Хиллз',
  terrain: {
    seed: 12,
    hills: 7,
    flatZones: [{ x: -4, z: 0, r: 34 }, { x: MINE.x - 8, z: MINE.z + 7, r: 14 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: MINE.x + 6, z: MINE.z - 10, r: 14, h: 14 }, { x: 45, z: 35, r: 9, h: 9 }],
    paths: [[[-56, 0], [-4, 0], [MINE.x - 10, MINE.z + 8]]],
    groundZones: [{ x: MINE.x - 8, z: MINE.z + 7, r: 12, color: '#6a6a40', strength: 0.6 }],
    palette: { sand: '#b89c78', sandDark: '#9a8060', rock: '#7a5e48', rockLight: '#9a7c62', dirt: '#6a5a46' },
  },
  entries: { default: [-48, 0], world: [-48, 0] },
  exits: [EXIT],
  radZones: [{ x: MINE.x - 6, z: MINE.z + 5, r: 10, rate: 2 }],
  scatter: { rocks: 300, trees: 14, grass: 2000, reserved: [{ x: -4, z: 0, r: 30 }, { x: MINE.x - 8, z: MINE.z + 7, r: 14 }] },
  build,
  spawn,
};
