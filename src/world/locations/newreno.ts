import * as THREE from 'three';
import type { World } from '../world';
import { jitter } from '../world';
import type { LocationDef } from './types';
import type { Game } from '../../game/game';
import { boxer, cassidy, gangster, human, SKIN } from '../../game/bestiary';

const EXIT = { x: 56, z: 0, r: 4 };
export const RING = { x: 6, z: 20 };
export const SAFE = { x: 30, z: -26 };
export const MORELLI_IDS = ['morelli', 'mgoon1', 'mgoon2'];
export const CARVER_IDS = ['carver', 'cgoon1', 'cgoon2'];

/** Неоновая вывеска: светящиеся трубки и цветной свет на улицу. */
function neon(w: World, x: number, y: number, z: number, rot: number, color: string, width: number, light = true) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 1.1, 0.12), w.mat.void);
  g.add(frame);
  for (const yy of [-0.32, 0.32]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width, 8), mat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, yy, 0.1);
    g.add(tube);
  }
  // «Буквы» — короткие вертикальные трубки.
  const n = Math.floor(width / 0.45);
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4 + (i % 3) * 0.08, 6), mat);
    t.position.set(-width / 2 + 0.3 + i * 0.45, 0, 0.1);
    g.add(t);
  }
  g.position.set(x, y, z);
  g.rotation.y = rot;
  w.group.add(g);
  if (light) {
    const l = new THREE.PointLight(new THREE.Color(color), 14, 14, 1.6);
    l.position.set(x + Math.sin(rot) * 1.5, y - 0.5, z + Math.cos(rot) * 1.5);
    w.group.add(l);
  }
}

function building(w: World, x: number, z: number, wd: number, d: number, h: number, rot: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, map: w.mat.concrete.map, normalMap: w.mat.concrete.normalMap, roughness: 0.85 });
  const body = new THREE.Mesh(jitter(new THREE.BoxGeometry(wd, h, d, 4, 3, 4), 0.04, 1, Math.floor(x + z)), mat);
  body.position.y = h / 2;
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.4, 0.4, d + 0.4), w.mat.darkWood);
  cornice.position.y = h;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.15), w.mat.void);
  door.position.set(0, 1.2, d / 2 + 0.03);
  g.add(body, cornice, door);
  for (let fl = 0; fl < Math.floor(h / 3); fl++) {
    for (const sx of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), fl === 0 && Math.random() < 0.5 ? w.mat.glow : w.mat.void);
      win.position.set(sx * wd * 0.3, 1.8 + fl * 3, d / 2 + 0.03);
      g.add(win);
    }
  }
  w.placeFlat(g, x, z, rot, Math.max(wd, d) / 2);
  w.nav.blockRect(x, z, wd / 2 + 0.3, d / 2 + 0.3, rot);
  return g;
}

function build(w: World, flags: Set<string>) {
  // Главная улица: казино, бар, лавки.
  building(w, -4, -14, 16, 10, 7, 0, '#6a4a3a'); // казино «Десятка»
  neon(w, -4, w.y(-4, -14) + 7.6, -8.9, 0, '#ff3a8a', 9);
  neon(w, -4, w.y(-4, -14) + 5.2, -8.9, 0, '#ffd040', 5, false);
  // Мягкая цветная подсветка улицы вместо множества мелких ламп.
  const fill = new THREE.PointLight(0xff9a60, 18, 40, 1.2);
  fill.position.set(4, w.y(4, 0) + 10, 0);
  w.group.add(fill);
  building(w, 16, -12, 10, 8, 5, 0, '#5a4a40'); // бар «Подкова»
  neon(w, 16, w.y(16, -12) + 5.6, -7.9, 0, '#40d0ff', 6);
  building(w, -24, -12, 9, 8, 6, 0, '#4a4040');
  neon(w, -24, w.y(-24, -12) + 6.6, -7.9, 0, '#80ff40', 5);
  building(w, 30, 12, 9, 8, 4, Math.PI, '#5a5048');
  building(w, -22, 12, 10, 8, 5, Math.PI, '#4e4642');
  neon(w, -22, w.y(-22, 12) + 5.6, 7.9, Math.PI, '#ff7a20', 5);
  // Особняки семей: Морелли (запад), Карвер (восток).
  building(w, -34, -30, 14, 10, 8, 0, '#3a3438');
  neon(w, -34, w.y(-34, -30) + 8.6, -24.9, 0, '#c02020', 6, false);
  building(w, 34, -34, 14, 10, 8, 0, '#3e3830');
  neon(w, 34, w.y(34, -34) + 8.6, -28.9, 0, '#2060ff', 6, false);
  // Сейф Карвера во дворе за охраной.
  if (!flags.has('ledgerTaken')) {
    const safe = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.9), w.mat.metal);
    box.position.y = 0.6;
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16), new THREE.MeshStandardMaterial({ color: '#c8a020', metalness: 0.8, roughness: 0.3 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.7, 0.47);
    safe.add(box, dial);
    w.place(safe, SAFE.x, SAFE.z, 0, 0);
    w.nav.blockCircle(SAFE.x, SAFE.z, 0.6);
    w.interactable({ id: 'carverSafe', name: 'Сейф Карвера', object: safe, approach: new THREE.Vector3(SAFE.x, 0, SAFE.z + 1.6) });
  }

  // Боксёрский ринг под открытым небом.
  const ring = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 7), new THREE.MeshStandardMaterial({ color: '#4a5a8a', roughness: 0.9 }));
  floor.position.y = 0.15;
  ring.add(floor);
  for (const [px, pz] of [[-3.4, -3.4], [3.4, -3.4], [3.4, 3.4], [-3.4, 3.4]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), w.mat.metal);
    post.position.set(px, 0.8, pz);
    ring.add(post);
  }
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#c02020', roughness: 0.6 });
  for (const y of [0.7, 1.1, 1.5]) {
    for (const [ax, az, bx, bz] of [[-3.4, -3.4, 3.4, -3.4], [3.4, -3.4, 3.4, 3.4], [3.4, 3.4, -3.4, 3.4], [-3.4, 3.4, -3.4, -3.4]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), ropeMat);
      rope.rotation.z = Math.PI / 2;
      rope.rotation.y = -Math.atan2(bz - az, bx - ax);
      rope.position.set((ax + bx) / 2, y, (az + bz) / 2);
      ring.add(rope);
    }
  }
  w.place(ring, RING.x, RING.z, 0, 0.1);
  const lamp = new THREE.PointLight(0xfff0d0, 22, 16, 1.5);
  lamp.position.set(RING.x, w.y(RING.x, RING.z) + 6, RING.z);
  w.group.add(lamp);

  // Уличные фонари и мусор.
  const lit = [[6, -4], [26, 5]];
  for (const [x, z] of [[-14, -4], [6, -4], [26, -4], [-14, 5], [26, 5]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 8), w.mat.metal);
    pole.position.y = 2.25;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), w.mat.glow);
    bulb.position.y = 4.6;
    const g = new THREE.Group();
    g.add(pole, bulb);
    w.place(g, x, z, 0, 0);
    w.nav.blockCircle(x, z, 0.4);
    // Источники света только у части фонарей — остальное даёт ночная подсветка города.
    if (lit.some(([lx, lz]) => lx === x && lz === z)) {
      const l = new THREE.PointLight(0xffc880, 10, 14, 1.6);
      l.position.set(x, w.y(x, z) + 4.4, z);
      w.group.add(l);
    }
  }
  w.place(w.carWreck(1100), -6, 6, 1.5, 0.1);
  w.nav.blockRect(-6, 6, 1.1, 2.3, 1.5);
  w.burningBarrel(40, 4);
}

function spawn(g: Game) {
  const add = g.spawn.bind(g);
  add(human('lenny', 'Крупье Ленни', { skin: SKIN.pale, cloth: '#1a1a1a', hair: '#141010', top: '#8a1a2a' }, 'none', { dialogue: 'croupier' }), -4, -7.5);
  add(human('tommy', 'Бык Томми', { skin: SKIN.b, cloth: '#2a2a2a', hair: '#141010', build: 1.3 }, 'none', { dialogue: 'promoter' }), RING.x - 5, RING.z - 3);
  // Соперники на ринге: следующий по счёту ждёт у канатов.
  const bouts = ['Малыш Джо', 'Железный Сэм', 'Чемпион Кид Кобра'];
  const next = [0, 1, 2].find((i) => !g.flags.has(`boutWon${i}`));
  if (next !== undefined) add(boxer(`boxer${next}`, bouts[next], next), RING.x + 2, RING.z + 1);
  if (!g.isJoined('cassidy')) add(cassidy(), 16, -6.5);
  add(human('barkeep', 'Бармен Хэнк', { skin: SKIN.a, cloth: '#3a3028', hair: '#2a1a10', top: '#5a4a3a' }, 'none', { dialogue: 'renoBar' }), 19, -6.8);
  const morelli = gangster('morelli', 'morelli');
  morelli.name = 'Луиджи Морелли';
  morelli.dialogue = 'morelli';
  add(morelli, -34, -23);
  add(gangster('mgoon1', 'morelli', 1), -38, -22);
  add(gangster('mgoon2', 'morelli', 2), -30, -22);
  const carver = gangster('carver', 'carver');
  carver.name = 'Джек Карвер';
  carver.dialogue = 'carver';
  add(carver, 34, -27);
  add(gangster('cgoon1', 'carver', 1), 31, -24);
  add(gangster('cgoon2', 'carver', 2), 37, -24);
  if (g.flags.has('morelliHostile')) for (const a of g.actors) if (MORELLI_IDS.includes(a.id)) { a.faction = 'hostile'; a.detectRadius = 14; }
  if (g.flags.has('carverHostile')) for (const a of g.actors) if (CARVER_IDS.includes(a.id)) { a.faction = 'hostile'; a.detectRadius = 14; }
  const folk: [number, number][] = [[0, 0], [10, 4], [-14, 0], [22, -2], [-30, 2]];
  folk.forEach(([x, z], i) =>
    add(human(`reno${i}`, ['Игрок', 'Проститутка', 'Пьяница', 'Курьер', 'Зевака'][i], {
      skin: [SKIN.pale, SKIN.a, SKIN.b, SKIN.c, SKIN.pale][i], cloth: '#2e2a26', hair: '#2a1a10', top: ['#5a1a3a', '#8a2a5a', undefined, '#3a4a5a', '#4a4a3a'][i], build: i === 1 ? 0.85 : 1,
    }, 'none', { dialogue: 'renoFolk', wanderRadius: 8 }), x, z),
  );
}

export const NEW_RENO: LocationDef = {
  id: 'newreno',
  name: 'Нью-Рино',
  terrain: {
    seed: 11,
    hills: 4,
    flatZones: [{ x: 0, z: -8, r: 56 }],
    mesas: [{ x: -50, z: 45, r: 8, h: 7 }, { x: 50, z: 45, r: 9, h: 8 }],
    paths: [[[-40, 0], [56, 0]], [[RING.x, 0], [RING.x, RING.z - 4]], [[-34, 0], [-34, -24]], [[34, 0], [34, -28]]],
    groundZones: [{ x: 0, z: -6, r: 44, color: '#4a4844', strength: 0.85 }],
    palette: { sand: '#a89478', sandDark: '#8a7860', rock: '#6a5a4a', rockLight: '#8a7a68', dirt: '#3e3c3a' },
  },
  entries: { default: [48, 0], world: [48, 0] },
  exits: [EXIT],
  scatter: { rocks: 120, trees: 8, grass: 900, reserved: [{ x: 0, z: -8, r: 46 }] },
  nightAmbient: 0.45,
  build,
  spawn,
};
