import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { DESERT_PALETTE, type Mesa } from '../terrain';
import type { LocationDef } from './types';
import { bandit, brahmin, gecko, human, rat, SKIN } from '../../game/bestiary';
import type { World } from '../world';

export type EncounterKind = 'geckos' | 'rats' | 'bandits' | 'quiet' | 'caravan' | 'whale' | 'bridge';

/** Особые встречи: случаются редко и только по разу (кроме каравана). */
export const SPECIAL_ENCOUNTERS: EncounterKind[] = ['whale', 'bridge'];

export const ENCOUNTER_NAMES: Record<EncounterKind, string> = {
  geckos: 'Стая гекконов',
  rats: 'Гигантские крысы',
  bandits: 'Засада бандитов',
  quiet: 'Тихое место',
  caravan: 'Торговый караван',
  whale: 'Кит в пустыне',
  bridge: 'Мост Смерти',
};

/** Кит, упавший с неба посреди пустыни, и разбитый горшок с петуниями. */
function whaleScene(w: World) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#4a5a6a', roughness: 0.55 });
  const belly = new THREE.MeshStandardMaterial({ color: '#c8c4b8', roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), skin);
  body.scale.set(1, 0.85, 3.2);
  body.position.y = 1.2;
  body.rotation.z = 0.35;
  const under = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 12), belly);
  under.scale.set(0.9, 0.6, 2.9);
  under.position.set(0.5, 0.7, 0.3);
  under.rotation.z = 0.35;
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.2, 1.4), skin);
  fluke.position.set(0, 1.4, -7.4);
  fluke.rotation.set(0.3, 0, 0.5);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: '#111' }));
  eye.position.set(1.6, 1.6, 4.8);
  g.add(body, under, fluke, eye);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  w.place(g, 4, -2, 0.4, 0.5);
  w.nav.blockRect(4, -2, 2.4, 7.5, 0.4);
  w.interactable({ id: 'whale', name: 'Кит', object: g, approach: new THREE.Vector3(1, 0, 1) });
  const pot = w.pot();
  pot.rotation.z = 1.4;
  const flowers = new THREE.Group();
  flowers.add(pot);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: '#e070b0' }));
    f.position.set(0.4 + i * 0.12, 0.08, (i % 2) * 0.15);
    flowers.add(f);
  }
  w.place(flowers, -3, 4, 0, 0);
  w.interactable({ id: 'petunias', name: 'Горшок с петуниями', object: flowers, approach: new THREE.Vector3(-3, 0, 5.4) });
}

/** Верёвочный мост над расщелиной. */
function bridgeScene(w: World) {
  const chasm = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), new THREE.MeshBasicMaterial({ color: '#050403' }));
  chasm.rotation.x = -Math.PI / 2;
  chasm.position.set(8, w.y(8, 0) + 0.06, 0);
  w.group.add(chasm);
  for (let z = -20; z <= 20; z += 1) if (Math.abs(z) > 1) w.nav.blockRect(8, z, 3, 0.6);
  const bridge = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2), w.mat.planks);
    plank.position.set(-3 + i * 0.55, Math.sin((i / 11) * Math.PI) * -0.3 + 0.1, 0);
    bridge.add(plank);
  }
  for (const sz of [-1, 1]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.6, 4), w.mat.darkWood);
    rope.rotation.z = Math.PI / 2;
    rope.position.set(0, 0.9, sz);
    bridge.add(rope);
  }
  w.place(bridge, 8, 0, 0, 0);
  // Рваные каменные края расщелины.
  for (let z = -19; z <= 19; z += 1.6) {
    if (Math.abs(z) < 1.6) continue;
    for (const ex of [4.8, 11.2]) {
      const b = w.boulder(new THREE.Vector3(0.7 + Math.abs(Math.sin(z * 3.1)) * 0.5, 0.35, 0.8), Math.floor(z * 10 + ex));
      w.place(b, ex + Math.sin(z * 1.7) * 0.3, z, z, 0.15);
    }
  }
}


/** Процедурная карта случайной встречи: рельеф и враги зависят от зерна. */
export function makeEncounter(kind: EncounterKind, seed: number): LocationDef {
  const rnd = mulberry32(seed);
  const mesas: Mesa[] = [];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 25 + rnd() * 25;
    mesas.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 6 + rnd() * 6, h: 6 + rnd() * 8 });
  }
  const exits = [
    { x: -54, z: 0, r: 5 },
    { x: 54, z: 0, r: 5 },
    { x: 0, z: -54, r: 5 },
    { x: 0, z: 54, r: 5 },
  ];
  return {
    id: 'encounter',
    name: `Пустошь: ${ENCOUNTER_NAMES[kind]}`,
    terrain: {
      seed: 10 + (seed % 1000),
      hills: 10,
      flatZones: [{ x: 0, z: 0, r: 26 }, ...exits.map((e) => ({ ...e, r: 10 }))],
      // Останцы не должны перекрывать центр и выходы.
      mesas: mesas.filter((m) => Math.hypot(m.x, m.z) > m.r + 18 && exits.every((e) => Math.hypot(m.x - e.x, m.z - e.z) > m.r + 10)),
      paths: [],
      palette: DESERT_PALETTE,
    },
    entries: { default: [-22, 0], world: [-22, 0] },
    exits,
    scatter: { rocks: 360, trees: 26, grass: 3600, reserved: [{ x: -22, z: 0, r: 4 }, ...(kind === 'whale' ? [{ x: 3, z: 0, r: 10 }] : kind === 'bridge' ? [-16, -8, 0, 8, 16].map((z) => ({ x: 8, z, r: 5 })) : [])] },
    build(w) {
      if (kind === 'whale') whaleScene(w);
      if (kind === 'bridge') bridgeScene(w);
      // Следы прошлого: остов машины или кости брамина.
      if (kind === 'whale' || kind === 'bridge') return;
      if (rnd() < 0.5) {
        w.place(w.carWreck(seed), 6, -8, rnd() * 3, 0.1);
        w.nav.blockRect(6, -8, 1.1, 2.3, 0);
      } else {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), w.mat.bone);
        skull.scale.set(1, 0.8, 1.4);
        w.place(skull, 4, 6, rnd() * 6, -0.05);
      }
    },
    spawn(g) {
      const add = g.spawn.bind(g);
      const spot = (i: number): [number, number] => [6 + (i % 3) * 2.5 + rnd() * 2, -4 + Math.floor(i / 3) * 3 + rnd() * 2];
      if (kind === 'caravan') {
        add(human('trader', 'Караванщик Крэйн', { skin: SKIN.b, cloth: '#5a4a3a', hair: '#3a2a1a', top: '#7a5a3a', beard: true }, 'none', { dialogue: 'caravan', wanderRadius: 0 }), 4, 0);
        for (let i = 0; i < 2; i++) add(human(`cguard${i}`, 'Охранник каравана', { skin: SKIN.a, cloth: '#3a3a30', hair: '#1a1210', armor: 'leather' }, 'rifle', { dialogue: 'caravan', wanderRadius: 3, hp: 45 }), 7, -3 + i * 6);
        for (let i = 0; i < 2; i++) add(brahmin(`cbrahmin${i}`), 10, -1 + i * 3);
      } else if (kind === 'bridge') {
        add(human('keeper', 'Хранитель моста', { skin: SKIN.pale, cloth: '#3a2a3a', hair: '#d8d4cc', top: '#4a3a4a', beard: true, build: 0.85 }, 'staff', { dialogue: 'bridgekeeper', wanderRadius: 0 }), 4.4, 0);
      }
      if (kind === 'geckos') {
        const n = 3 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          const a = gecko(`egecko${i}`, i === 0 && rnd() < 0.3);
          a.detectRadius = 13;
          add(a, ...spot(i));
        }
      } else if (kind === 'rats') {
        for (let i = 0; i < 5; i++) {
          const a = rat(`erat${i}`);
          a.detectRadius = 12;
          add(a, ...spot(i), 0.4);
        }
      } else if (kind === 'bandits') {
        const n = 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          const a = bandit(`ebandit${i}`, i);
          a.detectRadius = 15;
          add(a, ...spot(i));
        }
      }
    },
  };
}
