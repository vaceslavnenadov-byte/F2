import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { deathclaw } from '../../game/bestiary';
import { vaultDoor } from './vaultcity';

const EXIT = { x: -46, z: 0, r: 3 };
export const GECK_SPOT = { x: 26, z: 0 };

function build(w: World, flags: Set<string>) {
  const panel = new THREE.MeshStandardMaterial({ color: '#7a8088', map: w.mat.concrete.map, normalMap: w.mat.concrete.normalMap, roughness: 0.6, metalness: 0.3 });
  const stripe = new THREE.MeshStandardMaterial({ color: '#d0a020', roughness: 0.5 });
  const H = 3.4;
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.4), panel);
    m.position.y = H / 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.44), stripe);
    s.position.y = 1.1;
    // Трубы вдоль стен.
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), w.mat.metal);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, H - 0.4, 0.28);
    g.add(m, s, pipe);
    g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    g.rotation.y = -Math.atan2(bz - az, bx - ax);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = o.receiveShadow = true) : null));
    w.group.add(g);
    const n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.45);
  };
  // Внешний контур со входом на западе.
  wall(-36, -20, 32, -20);
  wall(-36, 20, 32, 20);
  wall(32, -20, 32, 20);
  wall(-36, -20, -36, -3);
  wall(-36, 3, -36, 20);
  // Перегородки: прихожая, атриум, жилые каюты (север), логово (юг), кабинет смотрителя (восток).
  wall(-20, -20, -20, -3);
  wall(-20, 3, -20, 20);
  wall(-20, -8, -13.2, -8);
  wall(-10.8, -8, -1.2, -8);
  wall(1.2, -8, 8, -8);
  wall(-6, -20, -6, -8);
  wall(-20, 8, -7.2, 8);
  wall(-4.8, 8, 8, 8);
  wall(8, -20, 8, -2.5);
  wall(8, 2.5, 8, 20);

  // Откатившаяся дверь-шестерня у входа.
  const door = vaultDoor(w, 2.6);
  door.rotation.y = Math.PI / 2;
  door.position.set(-37.2, 2.8, 5.8);
  w.group.add(door);
  const num = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.6), new THREE.MeshStandardMaterial({ color: '#c8a020', emissive: '#4a3800' }));
  num.position.set(-35.75, 2.6, -2);
  w.group.add(num);

  // Освещение: холодные лампы.
  const lamps: [number, number][] = [[-28, 0], [-6, 0], [-13, -14], [1, -14], [-12, 14], [20, 0], [20, -12]];
  for (const [x, z] of lamps) {
    const l = new THREE.PointLight(0xcfe0ff, 14, 16, 1.6);
    l.position.set(x, 3.1, z);
    w.group.add(l);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#e8f0ff', emissiveIntensity: 2 }));
    fixture.position.set(x, 3.3, z);
    w.group.add(fixture);
  }

  // Каюты: койки и шкафчики.
  for (const [x, z] of [[-17, -17], [-17, -12], [-9, -17], [-2, -17], [4, -17]]) {
    const bed = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.9), w.mat.metal);
    frame.position.y = 0.25;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: '#3a4a6a', roughness: 0.9 }));
    mattress.position.y = 0.55;
    bed.add(frame, mattress);
    w.place(bed, x, z, 0, 0);
    w.nav.blockRect(x, z, 1.1, 0.5);
  }
  // Атриум: колонна с эмблемой и опрокинутые ящики.
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, H, 20), panel);
  pillar.position.y = H / 2;
  const pg = new THREE.Group();
  pg.add(pillar);
  w.place(pg, -10, 0, 0, 0);
  w.nav.blockCircle(-10, 0, 1.3);
  for (const [x, z, s] of [[-26, -15, 1], [-27.2, -15.3, 0.8], [-24, 14, 1], [3, 5, 0.9]]) {
    const c = w.crate(s);
    c.position.y = s / 2;
    const g = new THREE.Group();
    g.add(c);
    w.place(g, x, z, x, 0);
    w.nav.blockCircle(x, z, 0.7);
  }
  // Логово когтей: кости и гнездо из тряпья.
  for (let i = 0; i < 10; i++) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6 + w.rnd() * 0.5, 5), w.mat.bone);
    bone.rotation.z = Math.PI / 2;
    const h = new THREE.Group();
    h.add(bone);
    w.place(h, -16 + w.rnd() * 10, 11 + w.rnd() * 7, w.rnd() * 6, -0.03);
  }
  const nest = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.45, 8, 20), new THREE.MeshStandardMaterial({ color: '#5a4a38', roughness: 1 }));
  nest.rotation.x = Math.PI / 2;
  nest.position.y = 0.25;
  const ng = new THREE.Group();
  ng.add(nest);
  w.place(ng, -14, 15, 0, 0);

  // Кабинет смотрителя: пульты и ГЭКК на постаменте.
  for (const [x, z] of [[30, -14], [30, -10], [30, 10], [30, 14]]) {
    const console = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 2.4), w.mat.metal);
    b.position.y = 0.6;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ color: '#102010', emissive: '#40ff60', emissiveIntensity: 1 }));
    scr.position.set(-0.41, 1.0, 0);
    scr.rotation.y = -Math.PI / 2;
    console.add(b, scr);
    w.place(console, x, z, 0, 0);
    w.nav.blockRect(x, z, 0.5, 1.3);
  }
  const ped = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1, 16), panel);
  base.position.y = 0.5;
  ped.add(base);
  if (!flags.has('hasGeck')) {
    const geck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.35), new THREE.MeshStandardMaterial({ color: '#c8b070', roughness: 0.5, metalness: 0.3 }));
    geck.position.y = 1.3;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), w.mat.metal);
    handle.position.y = 1.6;
    const glow = new THREE.PointLight(0xffe0a0, 4, 5);
    glow.position.y = 2;
    ped.add(geck, handle, glow);
  }
  w.place(ped, GECK_SPOT.x, GECK_SPOT.z, 0, 0);
  w.nav.blockCircle(GECK_SPOT.x, GECK_SPOT.z, 0.9);
  w.interactable({ id: 'geckPedestal', name: flags.has('hasGeck') ? 'Пустой постамент' : 'ГЭКК', object: ped, approach: new THREE.Vector3(GECK_SPOT.x - 2, 0, GECK_SPOT.z) });
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  const hostile = g.flags.has('deathclawsHostile');
  const mk = (id: string, name: string, dialogue: string, scale = 1) => {
    const d = deathclaw(id, name, { dialogue: hostile ? undefined : dialogue });
    if (hostile) {
      d.faction = 'hostile';
      d.detectRadius = 14;
    }
    d.rig.root.scale.setScalar(scale);
    return d;
  };
  add(mk('grah', 'Грах', 'grah', 1.08), -4, 2, 0.8);
  add(mk('claw1', 'Коготь смерти', 'deathclaw'), -12, -14, 0.8);
  add(mk('claw2', 'Коготь смерти', 'deathclaw'), -2, 14, 0.8);
  add(mk('claw3', 'Коготь смерти', 'deathclaw'), 18, 9, 0.8);
}

export const VAULT13: LocationDef = {
  id: 'vault13',
  name: 'Убежище 13',
  indoor: true,
  terrain: {
    seed: 7,
    hills: 0,
    flatZones: [{ x: 0, z: 0, r: 70 }],
    mesas: [],
    paths: [],
    groundZones: [{ x: -2, z: 0, r: 44, color: '#4c5056', strength: 1 }],
    palette: { sand: '#2a2826', sandDark: '#1e1c1a', rock: '#2a2624', rockLight: '#3a3632', dirt: '#3a3c40' },
  },
  entries: { default: [-42, 0], world: [-42, 0] },
  exits: [EXIT],
  scatter: { rocks: 0, trees: 0, grass: 0, reserved: [] },
  build,
  spawn,
};
