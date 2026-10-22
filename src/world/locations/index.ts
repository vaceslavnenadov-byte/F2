import { ARROYO } from './arroyo';
import { KLAMATH } from './klamath';
import { DEN } from './den';
import { VAULT_CITY } from './vaultcity';
import { GECKO } from './gecko';
import { VAULT13 } from './vault13';
import type { LocationDef } from './types';

export const LOCATIONS: Record<string, LocationDef> = {
  arroyo: ARROYO,
  klamath: KLAMATH,
  den: DEN,
  vaultcity: VAULT_CITY,
  gecko: GECKO,
  vault13: VAULT13,
};

/** Положение городов на карте мира (условные единицы 0..100). */
export const WORLD_MAP: Record<string, { x: number; y: number; label: string; desc: string }> = {
  arroyo: { x: 16, y: 14, label: 'Арройо', desc: 'Родная деревня племени.' },
  klamath: { x: 36, y: 24, label: 'Кламат', desc: 'Городок трапперов и пастухов брамина.' },
  den: { x: 44, y: 42, label: 'Дэн', desc: 'Притон работорговцев и наркоманов.' },
  vaultcity: { x: 74, y: 16, label: 'Убежище-Сити', desc: 'Город граждан Убежища 8. Чисто, сытно и неприветливо к чужакам.' },
  gecko: { x: 84, y: 30, label: 'Гекко', desc: 'Поселение гулей у старой атомной станции.' },
  vault13: { x: 62, y: 58, label: 'Убежище 13', desc: 'Довоенное убежище в горах. Там должен быть ГЭКК.' },
};

/** Дней пути на одну условную единицу карты. */
export const DAYS_PER_UNIT = 0.12;
