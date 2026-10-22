import { ARROYO } from './arroyo';
import { KLAMATH } from './klamath';
import { DEN } from './den';
import type { LocationDef } from './types';

export const LOCATIONS: Record<string, LocationDef> = { arroyo: ARROYO, klamath: KLAMATH, den: DEN };

/** Положение городов на карте мира (условные единицы 0..100). */
export const WORLD_MAP: Record<string, { x: number; y: number; label: string; desc: string }> = {
  arroyo: { x: 16, y: 14, label: 'Арройо', desc: 'Родная деревня племени.' },
  klamath: { x: 36, y: 24, label: 'Кламат', desc: 'Городок трапперов и пастухов брамина.' },
  den: { x: 44, y: 42, label: 'Дэн', desc: 'Притон работорговцев и наркоманов.' },
};

/** Дней пути на одну условную единицу карты. */
export const DAYS_PER_UNIT = 0.12;
