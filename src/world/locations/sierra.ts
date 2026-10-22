import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { robot, turret } from '../../game/bestiary';
import { vaultDoor } from './vaultcity';

const EXIT = { x: 0, z: 56, r: 4 };
export const ARMORY = { x: 0, z: -30 };
export const SIERRA_GUARDS = ['srobot0', 'srobot1', 'srobot2', 'srobot3', 'sturret0', 'sturret1'];

export function bunker(w: World, x: number, z: number, wd: number, d: number, h: number, rot: number, label: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(wd, h, d, 4, 2, 4), 0.05, 1, Math.floor(x * 3 + z)), w.mat.concrete);
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.6, 0.4, d + 0.6), w.mat.concrete);
  roof.position.y = h + 0.2;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.2), w.mat.metal);
  door.position.set(0, 1.2, d / 2 + 0.05);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3, wd * 0.5), 0.5, 0.08), new THREE.MeshStandardMaterial({ color: '#c8a020' }));
  sign.position.set(0, h - 0.6, d / 2 + 0.06);
  sign.name = label;
  // Маскировочная окраска полосами.
  for (let i = 0; i < 3; i++) {
    const camo = new THREE.Mesh(new THREE.BoxGeometry(wd * 0.3, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: 1 }));
    camo.position.set(-wd * 0.3 + i * wd * 0.3, h * 0.4 + (i % 2) * 0.7, d / 2 + 0.04);
    g.add(camo);
  }
  g.add(body, roof, door, sign);
  w.placeFlat(g, x, z, rot, Math.max(wd, d) / 2);
  w.nav.blockRect(x, z, wd / 2 + 0.3, d / 2 + 0.3, rot);
  return g;
}

function terminal(w: World, x: number, z: number, rot: number, color: string): THREE.Group {
  const t = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.6), w.mat.metal);
  tb.position.y = 0.7;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: '#081008', emissive: color, emissiveIntensity: 1.4 }));
  scr.position.set(0, 1.1, 0.31);
  t.add(tb, scr);
  w.place(t, x, z, rot, 0);
  w.nav.blockCircle(x, z, 0.6);
  return t;
}

function build(w: World, flags: Set<string>) {
  // Ворота с противотанковыми ежами.
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) < 1) continue;
    const hedge = new THREE.Group();
    for (const r of [0, Math.PI / 2, Math.PI / 4]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), w.mat.rust);
      beam.rotation.set(0.7, r, 0);
      beam.position.y = 0.6;
      hedge.add(beam);
    }
    w.place(hedge, i * 3, 28, i, 0);
    w.nav.blockCircle(i * 3, 28, 0.9);
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#6a6c70', roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (const [ax, az, bx, bz] of [[-40, 26, -6, 26], [6, 26, 40, 26], [-40, 26, -40, -44], [40, 26, 40, -44]]) {
    const len = Math.hypot(bx - ax, bz - az);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), fenceMat);
    mesh.position.set((ax + bx) / 2, w.y((ax + bx) / 2, (az + bz) / 2) + 1.3, (az + bz) / 2);
    mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    w.group.add(mesh);
    const n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.45);
  }

  bunker(w, -20, -4, 12, 8, 4, Math.PI / 2, 'Командный бункер');
  const sec = terminal(w, -14.6, -4, Math.PI / 2, '#40ff60');
  w.interactable({ id: 'sierraSecurity', name: 'Терминал охраны', object: sec, approach: new THREE.Vector3(-13, 0, -4) });
  bunker(w, 22, -6, 10, 8, 4, -Math.PI / 2, 'Генераторная');
  const gen = terminal(w, 16.6, -6, -Math.PI / 2, flags.has('sierraPower') ? '#40ff60' : '#ff3020');
  w.interactable({ id: 'sierraGenerator', name: 'Генератор', object: gen, approach: new THREE.Vector3(15, 0, -6) });
  // Трубы от генераторной к арсеналу.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 30, 8), w.mat.rust);
  pipe.rotation.x = Math.PI / 2;
  pipe.rotation.z = 0.6;
  pipe.position.set(12, w.y(12, -18) + 0.4, -18);
  w.group.add(pipe);

  // Арсенал в склоне горы: гермодверь открывается от генератора.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 3), w.mat.concrete);
  frame.position.y = 3.5;
  const fg = new THREE.Group();
  fg.add(frame);
  const door = vaultDoor(w, 2.6);
  door.position.set(flags.has('sierraPower') ? -4.5 : 0, 3.1, 1.6);
  fg.add(door);
  w.placeFlat(fg, ARMORY.x, ARMORY.z - 4, 0, 6);
  w.nav.blockRect(ARMORY.x, ARMORY.z - 4, 6.3, 1.8);
  if (!flags.has('sierraLooted')) {
    const crate = new THREE.Group();
    for (const [ox, oz, s] of [[0, 0, 1.1], [1.2, 0.2, 0.9], [-1.1, -0.1, 0.8]] as const) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: 0.9 }));
      c.position.set(ox, s / 2, oz);
      crate.add(c);
    }
    w.place(crate, ARMORY.x, ARMORY.z - 0.2, 0, 0);
    w.nav.blockCircle(ARMORY.x, ARMORY.z - 0.2, 1.6);
    w.interactable({ id: 'sierraArmory', name: 'Ящики арсенала', object: crate, approach: new THREE.Vector3(ARMORY.x, 0, ARMORY.z + 2.2) });
  }

  // Вышки с прожекторами и брошенная техника.
  w.place(w.carWreck(1300), 10, 14, 0.4, 0.1);
  w.nav.blockRect(10, 14, 1.1, 2.3, 0.4);
  for (const [x, z] of [[-30, -30], [30, -30]]) {
    const spot = new THREE.SpotLight(0xfff0d0, 30, 34, 0.5, 0.5, 1.4);
    spot.position.set(x, w.y(x, z) + 8, z);
    spot.target.position.set(0, 0, -10);
    w.group.add(spot, spot.target);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  if (g.flags.has('sierraSecurityOff')) return;
  const spots: [number, number][] = [[-6, 10], [8, 0], [-8, -16], [10, -22]];
  spots.forEach(([x, z], i) => add(robot(`srobot${i}`), x, z, 0.8));
  add(turret('sturret0', true), ARMORY.x - 5, ARMORY.z + 3, 0.6);
  add(turret('sturret1', true), ARMORY.x + 5, ARMORY.z + 3, 0.6);
}

export const SIERRA: LocationDef = {
  id: 'sierra',
  name: 'Склад Сьерра',
  terrain: {
    seed: 13,
    hills: 7,
    flatZones: [{ x: 0, z: -6, r: 44 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 0, z: -50, r: 16, h: 16 }, { x: -48, z: -20, r: 9, h: 11 }, { x: 50, z: 30, r: 9, h: 9 }],
    paths: [[[0, 56], [0, 26], [0, -26]], [[0, 0], [-13, -4]], [[0, -2], [15, -6]]],
    groundZones: [{ x: 0, z: -6, r: 34, color: '#6a6658', strength: 0.6 }],
    palette: { sand: '#b4a07c', sandDark: '#968260', rock: '#6e6050', rockLight: '#8e806c', dirt: '#5e584a' },
  },
  entries: { default: [0, 48], world: [0, 48] },
  exits: [EXIT],
  scatter: { rocks: 260, trees: 22, grass: 2600, reserved: [{ x: 0, z: -6, r: 38 }] },
  build,
  spawn,
};
