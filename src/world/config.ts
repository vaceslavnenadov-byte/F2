// Ключевые точки карты «Окрестности Арройо». Мир 160×160 метров, центр деревни в (0, 0).
export const WORLD_SIZE = 160;

export const VILLAGE = { x: 0, z: 0 };
export const TEMPLE = { x: 0, z: -50 };
export const NEST = { x: 56, z: 2 };
export const DOG_SPOT = { x: -50, z: -40 };
export const PEN = { x: -25, z: -4 };

/** Зоны, где рельеф выравнивается под постройки. */
export const FLAT_ZONES = [
  { x: VILLAGE.x, z: VILLAGE.z, r: 32 },
  { x: TEMPLE.x, z: TEMPLE.z, r: 13 },
  { x: NEST.x, z: NEST.z, r: 9 },
];

/** Столовые горы — скальные останцы с отвесными склонами. */
export const MESAS = [
  { x: 38, z: -25, r: 10, h: 10 },
  { x: 43, z: 29, r: 12, h: 13 },
  { x: -43, z: 31, r: 9, h: 11 },
  { x: -24, z: -54, r: 8, h: 9 },
  { x: 20, z: 56, r: 8, h: 7 },
  { x: 70, z: -36, r: 9, h: 12 },
  { x: -62, z: 2, r: 7, h: 9 },
  { x: 72, z: 40, r: 8, h: 10 },
];
