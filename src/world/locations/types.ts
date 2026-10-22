import type { World } from '../world';
import type { Game } from '../../game/game';
import type { Circle, TerrainParams } from '../terrain';

export interface LocationDef {
  id: string;
  name: string;
  terrain: TerrainParams;
  /** Точки появления: default — начало игры, world — приход с карты мира. */
  entries: Record<string, [number, number]>;
  /** Зоны выхода на карту мира. */
  exits: Circle[];
  scatter: { rocks: number; trees: number; grass: number; reserved: Circle[] };
  /** Добавка к рассеянному свету ночью (освещённые города). */
  nightAmbient?: number;
  /** Помещение: свой свет без неба и смены дня. */
  indoor?: boolean;
  /** Радиоактивные зоны: доза в рад/с внутри круга. */
  radZones?: (Circle & { rate: number })[];
  build(w: World, flags: Set<string>): void;
  spawn(g: Game): void;
  /** Логика локации каждый кадр вне боя (тревога, триггеры). */
  update?(g: Game, dt: number): void;
  /** Свой обработчик выхода; true — карта мира не открывается. */
  onExit?(g: Game): boolean;
}
