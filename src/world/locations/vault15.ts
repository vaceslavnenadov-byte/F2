import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { bandit, human, SKIN } from '../../game/bestiary';
import { vaultDoor } from './vaultcity';

const EXIT = { x: -58, z: 8, r: 4 };
/** Вход в Убежище 15 — в склоне горы на северо-востоке. */
const DOOR = { x: 26, z: -30 };
export const KHAN_IDS = ['darion', 'khan0', 'khan1', 'khan2', 'khan3', 'khan4'];

/** Палатка ханов: шкуры на жердях. */
function tent(w: World, x: number, z: number, rot: number, color: string) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2, 2.8, 6, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
  cone.position.y = 1.4;
  g.add(cone);
  for (let i = 0; i < 3; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 5), w.mat.darkWood);
    pole.position.y = 1.6;
    pole.rotation.set(0.25 * Math.cos(i * 2.1), 0, 0.25 * Math.sin(i * 2.1));
    g.add(pole);
  }
  w.place(g, x, z, rot, 0.05);
  w.nav.blockCircle(x, z, 1.8);
}

function build(w: World) {
  // Гермодверь Убежища 15, наполовину засыпанная обвалом.
  const frame = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 3), w.mat.concrete);
  wall.position.y = 3.5;
  frame.add(wall);
  const door = vaultDoor(w, 2.6);
  door.position.set(-0.8, 3.1, 1.6);
  door.rotation.z = 0.25;
  frame.add(door);
  const num = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: '#c8a020', emissive: '#4a3800' }));
  num.position.set(3.8, 5.6, 1.56);
  frame.add(num);
  w.placeFlat(frame, DOOR.x, DOOR.z, 0, 6);
  w.nav.blockRect(DOOR.x, DOOR.z, 6.3, 1.8);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Vector3(1.2 + (i % 3) * 0.5, 0.9 + (i % 2) * 0.5, 1.1 + (i % 4) * 0.3);
    const b = w.boulder(s, 1700 + i);
    const x = DOOR.x + 2 + (i % 4) * 1.4;
    const z = DOOR.z + 2.2 + Math.floor(i / 4) * 1.3;
    w.place(b, x, z, i, 0.2);
    w.nav.blockCircle(x, z, s.x * 0.8);
  }

  // Лагерь сквоттеров у дороги: хибары из хлама.
  const shacks: [number, number, number][] = [[-34, -6, 0], [-26, 10, Math.PI], [-38, 14, Math.PI]];
  shacks.forEach(([x, z, rot], i) => {
    const sh = w.shack(6, 5, 2.6, 1700 + i, { porch: i === 0 });
    w.placeFlat(sh, x, z, rot, 3.5);
    w.nav.blockRect(x, z, 3.3, 2.8, rot);
  });
  w.burningBarrel(-30, 3);
  w.place(w.carWreck(1710), -18, -10, 0.8, 0.1);
  w.nav.blockRect(-18, -10, 1.1, 2.3, 0.8);

  // Лагерь ханов у входа в убежище: палатки, баррикада, костёр.
  tent(w, 14, -18, 0, '#7a5a3a');
  tent(w, 30, -14, 1, '#6a4a30');
  tent(w, 20, -8, 2, '#8a6a4a');
  w.burningBarrel(22, -18);
  w.burningBarrel(10, -10);
  for (const [x, z, r] of [[6, -4, 0.3], [2, -14, 1.4]] as const) {
    w.place(w.carWreck(1720 + x), x, z, r, 0.1);
    w.nav.blockRect(x, z, 1.1, 2.3, r);
  }
  for (const [x, z] of [[-48, -30], [44, 30], [-44, 36], [48, -6]]) w.tree(x, z, 1.2, 1);
}

function khan(id: string, variant: number) {
  const b = bandit(id, variant);
  b.name = 'Хан';
  b.faction = 'villager';
  b.detectRadius = 0;
  b.dialogue = 'khan';
  b.tag = 'khans';
  b.hp = b.maxHp = 32;
  b.wanderRadius = 3;
  return b;
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('zeke', 'Зик', { skin: SKIN.b, cloth: '#4a4238', hair: '#5a5a50', top: '#6a5a40', beard: true }, 'none', { dialogue: 'zeke' }), -32, -1.5);
  const sq: [number, number][] = [[-28, 4], [-36, 8], [-22, -2]];
  sq.forEach(([x, z], i) =>
    add(human(`squat${i}`, 'Сквоттер', { skin: [SKIN.a, SKIN.c, SKIN.pale][i], cloth: '#4a4034', hair: '#2a1a10', build: 0.9 + i * 0.05 }, 'none', { dialogue: 'squatter', wanderRadius: 5 }), x, z),
  );
  if (g.flags.has('khansLeft')) return;
  const hostile = g.flags.has('khansHostile');
  const list = [
    add(human('darion', 'Дарион', { skin: SKIN.pale, cloth: '#2a2420', hair: '#141010', armor: 'metal', beard: true, build: 1.15 }, 'gun', {
      dialogue: 'darion', hp: 90, ac: 14, skill: 72, dt: 4, dr: 0.3, xp: 800, attack: { skill: 'smallGuns', dmg: [8, 16], ap: 5, range: 14, melee: false, visual: 'gun' },
      loot: [['caps', 80, 160], ['ammo10', 10, 20], ['stimpak', 1, 2]], tag: 'khans',
    }), 22, -14),
    ...[[14, -12], [26, -20], [18, -22], [8, -18], [30, -8]].map(([x, z], i) => add(khan(`khan${i}`, i), x, z)),
  ];
  if (hostile) for (const a of list) if (a) {
    a.faction = 'hostile';
    a.dialogue = undefined;
    a.detectRadius = 30;
  }
}

export const VAULT15: LocationDef = {
  id: 'vault15',
  name: 'Убежище 15',
  terrain: {
    seed: 18,
    hills: 8,
    flatZones: [{ x: -26, z: 4, r: 20 }, { x: 18, z: -14, r: 22 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: DOOR.x, z: DOOR.z - 14, r: 14, h: 16 }, { x: -46, z: -40, r: 10, h: 9 }],
    paths: [[[-58, 8], [-26, 4], [0, -4], [DOOR.x, DOOR.z + 6]]],
    groundZones: [{ x: 18, z: -14, r: 16, color: '#7a6a50', strength: 0.5 }],
    palette: { sand: '#bca480', sandDark: '#9c8662', rock: '#806a54', rockLight: '#a08a70', dirt: '#6e5e48' },
  },
  entries: { default: [-50, 8], world: [-50, 8] },
  exits: [EXIT],
  scatter: { rocks: 280, trees: 16, grass: 2200, reserved: [{ x: -26, z: 4, r: 18 }, { x: 18, z: -14, r: 20 }] },
  build,
  spawn,
};
