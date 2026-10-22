import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { brahmin, human, wildDog, slag, SKIN } from '../../game/bestiary';

const EXIT = { x: -58, z: 4, r: 4 };
/** Ферма призраков на востоке: люк в подземелье слагов. */
export const HATCH = { x: 34, z: -6 };
export const SLAG_IDS = ['hen', 'slag1', 'slag2', 'slag3'];

/** Грядка: ровные ряды стеблей, живых или высохших. */
function cropField(w: World, cx: number, cz: number, rows: number, len: number, dead: boolean) {
  const stalkGeo = new THREE.ConeGeometry(dead ? 0.07 : 0.16, 1.1, 5);
  stalkGeo.translate(0, 0.55, 0);
  const mat = new THREE.MeshStandardMaterial({ color: dead ? '#6a5a3a' : '#5a7a2a', roughness: 0.9 });
  const count = rows * Math.floor(len / 0.8);
  const mesh = new THREE.InstancedMesh(stalkGeo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < Math.floor(len / 0.8); k++) {
      const x = cx - len / 2 + k * 0.8 + Math.sin(r * 7 + k) * 0.1;
      const z = cz - rows + r * 2;
      const h = dead ? 0.5 + ((r * 13 + k * 7) % 5) * 0.08 : 0.9 + ((r * 13 + k * 7) % 5) * 0.08;
      q.setFromEuler(new THREE.Euler(dead ? Math.sin(k * 3.1 + r) * 0.4 : 0, k, 0));
      s.set(1, h, 1);
      m.compose(new THREE.Vector3(x, w.y(x, z) - 0.05, z), q, s);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.castShadow = true;
  w.group.add(mesh);
  // Борозды под ногами не мешают ходьбе — грядки проходимы.
}

function scarecrow(w: World, x: number, z: number, rot: number) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), w.mat.darkWood);
  pole.position.y = 1.2;
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), w.mat.darkWood);
  arms.rotation.z = Math.PI / 2;
  arms.position.y = 1.8;
  const rag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.25), new THREE.MeshStandardMaterial({ color: '#4a3e30', roughness: 1 }));
  rag.position.y = 1.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#a89070', roughness: 1 }));
  head.position.y = 2.35;
  head.rotation.z = 0.4;
  g.add(pole, arms, rag, head);
  w.place(g, x, z, rot, 0);
  w.nav.blockCircle(x, z, 0.3);
}

function build(w: World, flags: Set<string>) {
  // Городок: хибары вдоль улицы, лавка кожевника, дом мэра.
  const shacks: [number, number, number, string?][] = [
    [-34, -10, 0, 'Мэрия'], [-22, -10, 0, 'Кожи'], [-10, -10, 0], [-34, 12, Math.PI], [-20, 12, Math.PI, 'Салун'],
  ];
  shacks.forEach(([x, z, rot, s], i) => {
    const sh = w.shack(7, 6, 3, 1400 + i, { porch: !!s, sign: s });
    w.placeFlat(sh, x, z, rot, 4);
    w.nav.blockRect(x, z, 3.8, 3.3, rot);
  });
  w.place(w.waterTower(), -4, 12, 0.3, 0);
  for (const [x, z] of [[-5.1, 10.9], [-2.9, 10.9], [-5.1, 13.1], [-2.9, 13.1]]) w.nav.blockCircle(x, z, 0.5);
  w.burningBarrel(-24, 2);
  // Загон для браминов и бойня Гришэма.
  w.fence([[-8, 24], [12, 24], [12, 36], [-8, 36]], true);
  // Поля Модока к северу.
  cropField(w, -14, -30, 6, 18, false);
  cropField(w, 6, -30, 6, 14, false);

  // Ферма призраков: мёртвые поля, пугала, остов дома, туман.
  w.placeFlat(w.ruin(9, 7, 3.2, 77), 40, -18, 0.3, 5);
  w.blockWalls(40, -18, 9, 7, 0.3);
  cropField(w, 30, 6, 5, 16, true);
  cropField(w, 44, -4, 4, 8, true);
  scarecrow(w, 26, 2, 0.4);
  scarecrow(w, 44, 8, -0.8);
  scarecrow(w, 30, -14, 2);
  w.place(w.carWreck(1401), 22, -20, 1.1, 0.1);
  w.nav.blockRect(22, -20, 1.1, 2.3, 1.1);
  w.tree(48, -12, 1.4, 1);
  w.tree(20, 12, 1.2, 1);
  for (const [x, z] of [[30, 0], [38, 4], [36, -10], [28, -8], [44, -2]]) w.addSteam(new THREE.Vector3(x, w.y(x, z) + 0.2, z));
  const ghostLight = new THREE.PointLight(0x80a0ff, 3, 16, 1.6);
  ghostLight.position.set(HATCH.x, w.y(HATCH.x, HATCH.z) + 2.5, HATCH.z);
  w.group.add(ghostLight);

  // Люк в подземные туннели слагов, прикрытый досками.
  const hatch = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16), w.mat.rust);
  plate.position.y = 0.06;
  hatch.add(plate);
  for (let i = -1; i <= 1; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.3), w.mat.darkWood);
    plank.position.set(0, 0.16, i * 0.45);
    plank.rotation.y = i * 0.15;
    if (!flags.has('slagsMet')) hatch.add(plank);
  }
  w.place(hatch, HATCH.x, HATCH.z, 0.2, 0);
  w.nav.blockCircle(HATCH.x, HATCH.z, 0.9);
  w.interactable({ id: 'ghostHatch', name: 'Заколоченный люк', object: hatch, approach: new THREE.Vector3(HATCH.x - 1.8, 0, HATCH.z + 0.6) });
}

/** Слаги выходят из-под земли. Мирные, пока их не трогают. */
export function spawnSlags(g: Game) {
  const add = g.spawn.bind(g);
  const hostile = g.flags.has('slagsHostile');
  const list = [
    add(slag('hen', 'Хен, старейшина слагов', 0, { dialogue: 'hen' }), HATCH.x + 2.5, HATCH.z - 1.5),
    add(slag('slag1', 'Слаг', 1), HATCH.x + 4, HATCH.z + 2),
    add(slag('slag2', 'Слаг', 2), HATCH.x - 1, HATCH.z - 4),
    add(slag('slag3', 'Слаг', 1), HATCH.x + 6, HATCH.z - 3),
  ];
  for (const a of list) if (a && hostile) {
    a.faction = 'hostile';
    a.dialogue = undefined;
    a.detectRadius = 30;
  }
  if (g.flags.has('slagsPeace') && !g.flags.has('karlHome')) spawnKarl(g, HATCH.x - 2, HATCH.z + 3);
}

export function spawnKarl(g: Game, x: number, z: number) {
  g.spawn(human('karl', 'Карл', { skin: SKIN.a, cloth: '#4a4a3a', hair: '#7a5a3a', top: '#5a6a3a' }, 'none', { dialogue: 'karl', wanderRadius: 3 }), x, z);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('jo', 'Мэр Джо', { skin: SKIN.b, cloth: '#3a3a44', hair: '#9a9a90', top: '#5a4a3a', beard: true }, 'none', { dialogue: 'modocJo' }), -34, -5.5);
  add(human('balthas', 'Кожевник Балтас', { skin: SKIN.pale, cloth: '#5a3c22', hair: '#2a1a10', top: '#6a4a2a', build: 1.1 }, 'none', { dialogue: 'balthas' }), -22, -5.5);
  add(human('grisham', 'Фермер Гришэм', { skin: SKIN.a, cloth: '#4a4030', hair: '#5a3a1a', top: '#6a5a3a', build: 1.15 }, 'none', { dialogue: 'grisham' }), 2, 21);
  add(human('farrel', 'Фаррел', { skin: SKIN.c, cloth: '#3e3a30', hair: '#3a3a3a', beard: true }, 'none', { dialogue: 'farrel', wanderRadius: 3 }), -20, 7);
  add(human('modoc1', 'Фермер', { skin: SKIN.b, cloth: '#4a4232', hair: '#1a1210', top: '#5a6a3a' }, 'none', { dialogue: 'modocFolk', wanderRadius: 6 }), -14, -22);
  add(human('modoc2', 'Фермерша', { skin: SKIN.a, cloth: '#5a4a3a', hair: '#8a5a2a', build: 0.9 }, 'none', { dialogue: 'modocFolk', wanderRadius: 6 }), -16, 2);
  if (g.flags.has('karlHome')) spawnKarl(g, -18, 6);
  for (let i = 0; i < 3; i++) add(brahmin(`mbrahmin${i}`), -2 + i * 4, 30);
  // Дикие собаки рыщут у северных полей.
  if (g.quests.dogs?.state !== 'rewarded') {
    const spots: [number, number][] = [[-30, -40], [-26, -44], [-34, -36], [-22, -40]];
    spots.forEach(([x, z], i) => add(wildDog(`wdog${i}`), x, z, 0.6));
  }
  if (g.flags.has('slagsMet')) spawnSlags(g);
}

export const MODOC: LocationDef = {
  id: 'modoc',
  name: 'Модок',
  terrain: {
    seed: 14,
    hills: 5,
    flatZones: [{ x: -16, z: 0, r: 36 }, { x: 36, z: -4, r: 22 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: 10, z: -60, r: 12, h: 10 }, { x: 56, z: 34, r: 10, h: 8 }],
    paths: [[[-58, 4], [-16, 2], [20, 0], [HATCH.x - 2, HATCH.z + 1]], [[-4, 2], [2, 22]]],
    groundZones: [
      { x: 36, z: -4, r: 20, color: '#4a4436', strength: 0.7 },
      { x: -4, z: -30, r: 16, color: '#6a5a3a', strength: 0.5 },
    ],
    palette: { sand: '#b49a72', sandDark: '#94805c', rock: '#7a6450', rockLight: '#9a8268', dirt: '#6a5844' },
  },
  entries: { default: [-50, 4], world: [-50, 4] },
  exits: [EXIT],
  scatter: { rocks: 220, trees: 20, grass: 2600, reserved: [{ x: -16, z: 0, r: 32 }, { x: 36, z: -4, r: 18 }, { x: -4, z: -30, r: 14 }] },
  build,
  spawn,
};
