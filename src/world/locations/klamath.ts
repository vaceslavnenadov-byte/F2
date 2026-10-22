import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { brahmin, human, rat, sulik, SKIN } from '../../game/bestiary';

const EXIT = { x: 56, z: 0, r: 4 };
const WAREHOUSE = { x: -40, z: 10 };
const CORRAL = { x: 30, z: -19 };

function build(w: World) {
  // Постройки вдоль главной улицы (ось X). [x, z, ширина, глубина, высота, разворот, опции]
  const houses: [number, number, number, number, number, number, { porch?: boolean; sign?: string }][] = [
    [0, -13, 12, 8, 3.8, 0, { porch: true, sign: 'Салун' }],
    [-18, -12, 7, 6, 3, 0, { porch: true }],
    [17, -12, 8, 6, 3.2, 0, {}],
    [-15, 12, 7, 6, 3, Math.PI, {}],
    [13, 12, 8, 6, 3.2, Math.PI, { porch: true }],
    [30, 12, 6, 5, 2.8, Math.PI, {}],
    [WAREHOUSE.x, WAREHOUSE.z, 10, 7, 3.6, Math.PI / 2, { sign: 'Склад' }],
  ];
  houses.forEach(([x, z, sw, sd, sh, rot, opts], i) => {
    const s = w.shack(sw, sd, sh, i * 11 + 5, opts);
    w.placeFlat(s, x, z, rot, Math.max(sw, sd) / 2);
    // Корпус непроходим, крыльцо — проходимо.
    w.nav.blockRect(x, z, sw / 2 + 0.3, sd / 2 + 0.3, rot);
    if (opts.porch) {
      const px = x + Math.sin(rot) * (sd / 2 + 1.9);
      const pz = z + Math.cos(rot) * (sd / 2 + 1.9);
      for (const side of [-1, 1]) {
        const ox = Math.cos(rot) * side * (sw / 2 - 0.2);
        const oz = -Math.sin(rot) * side * (sw / 2 - 0.2);
        w.nav.blockCircle(px + ox, pz + oz, 0.4);
      }
    }
  });

  w.placeFlat(w.waterTower(), -28, -14, 0.3, 2);
  for (const [x, z] of [[-29.1, -15.1], [-26.9, -15.1], [-29.1, -12.9], [-26.9, -12.9]]) w.nav.blockCircle(x, z, 0.5);

  // Загон Торра.
  const c = CORRAL;
  w.fence([[c.x - 6, c.z - 4], [c.x + 6, c.z - 4], [c.x + 6, c.z + 4], [c.x - 6, c.z + 4]], true);

  // Повозка, бочки, ящики — уличный быт.
  const cart = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.6), w.mat.planks);
  bed.position.y = 0.8;
  cart.add(bed);
  for (const [x, z] of [[-0.9, 0.8], [0.9, 0.8], [-0.9, -0.8], [0.9, -0.8]]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 14), w.mat.darkWood);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.45, z);
    cart.add(wheel);
  }
  w.place(cart, 8, -4.5, 1.4, 0);
  w.nav.blockRect(8, -4.5, 1.4, 0.9, 1.4);
  const props: [number, number][] = [[-6, -7.5], [-6.8, -7], [22, -7.5], [-34, 5], [-35, 6], [-33.5, 15], [35, 8]];
  props.forEach(([x, z], i) => {
    const obj = i % 3 === 0 ? w.barrel(false) : w.crate(0.7 + w.rnd() * 0.3);
    if (i % 3 !== 0) obj.position.y = 0.35;
    const holder = new THREE.Group();
    holder.add(obj);
    w.place(holder, x, z, w.rnd() * 3, 0.02);
    w.nav.blockCircle(x, z, 0.5);
  });
  w.burningBarrel(-4, 4);
  w.burningBarrel(20, 4);
  for (const [x, z] of [[-40, -25], [45, 20], [-52, 30], [25, 35]]) w.tree(x, z, 1.1, 1);

  // Кости брамина у загона — гекконы тут тоже шастают.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), w.mat.bone);
  skull.scale.set(1, 0.8, 1.4);
  w.place(skull, c.x + 8, c.z + 6, 0.5, -0.05);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('maida', 'Мэйда Бакнер', { skin: SKIN.pale, cloth: '#5a4a3a', hair: '#6a3a1a', top: '#7a5a3a', build: 0.9 }, 'none', { dialogue: 'maida' }), -2, -6.6);
  if (!g.flags.has('sulikJoined')) add(sulik(), 5, -6.2);
  add(human('torr', 'Торр', { skin: SKIN.a, cloth: '#5a4636', hair: '#3a2516', top: '#6a5038', beard: true, build: 1.1 }, 'staff', { dialogue: 'torr', wanderRadius: 3 }), CORRAL.x - 8, CORRAL.z + 6);
  add(human('kfolk1', 'Житель Кламата', { skin: SKIN.pale, cloth: '#4a4038', hair: '#2a2018', top: '#5a5040' }, 'none', { dialogue: 'klamathFolk', wanderRadius: 10 }), -10, 2);
  add(human('kfolk2', 'Траппер', { skin: SKIN.b, cloth: '#4a3a2a', hair: '#1a1208', top: '#6a5a3a', build: 1.05 }, 'spear', { dialogue: 'klamathFolk', wanderRadius: 10 }), 15, 3);
  add(human('kfolk3', 'Жительница Кламата', { skin: SKIN.a, cloth: '#6a5040', hair: '#4a2a10', top: '#8a6a4a', build: 0.85 }, 'none', { dialogue: 'klamathFolk', wanderRadius: 8 }), 25, 6);
  for (let i = 0; i < 3; i++) add(brahmin(`kbrahmin${i}`), CORRAL.x - 3 + i * 3, CORRAL.z + (i % 2 ? 1 : -1), 0.9);
  const ratSpots: [number, number][] = [[-35, 3], [-37, 17], [-46, 4], [-47, 15]];
  ratSpots.forEach(([x, z], i) => add(rat(`krat${i}`, 'rats'), x, z, 0.4));
}

export const KLAMATH: LocationDef = {
  id: 'klamath',
  name: 'Кламат',
  terrain: {
    seed: 2,
    hills: 7,
    flatZones: [{ x: 0, z: 0, r: 46 }, { x: EXIT.x, z: EXIT.z, r: 8 }],
    mesas: [
      { x: -45, z: -42, r: 9, h: 10 },
      { x: 50, z: 45, r: 10, h: 11 },
      { x: -56, z: 42, r: 8, h: 9 },
      { x: 52, z: -45, r: 9, h: 8 },
    ],
    paths: [[[-45, 2], [-20, 0], [20, 0], [56, 0]], [[0, 0], [0, -6]], [[28, 0], [28, -14]]],
    groundZones: [{ x: 0, z: 0, r: 34, color: '#8d6a4c', strength: 0.5 }],
    palette: { sand: '#c9a27a', sandDark: '#a88060', rock: '#7e5a44', rockLight: '#a67858', dirt: '#7d5f46' },
  },
  entries: { default: [48, 0], world: [48, 0] },
  exits: [EXIT],
  scatter: { rocks: 300, trees: 18, grass: 3000, reserved: [{ x: 0, z: 0, r: 44 }] },
  build,
  spawn,
};
