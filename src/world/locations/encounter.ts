import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { DESERT_PALETTE, type Mesa } from '../terrain';
import type { LocationDef } from './types';
import { bandit, gecko, rat } from '../../game/bestiary';

export type EncounterKind = 'geckos' | 'rats' | 'bandits' | 'quiet';

export const ENCOUNTER_NAMES: Record<EncounterKind, string> = {
  geckos: 'Стая гекконов',
  rats: 'Гигантские крысы',
  bandits: 'Засада бандитов',
  quiet: 'Тихое место',
};

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
    scatter: { rocks: 360, trees: 26, grass: 3600, reserved: [{ x: -22, z: 0, r: 4 }] },
    build(w) {
      // Следы прошлого: остов машины или кости брамина.
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
