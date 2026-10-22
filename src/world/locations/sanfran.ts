import * as THREE from 'three';
import type { World } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { human, superMutant, SKIN } from '../../game/bestiary';
import { container, crane, tanker } from '../props';

const EXIT = { x: 56, z: 0, r: 4 };
const DEPOT = { x: 26, z: -32 };
const WATER = -1.2;
const PIER_H = 0.3;
/** Пирсы заходят вглубь суши, чтобы стыковаться с берегом без ступеньки. */
const PIERS = [{ x: -26, z: -10, hw: 16, hd: 2.5 }, { x: -25, z: 16, hw: 17, hd: 3.5 }];

function build(w: World) {
  // Танкер у южного пирса.
  const ship = tanker(w);
  ship.rotation.y = -Math.PI / 2;
  ship.position.set(-50, WATER + 1.6, 27);
  w.group.add(ship);
  // Сходни.
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 5), w.mat.metal);
  ramp.position.set(-36, PIER_H + 1.6, 21.2);
  ramp.rotation.x = -0.5;
  w.group.add(ramp);

  // Пирсы: деревянный настил на сваях.
  for (const p of PIERS) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(p.hw * 2, 0.3, p.hd * 2), w.mat.planks);
    deck.position.set(p.x, PIER_H - 0.12, p.z);
    deck.receiveShadow = true;
    w.group.add(deck);
    for (let i = 0; i <= p.hw; i += 3) {
      for (const sz of [-1, 1]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), w.mat.darkWood);
        pile.position.set(p.x - p.hw + i * 2, PIER_H - 4, p.z + sz * (p.hd - 0.3));
        w.group.add(pile);
      }
    }
  }
  const cr = crane(w);
  w.place(cr, -16, 18.5, Math.PI / 2, 0);
  w.nav.blockCircle(-16, 18.5, 1);

  // Портовые склады и контейнеры.
  const colors = ['#8a3a28', '#2a5a7a', '#5a6a2a', '#9a7a2a', '#4a4a50'];
  const stacks: [number, number, number, number][] = [[2, 6, 0, 2], [5, 6, 0, 1], [2, 14, 0.1, 1], [-8, -18, 1.57, 2], [-8, -26, 1.57, 1], [10, 24, 0.3, 1]];
  stacks.forEach(([x, z, rot, n], i) => {
    for (let k = 0; k < n; k++) {
      const c = container(colors[(i + k) % colors.length]);
      c.position.y += k * 2.6;
      const g = new THREE.Group();
      g.add(c);
      w.place(g, x, z, rot, 0);
    }
    w.nav.blockRect(x, z, 1.5, 3.3, rot);
  });
  const sheds: [number, number, number][] = [[18, 8, 0], [30, 10, 0], [16, -8, Math.PI], [32, -8, Math.PI], [40, 22, Math.PI / 2]];
  sheds.forEach(([x, z, rot], i) => {
    const s = w.shack(9, 7, 4, 800 + i, { sign: i === 0 ? 'Порт' : undefined });
    s.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === w.mat.planks ? ((o as THREE.Mesh).material = w.mat.tin) : null));
    w.placeFlat(s, x, z, rot, 5);
    w.nav.blockRect(x, z, 4.8, 3.8, rot);
  });
  w.burningBarrel(8, 0);
  w.burningBarrel(-12, 4);
  w.burningBarrel(28, 0);

  // Топливный склад: цистерны за забором, на севере.
  const d = DEPOT;
  const tankMat = new THREE.MeshStandardMaterial({ color: '#a8a296', roughness: 0.6, metalness: 0.5, normalMap: w.mat.stone.normalMap });
  for (const [ox, oz] of [[-8, -6], [0, -7], [8, -6]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 6, 24), tankMat);
    t.position.y = 3;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 8, 0, Math.PI * 2, 0, Math.PI / 4), tankMat);
    cap.position.y = 6 - 3.4 * Math.cos(Math.PI / 4);
    const g = new THREE.Group();
    g.add(t, cap);
    w.placeFlat(g, d.x + ox, d.z + oz, 0, 3.5);
    w.nav.blockCircle(d.x + ox, d.z + oz, 3.8);
  }
  w.fence([[d.x - 14, d.z + 6], [d.x - 14, d.z - 13], [d.x + 14, d.z - 13], [d.x + 14, d.z + 6], [d.x + 3, d.z + 6]]);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('captain', 'Капитан Барнаби', { skin: SKIN.pale, cloth: '#2a2e3a', hair: '#c8c8c0', top: '#1e2a4a', beard: true, build: 1.1 }, 'none', { dialogue: 'captain' }), -26, 16);
  add(human('lee', 'Механик Ли', { skin: '#d8b090', cloth: '#3a3a30', hair: '#141010', top: '#5a5a40' }, 'none', { dialogue: 'mechanicLee' }), DEPOT.x - 6, DEPOT.z + 12);
  add(human('rico', 'Контрабандист Рико', { skin: SKIN.b, cloth: '#2a2420', hair: '#141010', top: '#5a1a1a', build: 0.95 }, 'gun', { dialogue: 'rico' }), 6, 10.5);
  const folks: [number, number][] = [[0, 0], [12, 14], [-14, -8], [24, 2]];
  folks.forEach(([x, z], i) =>
    add(human(`docker${i}`, i % 2 ? 'Докер' : 'Житель порта', { skin: [SKIN.pale, SKIN.a, SKIN.b, SKIN.c][i], cloth: '#3a3a36', hair: '#2a2018', top: i % 2 ? '#4a5a6a' : undefined }, 'none', { dialogue: 'sfFolk', wanderRadius: 9 }), x, z),
  );
  const muts: [number, number][] = [[DEPOT.x - 4, DEPOT.z], [DEPOT.x + 4, DEPOT.z + 1], [DEPOT.x, DEPOT.z - 1]];
  muts.forEach(([x, z], i) => add(superMutant(`mutant${i}`, 'mutants'), x, z, 0.8));
}

export const SAN_FRANCISCO: LocationDef = {
  id: 'sanfran',
  name: 'Сан-Франциско',
  terrain: {
    seed: 8,
    hills: 4,
    flatZones: [{ x: 10, z: 0, r: 52 }],
    mesas: [{ x: 40, z: 45, r: 9, h: 9 }, { x: 52, z: -40, r: 8, h: 8 }],
    paths: [[[56, 0], [8, 0], [-18, 14]], [[8, 0], [DEPOT.x - 3, DEPOT.z + 7]], [[-4, 0], [-18, -10]]],
    groundZones: [{ x: 8, z: 4, r: 30, color: '#6a6458', strength: 0.6 }],
    palette: { sand: '#c8b08a', sandDark: '#a8906c', rock: '#7a6a5a', rockLight: '#9a8a76', dirt: '#6a6052' },
    coast: { x: -22, depth: 9, width: 6 },
    water: WATER,
    platforms: PIERS.map((p) => ({ ...p, h: PIER_H })),
  },
  entries: { default: [48, 0], world: [48, 0], dock: [-24, 16] },
  exits: [EXIT],
  scatter: { rocks: 160, trees: 10, grass: 1800, reserved: [{ x: 8, z: 0, r: 40 }, { x: DEPOT.x, z: DEPOT.z, r: 16 }] },
  build,
  spawn,
};
