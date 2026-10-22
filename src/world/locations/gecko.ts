import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { feralGhoul, ghoul } from '../../game/bestiary';

const EXIT = { x: -56, z: 0, r: 4 };
const PLANT = { x: 22, z: -10 };
/** Радиоактивный двор за реактором. */
export const YARD = { x: 26, z: 14, r: 11 };

/** Градирня — гиперболоид из вращения профиля. */
function coolingTower(w: World, r: number, h: number): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * h;
    const k = (t - 0.62) / 0.62;
    pts.push(new THREE.Vector2(r * (0.72 + 0.32 * k * k), y));
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#9a9488', map: w.mat.concrete.map, normalMap: w.mat.concrete.normalMap, roughness: 0.95, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 36), mat);
}

function build(w: World, flags: Set<string>) {
  // Градирни и корпус реактора.
  for (const [x, z] of [[40, -26], [52, -8]]) {
    const t = coolingTower(w, 7, 18);
    w.placeFlat(t, x, z, 0, 8);
    w.nav.blockCircle(x, z, 8.5);
    // Пар из градирни — только если реактор работает.
    if (flags.has('reactorFixed')) w.addSteam(new THREE.Vector3(x, w.y(x, z) + 18, z));
  }
  const plant = new THREE.Group();
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(18, 9, 12, 6, 3, 4), 0.06, 1, 3), w.mat.concrete);
  body.position.y = 4.5;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), w.mat.concrete);
  dome.position.set(3, 9, 0);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.2), w.mat.void);
  door.position.set(-4, 1.5, 6.05);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: '#d8c020', emissive: '#3a3000' }));
  sign.position.set(-4, 3.6, 6.08);
  plant.add(body, dome, door, sign);
  for (const [x, z] of [[-7, -7], [7, -7]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 8, 12), w.mat.rust);
    stack.position.set(x, 12, z * 0.5);
    plant.add(stack);
  }
  w.placeFlat(plant, PLANT.x, PLANT.z, 0, 10);
  w.nav.blockRect(PLANT.x, PLANT.z, 9.3, 6.3);

  // Пульт реактора у входа: здесь ставят регулятор.
  const panel = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.7), w.mat.metal);
  pb.position.y = 0.75;
  const lights = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshStandardMaterial({
    color: '#300', emissive: flags.has('reactorFixed') ? '#30ff50' : '#ff3020', emissiveIntensity: 1.5,
  }));
  lights.position.set(0, 1.2, 0.36);
  panel.add(pb, lights);
  w.place(panel, PLANT.x - 9, PLANT.z + 8.5, 0, 0);
  w.nav.blockCircle(PLANT.x - 9, PLANT.z + 8.5, 0.8);
  w.interactable({ id: 'reactorPanel', name: 'Пульт управления реактором', object: panel, approach: new THREE.Vector3(PLANT.x - 9, 0, PLANT.z + 10.5) });

  // Двор с отходами: светящиеся бочки, ограда с проходом.
  const y = YARD;
  w.fence([[y.x - 9, y.z - 8], [y.x + 9, y.z - 8], [y.x + 9, y.z + 8], [y.x - 9, y.z + 8], [y.x - 9, y.z + 2]]);
  const glowMat = new THREE.MeshStandardMaterial({ color: '#4a7a20', emissive: '#60ff30', emissiveIntensity: 1.4, roughness: 0.4 });
  for (let i = 0; i < 9; i++) {
    const bx = y.x - 6 + (i % 3) * 5 + w.rnd() * 1.5;
    const bz = y.z - 5 + Math.floor(i / 3) * 4.5 + w.rnd();
    const b = w.barrel(false);
    if (i % 2 === 0) {
      const ooze = new THREE.Mesh(new THREE.CircleGeometry(0.7 + w.rnd() * 0.6, 16).rotateX(-Math.PI / 2), glowMat);
      ooze.position.set(0.6, 0.03, 0.4);
      b.add(ooze);
      b.rotation.z = i === 4 ? Math.PI / 2 : 0;
    }
    w.place(b, bx, bz, w.rnd() * 3, 0.02);
    w.nav.blockCircle(bx, bz, 0.5);
  }
  const light = new THREE.PointLight(0x60ff40, 8, 18, 1.8);
  light.position.set(y.x, w.y(y.x, y.z) + 3, y.z);
  w.group.add(light);
  if (!flags.has('gotRegulator')) {
    const crate = w.crate(1);
    crate.position.y = 0.5;
    const g = new THREE.Group();
    g.add(crate);
    w.place(g, y.x + 6, y.z + 5, 0.3, 0);
    w.nav.blockCircle(y.x + 6, y.z + 5, 0.7);
    w.interactable({ id: 'regulatorCrate', name: 'Ящик с деталями реактора', object: g, approach: new THREE.Vector3(y.x + 4.5, 0, y.z + 5) });
  }

  // Жестяные хибары гулей.
  const shacks: [number, number, number][] = [[-20, -10, 0], [-8, -14, 0], [-22, 10, Math.PI], [-6, 12, Math.PI], [-34, 0, Math.PI / 2]];
  shacks.forEach(([x, z, rot], i) => {
    const s = w.shack(6, 5, 2.8, 700 + i, { porch: i === 1 });
    s.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === w.mat.planks ? ((o as THREE.Mesh).material = w.mat.tin) : null));
    w.placeFlat(s, x, z, rot, 3.5);
    w.nav.blockRect(x, z, 3.3, 2.8, rot);
  });
  w.burningBarrel(-14, 0);
  w.burningBarrel(-28, -6);
  w.place(w.carWreck(77), 6, 18, 0.7, 0.1);
  w.nav.blockRect(6, 18, 1.1, 2.3, 0.7);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(ghoul('skeet', 'Скит', 0, { dialogue: 'skeet' }), PLANT.x - 11, PLANT.z + 10);
  add(ghoul('lorin', 'Лорин', 1, { dialogue: 'lorin' }), -8, -9.5);
  add(ghoul('cornelius', 'Корнелий', 2, { dialogue: 'cornelius', wanderRadius: 2 }), -14, 3);
  for (let i = 0; i < 3; i++) add(ghoul(`gfolk${i}`, 'Гуль', i, { dialogue: 'ghoulFolk', wanderRadius: 9 }), -20 + i * 6, -2 + i * 2);
  const ferals: [number, number][] = [[YARD.x - 3, YARD.z - 3], [YARD.x + 3, YARD.z], [YARD.x, YARD.z + 4], [YARD.x + 5, YARD.z - 4]];
  ferals.forEach(([x, z], i) => add(feralGhoul(`feral${i}`, i), x, z));
}

export const GECKO: LocationDef = {
  id: 'gecko',
  name: 'Гекко',
  terrain: {
    seed: 6,
    hills: 6,
    flatZones: [{ x: 0, z: 0, r: 58 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: -45, z: -45, r: 9, h: 8 }, { x: -40, z: 45, r: 8, h: 7 }],
    paths: [[[-56, 0], [-14, 0], [PLANT.x - 9, PLANT.z + 11]], [[-14, 0], [YARD.x - 9, YARD.z + 5]]],
    groundZones: [{ x: YARD.x, z: YARD.z, r: 13, color: '#6a7a30', strength: 0.75 }, { x: -14, z: 0, r: 26, color: '#6e6656', strength: 0.5 }],
    palette: { sand: '#a89c80', sandDark: '#8a8068', rock: '#6e6252', rockLight: '#8e8070', dirt: '#5e584a' },
  },
  entries: { default: [-48, 0], world: [-48, 0] },
  exits: [EXIT],
  radZones: [{ x: YARD.x, z: YARD.z, r: YARD.r, rate: 6 }, { x: PLANT.x, z: PLANT.z, r: 14, rate: 1 }],
  scatter: { rocks: 200, trees: 16, grass: 1600, reserved: [{ x: 10, z: 0, r: 48 }] },
  build,
  spawn,
};
