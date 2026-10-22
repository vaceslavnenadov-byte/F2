import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { human, vaultCitizen, vcGuard, SKIN } from '../../game/bestiary';

const EXIT = { x: 0, z: 56, r: 4 };
/** Городская стена: прямоугольник с воротами на юге. */
const WALL = { x0: -42, x1: 42, z0: -36, z1: 30 };
export const VC_GATE = { x: 0, z: WALL.z1 };
const VAULT_DOOR = { x: 0, z: -40 };

/** Круглая дверь-шестерня довоенного убежища. */
export function vaultDoor(w: World, radius: number): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#8c8e90', roughness: 0.35, metalness: 0.85, normalMap: w.mat.stone.normalMap });
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.6, 40), steel);
  disk.rotation.x = Math.PI / 2;
  g.add(disk);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), steel);
    tooth.position.set(Math.cos(a) * (radius + 0.15), Math.sin(a) * (radius + 0.15), 0);
    tooth.rotation.z = a;
    g.add(tooth);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.7, 0.12, 8, 40), new THREE.MeshStandardMaterial({ color: '#c8a020', roughness: 0.4, metalness: 0.6 }));
  ring.position.z = 0.32;
  g.add(ring);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, 0.8, 24), steel);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

function build(w: World, flags: Set<string>) {
  const wallMat = new THREE.MeshStandardMaterial({ color: '#b8b4aa', map: w.mat.concrete.map, normalMap: w.mat.concrete.normalMap, roughness: 0.9 });
  const wallSeg = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(jitter(new THREE.BoxGeometry(len, 4.2, 1.2, Math.ceil(len / 2), 2, 1), 0.05, 1, Math.floor(ax + az)), wallMat);
    const holder = new THREE.Group();
    holder.add(m);
    m.position.y = 2;
    w.placeFlat(holder, (ax + bx) / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax), len / 2);
    const n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.8);
  };
  const { x0, x1, z0, z1 } = WALL;
  wallSeg(x0, z0, x1, z0);
  wallSeg(x0, z0, x0, z1);
  wallSeg(x1, z0, x1, z1);
  wallSeg(x0, z1, -3.2, z1);
  wallSeg(3.2, z1, x1, z1);
  // Сторожевые вышки по углам.
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [-4, z1], [4, z1]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 6, 10), wallMat);
    tower.position.y = 3;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 10), w.mat.metal);
    cap.position.y = 6.2;
    const t = new THREE.Group();
    t.add(tower, cap);
    w.placeFlat(t, x, z, 0, 1.5);
    w.nav.blockCircle(x, z, 1.6);
  }

  // Ворота: закрыты, пока нет пропуска.
  if (!flags.has('vcPass')) {
    const gate = new THREE.Group();
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.8, 0.25), w.mat.metal);
      leaf.position.set(sx * 1.6, 1.9, 0);
      gate.add(leaf);
    }
    w.place(gate, VC_GATE.x, VC_GATE.z, 0, 0);
    w.nav.blockRect(VC_GATE.x, VC_GATE.z, 3.3, 0.8);
    w.interactable({ id: 'vcgate', name: 'Ворота Убежище-Сити', object: gate, approach: new THREE.Vector3(VC_GATE.x, 0, VC_GATE.z + 3) });
  }

  // Таможня снаружи у ворот.
  const customs = w.ruin(7, 5, 3, 900);
  customs.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === w.mat.concrete ? ((o as THREE.Mesh).material = wallMat) : null));
  w.placeFlat(customs, 12, 38, Math.PI, 4);
  w.blockWalls(12, 38, 7, 5, Math.PI);

  // Совет и дома граждан: светлый бетон с синей отделкой.
  const trim = new THREE.MeshStandardMaterial({ color: '#2f5590', roughness: 0.6 });
  const house = (x: number, z: number, hw: number, hd: number, h: number, rot: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(hw, h, hd), wallMat);
    body.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(hw + 0.4, 0.3, hd + 0.4), trim);
    roof.position.y = h + 0.15;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), trim);
    door.position.set(0, 1.1, hd / 2 + 0.03);
    g.add(body, roof, door);
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), w.mat.glow);
      win.position.set(sx * hw * 0.3, h * 0.6, hd / 2 + 0.03);
      g.add(win);
    }
    w.placeFlat(g, x, z, rot, Math.max(hw, hd) / 2);
    w.nav.blockRect(x, z, hw / 2 + 0.3, hd / 2 + 0.3, rot);
  };
  house(0, -18, 16, 9, 5.5, 0); // Совет
  house(-26, -18, 9, 7, 4, 0);
  house(26, -18, 9, 7, 4, 0);
  house(-28, 8, 8, 7, 3.8, Math.PI / 2);
  house(-28, 20, 8, 6, 3.8, Math.PI / 2);
  house(-14, 10, 7, 6, 3.6, Math.PI);

  // Поля: ровные грядки зелени — то, чего нет нигде в пустоши.
  const crop = jitter(new THREE.IcosahedronGeometry(0.35, 1), 0.15, 3, 7);
  const cropMat = new THREE.MeshStandardMaterial({ color: '#5f8a3a', roughness: 0.85 });
  const m: THREE.Matrix4[] = [];
  for (let row = 0; row < 10; row++) {
    for (let k = 0; k < 18; k++) {
      const x = 10 + k * 1.4;
      const z = 2 + row * 2.2;
      m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, w.y(x, z), z), new THREE.Quaternion(), new THREE.Vector3(1, 0.6 + w.rnd() * 0.5, 1)));
    }
  }
  const crops = new THREE.InstancedMesh(crop, cropMat, m.length);
  m.forEach((mm, i) => crops.setMatrixAt(i, mm));
  crops.castShadow = crops.receiveShadow = true;
  w.group.add(crops);
  w.fence([[8.5, 0.5], [35.5, 0.5], [35.5, 23.5], [8.5, 23.5]], true);

  // Убежище 8: дверь-шестерня в скальном склоне за городом, внутри стены.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 3), wallMat);
  frame.position.y = 4;
  const fg = new THREE.Group();
  fg.add(frame);
  const door = vaultDoor(w, 3.4);
  door.position.set(1.2, 4, 1.7);
  door.rotation.y = 0.15;
  fg.add(door);
  const num = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: '#c8a020', emissive: '#4a3800' }));
  num.position.set(-3.8, 7.6, 1.55);
  fg.add(num);
  w.placeFlat(fg, VAULT_DOOR.x, VAULT_DOOR.z + 6, 0, 5);
  w.nav.blockRect(VAULT_DOOR.x, VAULT_DOOR.z + 6, 5.8, 2);
  const terminal = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.6), w.mat.metal);
  tb.position.y = 0.65;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ color: '#103010', emissive: '#40ff60', emissiveIntensity: 1.2 }));
  screen.position.set(0, 1.05, 0.31);
  terminal.add(tb, screen);
  w.place(terminal, 5.5, -31, 0, 0);
  w.nav.blockCircle(5.5, -31, 0.6);
  w.interactable({ id: 'v8terminal', name: 'Терминал Убежища 8', object: terminal, approach: new THREE.Vector3(5.5, 0, -29.3) });

  w.place(w.waterTower(), -34, -28, 0.4, 0);
  for (const [x, z] of [[-35.1, -29.1], [-32.9, -29.1], [-35.1, -26.9], [-32.9, -26.9]]) w.nav.blockCircle(x, z, 0.5);
  w.torch(-5, 27);
  w.torch(5, 27);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  const guard1 = vcGuard('vcguard1');
  guard1.dialogue = 'vcGuard';
  add(guard1, -5, 33.5);
  const guard2 = vcGuard('vcguard2');
  guard2.dialogue = 'vcGuard';
  add(guard2, 5, 33.5);
  add(human('customs', 'Офицер Рэндал', { skin: SKIN.pale, cloth: '#3a3c40', hair: '#4a3a2a', top: '#2f5590', build: 1.0 }, 'none', { dialogue: 'customs' }), 9, 34);
  add(vaultCitizen('holm', 'Первый гражданин Хольм', 0, { dialogue: 'firstCitizen' }), 0, -12);
  add(vaultCitizen('anders', 'Доктор Андерс', 1, { dialogue: 'vcDoctor' }), -26, -13);
  add(vaultCitizen('vcshop', 'Лавочник Мэйсон', 2, { dialogue: 'vcShop' }), 26, -13);
  for (let i = 0; i < 4; i++) add(vaultCitizen(`citizen${i}`, 'Гражданин', i, { dialogue: 'citizen', wanderRadius: 9 }), -10 + i * 7, -4 + (i % 2) * 6);
  add(human('farmer', 'Работник с фермы', { skin: SKIN.b, cloth: '#5a4a36', hair: '#1a1210', build: 1 }, 'none', { dialogue: 'citizen', wanderRadius: 6 }), 20, 12);
}

export const VAULT_CITY: LocationDef = {
  id: 'vaultcity',
  name: 'Убежище-Сити',
  terrain: {
    seed: 5,
    hills: 6,
    flatZones: [{ x: 0, z: -2, r: 56 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 0, z: -58, r: 16, h: 14 }, { x: -50, z: 45, r: 9, h: 9 }, { x: 55, z: 42, r: 8, h: 8 }],
    paths: [[[0, 56], [0, 30], [0, -12]], [[0, 0], [-26, -12]], [[0, 0], [26, -12]], [[0, -12], [5, -30]]],
    groundZones: [{ x: 0, z: -3, r: 40, color: '#9a9078', strength: 0.6 }, { x: 22, z: 12, r: 16, color: '#6a5a3a', strength: 0.7 }],
    palette: { sand: '#c4ac80', sandDark: '#a89068', rock: '#857060', rockLight: '#a89080', dirt: '#8a7a64' },
  },
  entries: { default: [0, 48], world: [0, 48] },
  exits: [EXIT],
  scatter: { rocks: 220, trees: 14, grass: 3200, reserved: [{ x: 0, z: -3, r: 46 }] },
  build,
  spawn,
};
