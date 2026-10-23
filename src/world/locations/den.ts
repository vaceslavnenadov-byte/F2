import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { bandit, human, SKIN } from '../../game/bestiary';

const EXIT = { x: -56, z: 0, r: 4 };
const GUILD = { x: 2, z: -24 };
export const CAGE = { x: 13, z: -12 };

/** Уцелевшее бетонное здание с плоской крышей (Гильдия работорговцев). */
function bunker(w: World, wd: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(wd, h, d, 6, 3, 6), 0.08, 1, 9), w.mat.concrete);
  body.position.y = h / 2;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.4, 0.3, d + 0.4), w.mat.concrete);
  roof.position.y = h + 0.15;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), w.mat.void);
  door.position.set(0, 1.2, d / 2 + 0.02);
  g.add(door);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshStandardMaterial({ color: '#6a1c14', side: THREE.DoubleSide, roughness: 0.9 }));
  banner.position.set(0, h - 0.9, d / 2 + 0.05);
  g.add(banner);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.2), w.mat.void);
    win.position.set(sx * wd * 0.3, h * 0.65, d / 2 + 0.02);
    g.add(win);
  }
  return g;
}

function build(w: World) {
  // Руины по обе стороны улиц. [x, z, ширина, глубина, высота, разворот]
  const ruins: [number, number, number, number, number, number][] = [
    [-28, -14, 10, 8, 5, 0],
    [-26, 14, 9, 9, 4.5, Math.PI],
    [-8, 16, 8, 7, 4, Math.PI],
    [24, 16, 11, 8, 5.5, Math.PI],
    [30, -14, 9, 8, 4.5, 0],
    [-12, -16, 7, 6, 3.5, 0],
    [40, 30, 8, 8, 4, Math.PI / 2],
    [22, 34, 7, 6, 4, -Math.PI / 2],
  ];
  ruins.forEach(([x, z, rw, rd, rh, rot], i) => {
    w.placeFlat(w.ruin(rw, rd, rh, 300 + i * 17), x, z, rot, Math.max(rw, rd) / 2);
    w.blockWalls(x, z, rw, rd, rot);
  });
  const guild = bunker(w, 12, 8, 4.5);
  w.placeFlat(guild, GUILD.x, GUILD.z, 0, 6);
  w.nav.blockRect(GUILD.x, GUILD.z, 6.3, 4.3);

  // Клетка с пленником.
  const c = CAGE;
  const cg = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(i / 4);
    const t = (i % 4) / 4;
    const [x, z] = [[-1.6 + t * 3.2, -1.6], [1.6, -1.6 + t * 3.2], [1.6 - t * 3.2, 1.6], [-1.6, 1.6 - t * 3.2]][side];
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), w.mat.rust);
    bar.position.set(x, 1.2, z);
    cg.add(bar);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 3.4), w.mat.rust);
  top.position.y = 2.4;
  cg.add(top);
  w.place(cg, c.x, c.z, 0, 0.05);
  w.blockWalls(c.x, c.z, 3.2, 3.2, 0, 0);

  // Машины, покрышки, бочки.
  const cars: [number, number, number][] = [[-14, 3, 1.4], [8, -3, 0.2], [34, 3, 1.7], [-40, -4, 2.5], [14, 26, 0.9]];
  cars.forEach(([x, z, r], i) => {
    w.place(w.carWreck(500 + i), x, z, r, 0.1);
    w.nav.blockRect(x, z, 1.1, 2.3, r);
  });
  for (let i = 0; i < 12; i++) {
    const x = (w.rnd() - 0.5) * 80;
    const z = (w.rnd() - 0.5) * 60;
    const t = w.tire();
    w.place(t, x, z, w.rnd() * 3, 0);
  }
  const fires: [number, number, boolean][] = [[-6, -6, true], [18, 6, true], [-20, 4, false], [30, 24, true], [0, 8, false], [-34, 8, false]];
  for (const [x, z, light] of fires) {
    if (light) w.burningBarrel(x, z);
    else {
      w.place(w.barrel(true), x, z, 0, 0.02);
      w.addFlame(new THREE.Vector3(x, w.y(x, z) + 0.85, z), 0, 0.5, false);
      w.nav.blockCircle(x, z, 0.5);
    }
  }
  // Фонарные столбы без света.
  for (const [x, z] of [[-20, -6], [10, 7], [26, -6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), w.mat.metal);
    pole.position.y = 2.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), w.mat.metal);
    arm.position.set(0.6, 4.9, 0);
    const g = new THREE.Group();
    g.add(pole, arm);
    g.rotation.z = 0.06;
    w.place(g, x, z, w.rnd() * 6, 0);
    w.nav.blockCircle(x, z, 0.4);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('metzger', 'Мецгер', { skin: SKIN.pale, cloth: '#2a2622', hair: '#2a1a10', top: '#3a1a14', beard: true, build: 1.2 }, 'gun', { dialogue: 'metzger' }), GUILD.x, GUILD.z + 6);
  add(human('slaver1', 'Работорговец', { skin: SKIN.b, cloth: '#2a2622', hair: '#141010', top: '#4a2a1a', build: 1.1 }, 'spear', { dialogue: 'slaver', wanderRadius: 2 }), GUILD.x - 5, GUILD.z + 6);
  if (!g.flags.has('vicFree')) add(human('vic', 'Вик', { skin: SKIN.pale, cloth: '#4a4a3a', hair: '#6a6a60', top: '#5a5a48', beard: true, build: 0.95 }, 'none', { dialogue: 'vic' }), CAGE.x, CAGE.z);
  else if (!g.flags.has('vicLeft') && !g.isJoined('vic')) add(human('vic', 'Вик', { skin: SKIN.pale, cloth: '#4a4a3a', hair: '#6a6a60', top: '#5a5a48', beard: true, build: 0.95 }, 'none', { dialogue: 'vic', wanderRadius: 3 }), CAGE.x + 3, CAGE.z + 3);
  add(human('becky', 'Бекки', { skin: SKIN.b, cloth: '#5a3a3a', hair: '#1a1210', top: '#7a3a4a', build: 0.95 }, 'none', { dialogue: 'becky' }), -20, 9);
  const junk: [number, number][] = [[-8, 2], [5, 10], [20, -4], [-30, 0]];
  junk.forEach(([x, z], i) =>
    add(human(`junkie${i}`, i % 2 ? 'Наркоман' : 'Бродяга', { skin: i % 2 ? SKIN.pale : SKIN.b, cloth: '#3a3530', hair: '#2a2420', top: i % 2 ? '#4a4a40' : undefined, build: 0.85 }, 'none', { dialogue: 'denFolk', wanderRadius: 8 }), x, z),
  );
  for (let i = 0; i < 3; i++) add(bandit(`dbandit${i}`, i), 30 + i * 2, 28 - i * 2);
}

export const DEN: LocationDef = {
  id: 'den',
  name: 'Дэн',
  terrain: {
    seed: 3,
    hills: 5,
    flatZones: [{ x: 0, z: 0, r: 52 }, { x: EXIT.x, z: EXIT.z, r: 8 }],
    mesas: [{ x: -50, z: -45, r: 8, h: 7 }, { x: 55, z: -40, r: 9, h: 9 }],
    paths: [[[-56, 0], [56, 2]], [[2, -20], [2, 30]], [[20, 0], [30, 25]]],
    groundZones: [{ x: 0, z: 0, r: 46, color: '#58534c', strength: 0.85 }],
    palette: { sand: '#b49c80', sandDark: '#8e7a64', rock: '#6e5a4a', rockLight: '#8e7662', dirt: '#4e4944' },
  },
  entries: { default: [-48, 0], world: [-48, 0] },
  exits: [EXIT],
  scatter: { rocks: 160, trees: 10, grass: 1200, reserved: [{ x: 0, z: 0, r: 46 }] },
  build,
  spawn,
};
