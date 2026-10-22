import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import type { Platform } from '../terrain';
import { enclaveSoldier, human, turret, SKIN } from '../../game/bestiary';
import { deck, tanker, vertibird } from '../props';

const H = 5;
export const RIG_DOCK = { x: 41, z: 2 };
const EXIT = { x: 45.5, z: 2, r: 2.3 };
export const CELL = { x: 0, z: -25 };
export const TRIBE_IDS = ['elder', 'nagor', 'hunter1', 'woman1', 'kid'];
export const RIG_SOLDIERS = ['rigsoldier0', 'rigsoldier1', 'rigsoldier2', 'rigsoldier3', 'rigsoldier4', 'rigsoldier5', 'rigofficer'];

const PLATFORMS: Platform[] = [
  { x: 41, z: 0, hw: 7, hd: 11, h: H }, // причал
  { x: 26, z: 0, hw: 8.5, hd: 2.2, h: H }, // мост к центру
  { x: 0, z: 0, hw: 17, hd: 14, h: H }, // центральная палуба
  { x: 0, z: -24, hw: 10, hd: 7, h: H }, // тюремный блок
  { x: 0, z: -15.5, hw: 2.2, hd: 2.5, h: H },
  { x: 0, z: 24, hw: 10, hd: 7, h: H }, // реакторная палуба
  { x: 0, z: 15.5, hw: 2.2, hd: 2.5, h: H },
  { x: -26, z: 0, hw: 7, hd: 7, h: H }, // вертолётная площадка
  { x: -18, z: 0, hw: 2.5, hd: 2.2, h: H },
];

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
  for (const p of PLATFORMS) deck(w, p.x, p.z, p.hw, p.hd, H, false);

  // Командный модуль в центре.
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4e54', roughness: 0.5, metalness: 0.6, normalMap: w.mat.stone.normalMap });
  const module = new THREE.Group();
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(12, 5, 7, 4, 2, 3), 0.03, 1, 9), steel);
  body.position.y = 2.5;
  const win = new THREE.Mesh(new THREE.BoxGeometry(12.1, 1, 7.1), new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffd8a0', emissiveIntensity: 0.8 }));
  win.position.y = 3.6;
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshStandardMaterial({ color: '#c8c8c8', metalness: 0.8, roughness: 0.3 }));
  emblem.position.set(0, 2.2, 3.52);
  module.add(body, win, emblem);
  w.place(module, -3, -5, 0, 0);
  w.nav.blockRect(-3, -5, 6.3, 3.8);
  const cells = terminal(w, -6, -0.6, 0, '#40ff60');
  w.interactable({ id: 'cellTerminal', name: 'Пульт тюремного блока', object: cells, approach: new THREE.Vector3(-6, 0, 1.2) });
  const tur = terminal(w, 0, -0.6, 0, '#ffb040');
  w.interactable({ id: 'turretTerminal', name: 'Пульт защиты периметра', object: tur, approach: new THREE.Vector3(0, 0, 1.2) });

  // Факельная вышка с огнём.
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 18, 10), w.mat.rust);
  flare.position.y = 9;
  const fg = new THREE.Group();
  fg.add(flare);
  w.place(fg, 13, -10, 0, 0);
  w.nav.blockCircle(13, -10, 1.2);
  w.addFlame(new THREE.Vector3(13, H + 18.3, -10), 40, 2.6);
  // Цистерны и трубы.
  for (const [x, z] of [[11, 8], [14.5, 8], [-13, -10]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 20), steel);
    t.position.y = 2;
    const g = new THREE.Group();
    g.add(t);
    w.place(g, x, z, 0, 0);
    w.nav.blockCircle(x, z, 1.8);
  }

  // Тюремный блок: решётка, внутри — пленники.
  const c = CELL;
  if (!flags.has('tribeFreed')) {
    const cage = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const side = Math.floor(i / 7);
      const t = (i % 7) / 7;
      const [x, z] = [[-5 + t * 10, -3], [5, -3 + t * 6], [5 - t * 10, 3], [-5, 3 - t * 6]][side];
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), w.mat.metal);
      bar.position.set(x, 1.5, z);
      cage.add(bar);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.15, 6.4), steel);
    roof.position.y = 3;
    cage.add(roof);
    w.place(cage, c.x, c.z, 0, 0);
    w.blockWalls(c.x, c.z, 10, 6, 0, 0);
  }

  // Реактор на южной палубе.
  const reactor = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 20), new THREE.MeshStandardMaterial({ color: '#204060', emissive: '#40a0ff', emissiveIntensity: 2.2 }));
  core.position.y = 3;
  reactor.add(dome, core);
  w.place(reactor, 0, 27, 0, 0);
  w.nav.blockCircle(0, 27, 4.4);
  const glow = new THREE.PointLight(0x40a0ff, 18, 16, 1.6);
  glow.position.set(0, H + 5, 27);
  w.group.add(glow);
  const rt = terminal(w, 0, 20.5, Math.PI, '#ff3020');
  w.interactable({ id: 'rigReactor', name: 'Пульт реактора', object: rt, approach: new THREE.Vector3(0, 0, 18.6) });

  // Вертолётная площадка.
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.4, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c8a020' }));
  ring.position.set(-26, H + 0.05, 0);
  w.group.add(ring);
  const vb = vertibird(w);
  vb.position.set(-26, H, 0);
  vb.rotation.y = Math.PI / 2;
  vb.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  w.group.add(vb);
  w.nav.blockRect(-26, 0, 6, 2, Math.PI / 2);
  w.nav.blockRect(-26, 0, 1.2, 6, Math.PI / 2);

  // «Посейдон» у причала.
  const ship = tanker(w);
  ship.position.set(56.5, 1.6, 4);
  w.group.add(ship);

  // Прожекторы по углам центральной палубы.
  for (const [x, z] of [[-16, -13], [16, 13]]) {
    const spot = new THREE.SpotLight(0xe8f0ff, 40, 40, 0.5, 0.6, 1.4);
    spot.position.set(x, H + 7, z);
    spot.target.position.set(0, H, 0);
    w.group.add(spot, spot.target);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  // Новобранец из Наварро в силовой броне сходит за своего, пока не поднята тревога.
  const disguised = g.disguisedOnRig;
  const role = (dialogue: string) => (disguised ? { faction: 'villager' as const, detectRadius: 0, dialogue } : { faction: 'hostile' as const, detectRadius: 12 });
  const soldiers: [number, number][] = [[38, -6], [36, 7], [8, 4], [-8, 6], [6, -24], [-24, 4]];
  soldiers.forEach(([x, z], i) => add(enclaveSoldier(`rigsoldier${i}`, { ...role('enclaveTalk'), wanderRadius: 3 }), x, z));
  const officer = enclaveSoldier('rigofficer', { ...role('rigOfficer'), loot: [['keycard', 1, 1], ['microcell', 4, 8], ['stimpak', 1, 2]] });
  officer.name = 'Офицер Анклава';
  add(officer, -10, -1);
  const hacked = g.flags.has('turretsHacked');
  for (const [id, x, z] of [['rigturret0', -10, 9], ['rigturret1', 10, -2]] as const) {
    const t = turret(id, !hacked);
    if (disguised && !hacked) t.detectRadius = 0;
    add(t, x, z, 0.6);
  }
  if (!g.flags.has('tribeFreed')) {
    const looks = [
      ['Старейшина', { skin: '#b0805e', cloth: '#5a3d2a', hair: '#d8d4cc', top: '#7a2e22', beard: true, scale: 0.96 }],
      ['Нагор', { skin: '#c08a62', cloth: '#7b5a3c', hair: '#2a1a10' }],
      ['Охотник', { skin: SKIN.b, cloth: '#5e4a36', hair: '#1e140c', build: 1.1 }],
      ['Жительница', { skin: '#b98260', cloth: '#7a6040', hair: '#20140c', top: '#9a7a4a', build: 0.88 }],
      ['Ребёнок', { skin: SKIN.a, cloth: '#6e5038', hair: '#3a2516', scale: 0.62 }],
    ] as const;
    TRIBE_IDS.forEach((id, i) => {
      const [name, look] = looks[i];
      add(human(`rig_${id}`, name, { ...look }, 'none', { dialogue: i === 0 ? 'elderRig' : 'tribeRig' }), CELL.x - 3.5 + i * 1.7, CELL.z + (i % 2 ? 1 : -1));
    });
  }
  if (g.flags.has('rigOverload')) g.spawnColonel();
}

export const OIL_RIG: LocationDef = {
  id: 'oilrig',
  name: 'Платформа Анклава',
  terrain: {
    seed: 10,
    hills: 4,
    base: -12,
    flatZones: [],
    mesas: [],
    paths: [],
    palette: { sand: '#5a5248', sandDark: '#4a443c', rock: '#4a4038', rockLight: '#6a5e52', dirt: '#3a3632' },
    water: 0,
    platforms: PLATFORMS,
  },
  entries: { default: [42, 2], world: [42, 2] },
  exits: [EXIT],
  scatter: { rocks: 0, trees: 0, grass: 0, reserved: [] },
  build,
  spawn,
  onExit(g) {
    g.leaveRig();
    return true;
  },
};
