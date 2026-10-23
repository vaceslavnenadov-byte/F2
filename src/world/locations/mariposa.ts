import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { superMutant } from '../../game/bestiary';
import { bunker } from './sierra';

const EXIT = { x: -58, z: 0, r: 4 };
/** Цех ВРЭ: открытый зал с рухнувшей крышей и чанами вируса. */
export const VATS = { x: 22, z: -14 };
export const MARIPOSA_MUTANTS = ['gor', 'mmut0', 'mmut1', 'mmut2', 'mmut3', 'mmut4'];

/** Чан ВРЭ: стальной цилиндр с окном, внутри светится зелёная жижа. */
function vat(w: World, destroyed: boolean): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 4.2, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#6a706a', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }));
  shell.position.y = 2.1;
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.32, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), w.mat.metal);
  top.position.y = 4.2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.33, 1.33, 2.4, 20, 1, true, -0.8, 1.6), new THREE.MeshPhysicalMaterial({ color: '#a0e0b0', transparent: true, opacity: destroyed ? 0.08 : 0.3, roughness: 0.05 }));
  glass.position.y = 2.2;
  const goo = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.4, 20), new THREE.MeshStandardMaterial({ color: '#40a040', emissive: '#30ff40', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
  goo.position.y = 1.9;
  goo.name = 'fev';
  goo.visible = !destroyed;
  g.add(shell, top, glass, goo);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), w.mat.rust);
    leg.position.set(Math.cos(i * 1.57) * 1.2, 0.3, Math.sin(i * 1.57) * 1.2);
    g.add(leg);
  }
  return g;
}

function build(w: World, flags: Set<string>) {
  const destroyed = flags.has('fevDestroyed');
  // Колючая ограда базы с воротами на западе.
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#6a6c70', roughness: 0.5, metalness: 0.7, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (const [ax, az, bx, bz] of [[-38, -36, 44, -36], [-38, 36, 44, 36], [44, -36, 44, 36], [-38, -36, -38, -5], [-38, 5, -38, 36]]) {
    const len = Math.hypot(bx - ax, bz - az);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), fenceMat);
    mesh.position.set((ax + bx) / 2, w.y((ax + bx) / 2, (az + bz) / 2) + 1.4, (az + bz) / 2);
    mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    w.group.add(mesh);
    const n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.45);
  }
  bunker(w, -18, -20, 12, 7, 3.5, 0, 'Казармы');
  bunker(w, -18, 20, 10, 8, 4, Math.PI, 'Штаб');
  bunker(w, 10, 22, 16, 9, 5, Math.PI, 'Ангар');
  // Цех ВРЭ: стены без крыши, трубы и пульт.
  const H = 4.6;
  const hall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.6), w.mat.concrete);
    m.castShadow = m.receiveShadow = true;
    m.position.set((ax + bx) / 2, w.y((ax + bx) / 2, (az + bz) / 2) + H / 2 - 0.3, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    w.group.add(m);
    const n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) w.nav.blockCircle(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.5);
  };
  const { x: vx, z: vz } = VATS;
  hall(vx - 12, vz - 10, vx + 12, vz - 10);
  hall(vx + 12, vz - 10, vx + 12, vz + 10);
  hall(vx - 12, vz + 10, vx - 3, vz + 10);
  hall(vx + 3, vz + 10, vx + 12, vz + 10);
  hall(vx - 12, vz - 10, vx - 12, vz + 10);
  // Балки рухнувшей крыши.
  for (const [x, z, r] of [[vx - 6, vz + 4, 0.4], [vx + 7, vz - 3, -0.3]] as const) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 9), w.mat.rust);
    beam.rotation.set(0.25, r, 0.1);
    beam.position.set(x, w.y(x, z) + 1, z);
    w.group.add(beam);
  }
  const vatGroup = new THREE.Group();
  for (const [ox, oz] of [[-6, -5], [0, -5], [6, -5]]) {
    const v = vat(w, destroyed);
    v.position.set(ox, 0, oz);
    vatGroup.add(v);
    w.nav.blockCircle(vx + ox, vz + oz, 1.6);
  }
  w.place(vatGroup, vx, vz, 0, 0);
  const glow = new THREE.PointLight(0x50ff50, destroyed ? 0 : 14, 22, 1.5);
  glow.name = 'fevGlow';
  glow.position.set(vx, w.y(vx, vz) + 3, vz - 3);
  w.group.add(glow);
  const console_ = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.8), w.mat.metal);
  desk.position.y = 0.55;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshStandardMaterial({ color: '#081008', emissive: destroyed ? '#401010' : '#40ff60', emissiveIntensity: 1.3 }));
  scr.position.set(0, 1.2, 0.41);
  scr.rotation.x = -0.3;
  console_.add(desk, scr);
  w.place(console_, vx, vz + 1, 0, 0);
  w.nav.blockRect(vx, vz + 1, 1.3, 0.5);
  w.interactable({ id: 'fevConsole', name: 'Пульт чанов ВРЭ', object: console_, approach: new THREE.Vector3(vx, 0, vz + 2.6) });
  // Шкафчик в казармах с армейским снаряжением.
  if (!flags.has('mariposaLocker')) {
    const locker = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.9, 0.6), new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: 0.7, metalness: 0.4 }));
    locker.position.y = 0.95;
    const lg = new THREE.Group();
    lg.add(locker);
    w.place(lg, -12.6, -15.6, 0, 0);
    w.nav.blockCircle(-12.6, -15.6, 0.7);
    w.interactable({ id: 'mariposaLocker', name: 'Армейский шкафчик', object: lg, approach: new THREE.Vector3(-12.6, 0, -14.2) });
  }
  w.place(w.carWreck(1801), -26, 4, 1.4, 0.1);
  w.nav.blockRect(-26, 4, 1.1, 2.3, 1.4);
  for (const [x, z] of [[-30, -30], [38, 30]]) {
    const spot = new THREE.SpotLight(0xfff0d0, 24, 30, 0.5, 0.5, 1.4);
    spot.position.set(x, w.y(x, z) + 8, z);
    spot.target.position.set(0, 0, 0);
    w.group.add(spot, spot.target);
  }
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  if (g.flags.has('mutantsLeft')) return;
  const gor = superMutant('gor', 'mmutants');
  gor.name = 'Надзиратель Гор';
  gor.hp = gor.maxHp = 140;
  gor.xp = 900;
  gor.dt = 5;
  gor.rig.root.scale.multiplyScalar(1.12);
  gor.dialogue = 'gor';
  const list = [add(gor, VATS.x, VATS.z + 6, 0.8)];
  const spots: [number, number][] = [[-30, -2], [-28, 6], [0, -6], [4, 8], [VATS.x + 6, VATS.z + 4]];
  spots.forEach(([x, z], i) => list.push(add(superMutant(`mmut${i}`, 'mmutants'), x, z, 0.8)));
  // С Маркусом в отряде мутанты сперва готовы говорить.
  const parley = g.party.some((a) => a.id === 'marcus') && !g.flags.has('mutantsHostile');
  for (const a of list) if (a) {
    if (parley) {
      a.faction = 'villager';
      a.detectRadius = 0;
      if (a.id !== 'gor') a.dialogue = 'mmutant';
    } else a.dialogue = undefined;
  }
}

export const MARIPOSA: LocationDef = {
  id: 'mariposa',
  name: 'База Марипоса',
  terrain: {
    seed: 19,
    hills: 6,
    flatZones: [{ x: 4, z: 0, r: 50 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 30, z: -58, r: 14, h: 14 }, { x: -50, z: 44, r: 10, h: 9 }],
    paths: [[[-58, 0], [-38, 0], [VATS.x, VATS.z + 10]]],
    groundZones: [{ x: 4, z: 0, r: 40, color: '#6a6a60', strength: 0.55 }, { x: VATS.x, z: VATS.z - 4, r: 8, color: '#3a5a2a', strength: 0.5 }],
    palette: { sand: '#b0a07c', sandDark: '#928260', rock: '#706250', rockLight: '#908270', dirt: '#5e5a4a' },
  },
  entries: { default: [-50, 0], world: [-50, 0] },
  exits: [EXIT],
  radZones: [{ x: VATS.x, z: VATS.z - 5, r: 7, rate: 1.5 }],
  scatter: { rocks: 200, trees: 10, grass: 1800, reserved: [{ x: 4, z: 0, r: 46 }] },
  build,
  spawn,
};
