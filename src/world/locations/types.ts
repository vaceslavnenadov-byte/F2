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
  build(w: World): void;
  spawn(g: Game): void;
}
