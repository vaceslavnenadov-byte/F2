import { ARROYO } from './arroyo';
import { KLAMATH } from './klamath';
import { DEN } from './den';
import { VAULT_CITY } from './vaultcity';
import { GECKO } from './gecko';
import { VAULT13 } from './vault13';
import { SAN_FRANCISCO } from './sanfran';
import { NAVARRO } from './navarro';
import { OIL_RIG } from './oilrig';
import { NEW_RENO } from './newreno';
import { BROKEN_HILLS } from './brokenhills';
import { SIERRA } from './sierra';
import type { LocationDef } from './types';

export const LOCATIONS: Record<string, LocationDef> = {
  arroyo: ARROYO,
  klamath: KLAMATH,
  den: DEN,
  vaultcity: VAULT_CITY,
  gecko: GECKO,
  vault13: VAULT13,
  sanfran: SAN_FRANCISCO,
  navarro: NAVARRO,
  oilrig: OIL_RIG,
  newreno: NEW_RENO,
  brokenhills: BROKEN_HILLS,
  sierra: SIERRA,
};

/** Положение городов на карте мира (условные единицы 0..100). */
export const WORLD_MAP: Record<string, { x: number; y: number; label: string; desc: string }> = {
  arroyo: { x: 16, y: 14, label: 'Арройо', desc: 'Родная деревня племени.' },
  klamath: { x: 36, y: 24, label: 'Кламат', desc: 'Городок трапперов и пастухов брамина.' },
  den: { x: 44, y: 42, label: 'Дэн', desc: 'Притон работорговцев и наркоманов.' },
  vaultcity: { x: 74, y: 16, label: 'Убежище-Сити', desc: 'Город граждан Убежища 8. Чисто, сытно и неприветливо к чужакам.' },
  gecko: { x: 84, y: 30, label: 'Гекко', desc: 'Поселение гулей у старой атомной станции.' },
  vault13: { x: 62, y: 58, label: 'Убежище 13', desc: 'Довоенное убежище в горах. Там должен быть ГЭКК.' },
  sanfran: { x: 15, y: 54, label: 'Сан-Франциско', desc: 'Портовый город на побережье. Здесь стоят корабли.' },
  navarro: { x: 8, y: 32, label: 'Наварро', desc: 'Военная база Анклава на северном побережье.' },
  newreno: { x: 57, y: 37, label: 'Нью-Рино', desc: 'Город неона, казино и гангстерских семей.' },
  brokenhills: { x: 73, y: 46, label: 'Брокен-Хиллз', desc: 'Урановый рудник, где люди, гули и мутанты живут вместе.' },
  sierra: { x: 52, y: 18, label: 'Склад Сьерра', desc: 'Довоенный армейский склад в горах. Охраняется роботами.' },
};

/** Береговая линия на карте мира: западнее — океан. */
export function coastX(y: number) {
  return 3 + Math.max(0, y - 28) * 0.36 + 1.6 * Math.sin(y * 0.21);
};

/** Дней пути на одну условную единицу карты. */
export const DAYS_PER_UNIT = 0.12;
