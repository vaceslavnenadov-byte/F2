import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { human, SKIN } from '../../game/bestiary';

const EXIT = { x: -58, z: 6, r: 4 };
/** Вход в шахту Кокавиф под копром на севере. */
export const MINE_DOOR = { x: 18, z: -30 };

/** Копёр: деревянная башня с колесом над стволом шахты. */
function headframe(w: World, x: number, z: number) {
  const g = new THREE.Group();
  const H = 9;
  for (const [sx, sz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), w.mat.darkWood);
    post.position.set(sx * (1 - 0.15), H / 2, sz * (1 - 0.15));
    post.rotation.set(sz * 0.05, 0, -sx * 0.05);
    g.add(post);
  }
  for (let y = 2; y < H; y += 2.4) {
    for (const r of [0, Math.PI / 2]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), w.mat.darkWood);
      brace.position.y = y;
      brace.rotation.y = r;
      g.add(brace);
    }
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 6, 20), w.mat.rust);
  wheel.position.y = H + 0.6;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8), w.mat.rust);
  hub.rotation.x = Math.PI / 2;
  hub.position.y = H + 0.6;
  wheel.name = 'wheel';
  g.add(wheel, hub);
  w.placeFlat(g, x, z, 0.3, 3);
  w.nav.blockRect(x, z, 2, 2, 0.3);
}

function build(w: World) {
  const shacks: [number, number, number, string?][] = [
    [-34, -10, 0, 'Мэрия'], [-20, -10, 0, 'Маламут'], [-6, -10, 0, 'Доктор'], [-30, 14, Math.PI], [-14, 14, Math.PI, 'Контора'], [2, 14, Math.PI],
  ];
  shacks.forEach(([x, z, rot, s], i) => {
    const sh = w.shack(7, 6, 3, 1500 + i, { porch: !!s, sign: s });
    w.placeFlat(sh, x, z, rot, 4);
    w.nav.blockRect(x, z, 3.8, 3.3, rot);
  });
  w.burningBarrel(-12, 2);
  w.burningBarrel(10, -4);
  w.place(w.waterTower(), 14, 10, 0.5, 0);
  for (const [x, z] of [[12.9, 8.9], [15.1, 8.9], [12.9, 11.1], [15.1, 11.1]]) w.nav.blockCircle(x, z, 0.5);

  // Шахта Кокавиф: копёр, зев штольни в склоне и вагонетки.
  headframe(w, MINE_DOOR.x + 6, MINE_DOOR.z + 2);
  const portal = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 2), w.mat.void);
  hole.position.y = 1.8;
  portal.add(hole);
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), w.mat.darkWood);
    beam.position.set(sx * 2.2, 2, 1);
    portal.add(beam);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.45), w.mat.darkWood);
  lintel.position.set(0, 4, 1);
  const warn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: '#c8a020' }));
  warn.position.set(0, 4.6, 1.1);
  portal.add(lintel, warn);
  w.placeFlat(portal, MINE_DOOR.x, MINE_DOOR.z, 0, 3);
  w.nav.blockRect(MINE_DOOR.x, MINE_DOOR.z, 2.6, 1.2);
  w.interactable({ id: 'kokoweef', name: 'Шахта Кокавиф', object: portal, approach: new THREE.Vector3(MINE_DOOR.x, 0, MINE_DOOR.z + 2.6) });
  // Баррикада из досок у входа — шахтёры заколотили штольню от тварей.
  for (const [x, z, r] of [[MINE_DOOR.x - 4, MINE_DOOR.z + 3, 0.3], [MINE_DOOR.x + 3.5, MINE_DOOR.z + 4, -0.5]] as const) {
    w.place(w.carWreck(1500 + x), x, z, r, 0.1);
    w.nav.blockRect(x, z, 1.1, 2.3, r);
  }
  for (const [x, z] of [[-40, -30], [40, 30], [-44, 34], [30, 28]]) w.tree(x, z, 1.2, 2);
  const lamp = new THREE.PointLight(0xffc070, 10, 14, 1.6);
  lamp.position.set(MINE_DOOR.x, w.y(MINE_DOOR.x, MINE_DOOR.z + 3) + 3.5, MINE_DOOR.z + 3);
  w.group.add(lamp);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('dutton', 'Мэр Даттон', { skin: SKIN.pale, cloth: '#2a2a30', hair: '#6a6a60', top: '#4a3a30', build: 1.12 }, 'none', { dialogue: 'dutton' }), -34, -5.5);
  add(human('marge', 'Марж Лабарж', { skin: SKIN.a, cloth: '#6a2a3a', hair: '#c88a3a', build: 0.9 }, 'none', { dialogue: 'marge' }), -20, -5.5);
  add(human('docJohnson', 'Доктор Джонсон', { skin: SKIN.b, cloth: '#d8d4c8', hair: '#3a3a3a', top: '#e8e4d8' }, 'none', { dialogue: 'docJohnson' }), -6, -5.5);
  const miners: [number, number][] = [[-24, 2], [-2, 4], [8, -14], [MINE_DOOR.x - 2, MINE_DOOR.z + 8]];
  miners.forEach(([x, z], i) =>
    add(human(`rminer${i}`, 'Шахтёр', { skin: [SKIN.a, SKIN.b, SKIN.c][i % 3], cloth: '#4a4030', hair: '#2a1a10', top: '#6a5a40', build: 1.1, beard: i % 2 === 0 }, i % 2 ? 'sledge' : 'none', { dialogue: 'reddingFolk', wanderRadius: 6 }), x, z),
  );
}

export const REDDING: LocationDef = {
  id: 'redding',
  name: 'Реддинг',
  terrain: {
    seed: 15,
    hills: 7,
    flatZones: [{ x: -14, z: 2, r: 34 }, { x: MINE_DOOR.x, z: MINE_DOOR.z + 6, r: 12 }, { x: EXIT.x, z: EXIT.z, r: 9 }],
    mesas: [{ x: MINE_DOOR.x + 2, z: MINE_DOOR.z - 16, r: 12, h: 14 }, { x: -40, z: -46, r: 10, h: 10 }],
    paths: [[[-58, 6], [-14, 2], [MINE_DOOR.x, MINE_DOOR.z + 4]]],
    groundZones: [{ x: MINE_DOOR.x, z: MINE_DOOR.z + 6, r: 10, color: '#5a5040', strength: 0.6 }],
    palette: { sand: '#a89276', sandDark: '#8a765c', rock: '#6e5c4e', rockLight: '#8c7a6a', dirt: '#5e5244' },
  },
  entries: { default: [-50, 6], world: [-50, 6], mine: [MINE_DOOR.x, MINE_DOOR.z + 6] },
  exits: [EXIT],
  nightAmbient: 0.2,
  scatter: { rocks: 260, trees: 16, grass: 1800, reserved: [{ x: -14, z: 2, r: 30 }, { x: MINE_DOOR.x, z: MINE_DOOR.z + 6, r: 10 }] },
  build,
  spawn,
};
