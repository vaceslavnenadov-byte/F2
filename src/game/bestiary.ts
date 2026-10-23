import { Actor, type ActorDef } from '../entities/actor';
import { HumanoidRig, LizardRig, QuadrupedRig, TurretRig, RobotRig, WanamingoRig, type HumanoidLook, type WeaponVisual } from '../entities/rigs';
import type { WeaponStats } from './items';

export const ATTACKS: Record<string, WeaponStats> = {
  geckoBite: { skill: 'unarmed', dmg: [1, 3], ap: 3, range: 1.5, melee: true, visual: 'none' },
  goldenBite: { skill: 'unarmed', dmg: [2, 6], ap: 3, range: 1.5, melee: true, visual: 'none' },
  ratBite: { skill: 'unarmed', dmg: [1, 3], ap: 3, range: 1.5, melee: true, visual: 'none' },
  dogBite: { skill: 'unarmed', dmg: [2, 5], ap: 3, range: 1.5, melee: true, visual: 'none' },
  club: { skill: 'melee', dmg: [4, 10], ap: 4, range: 2.2, melee: true, visual: 'spear' },
  pistol: { skill: 'smallGuns', dmg: [4, 10], ap: 5, range: 12, melee: false, visual: 'gun' },
  knife: { skill: 'melee', dmg: [2, 7], ap: 3, range: 1.5, melee: true, visual: 'none' },
};

export const SKIN = { a: '#c48a60', b: '#a8724e', c: '#8a5a3e', pale: '#d6a684' };

export function human(id: string, name: string, look: HumanoidLook, weapon: WeaponVisual, def: Partial<ActorDef> = {}): Actor {
  const rig = new HumanoidRig(look);
  rig.setWeapon(weapon);
  return new Actor({ id, name, faction: 'villager', rig, hp: 30, ap: 8, ac: 5, speed: 3.2, ...def });
}

export function gecko(id: string, golden: boolean, tag?: string): Actor {
  const rig = golden ? new LizardRig('#c9a03a', '#ecd99a', 1.35) : new LizardRig('#76864e', '#cbbb8a', 1);
  return new Actor({
    id,
    name: golden ? 'Золотой геккон' : 'Геккон',
    faction: 'hostile',
    rig,
    hp: golden ? 24 : 11,
    ap: golden ? 7 : 6,
    ac: golden ? 7 : 4,
    skill: golden ? 50 : 40,
    attack: golden ? ATTACKS.goldenBite : ATTACKS.geckoBite,
    xp: golden ? 150 : 60,
    sequence: golden ? 9 : 7,
    speed: 3.8,
    tag,
    loot: golden ? [['goldHide', 1, 1]] : [['hide', 0, 1]],
    wanderRadius: 4,
    detectRadius: golden ? 6 : 8,
    dt: golden ? 1 : 0,
  });
}

export function rat(id: string, tag?: string): Actor {
  const rig = new QuadrupedRig({ color: '#6b5a50', secondary: '#c9a090', heads: 1, bodyLen: 0.32, bodyR: 0.14, legLen: 0.14, ears: true, tailLen: 0.5 });
  return new Actor({
    id, name: 'Крыса', faction: 'hostile', rig, hp: 7, ap: 6, ac: 3, skill: 42, attack: ATTACKS.ratBite,
    xp: 25, sequence: 8, speed: 3.6, tag, wanderRadius: 3, detectRadius: 7, loot: [],
  });
}

export function bandit(id: string, variant = 0): Actor {
  const looks: HumanoidLook[] = [
    { skin: SKIN.pale, cloth: '#3a342c', hair: '#2a1d14', top: '#4a3020', build: 1.05 },
    { skin: SKIN.b, cloth: '#2e2a26', hair: '#141010', top: '#5a4632', beard: true },
    { skin: SKIN.a, cloth: '#46382a', hair: '#6a3a1a', top: '#383028', build: 0.95 },
  ];
  const ranged = variant % 3 !== 1;
  return human(id, 'Бандит', looks[variant % 3], ranged ? 'gun' : 'spear', {
    faction: 'hostile', hp: 22, ap: 7, ac: 5, skill: ranged ? 48 : 55,
    attack: ranged ? ATTACKS.pistol : ATTACKS.club, xp: 100, sequence: 6, speed: 3.4,
    loot: [['caps', 5, 30], ['ammo10', 0, 4], ['powder', 0, 1], ['leatherJacket', 0, 1]], wanderRadius: 4, detectRadius: 11, dt: 0, dr: 0.15,
  });
}

export function brahmin(id: string): Actor {
  const rig = new QuadrupedRig({ color: '#8a6a50', secondary: '#4f3d2e', heads: 2, bodyLen: 1.3, bodyR: 0.5, legLen: 0.75, horns: true, tailLen: 0.6 });
  return new Actor({ id, name: 'Брамин', faction: 'animal', rig, hp: 40, ap: 6, ac: 2, speed: 1.4, wanderRadius: 2.5 });
}

export function dog(): Actor {
  const rig = new QuadrupedRig({ color: '#8a8580', secondary: '#4d4945', heads: 1, bodyLen: 0.55, bodyR: 0.2, legLen: 0.38, ears: true, tailLen: 0.35 });
  return new Actor({
    id: 'dog', name: 'Дымок', faction: 'animal', rig, hp: 24, ap: 8, ac: 6, speed: 4.2, wanderRadius: 2,
    skill: 55, attack: ATTACKS.dogBite, sequence: 10,
  });
}

export function sulik(): Actor {
  return human('sulik', 'Сулик', { skin: SKIN.c, cloth: '#5a4030', hair: '#1a1210', top: '#6a4a2a', build: 1.18 }, 'spear', {
    dialogue: 'sulik', hp: 42, ap: 8, ac: 8, skill: 68, attack: ATTACKS.club, sequence: 8, speed: 3.6, dt: 1, dr: 0.1,
  });
}

// ─── Глава II ─────────────────────────────────────────────────────────────

export const GHOUL_SKIN = ['#7d8466', '#8a8466', '#6f7a60'];

/** Мирный гуль: кожа землистая, клочья волос. */
export function ghoul(id: string, name: string, variant: number, def: Partial<ActorDef> = {}): Actor {
  const skin = GHOUL_SKIN[variant % 3];
  return human(id, name, { skin, cloth: '#4a4438', hair: '#5a5a48', top: variant % 2 ? '#5a5240' : undefined, build: 0.82 }, 'none', {
    hp: 30, speed: 2.8, ...def,
  });
}

export function feralGhoul(id: string, variant = 0): Actor {
  return human(id, 'Дикий гуль', { skin: GHOUL_SKIN[variant % 3], cloth: '#2e2a24', hair: '#3a3a30', build: 0.8 }, 'none', {
    faction: 'hostile', hp: 22, ap: 7, ac: 6, skill: 52, attack: ATTACKS.knife, xp: 90, sequence: 7, speed: 3.6,
    tag: 'ferals', wanderRadius: 3, detectRadius: 9, dr: 0.1, loot: [['caps', 0, 10], ['radaway', 0, 1]],
  });
}

export const DEATHCLAW_SWIPE: WeaponStats = { skill: 'unarmed', dmg: [8, 18], ap: 4, range: 1.8, melee: true, visual: 'none' };

/** Коготь смерти: огромный рогатый ящер на двух ногах. Разумен — умеет говорить. */
export function deathclaw(id: string, name: string, def: Partial<ActorDef> = {}): Actor {
  return human(id, name, { skin: '#4e3e2c', cloth: '#4e3e2c', hair: '#4e3e2c', build: 1.55, scale: 1.3, monster: 'deathclaw' }, 'none', {
    hp: 80, ap: 9, ac: 18, skill: 75, attack: DEATHCLAW_SWIPE, xp: 500, sequence: 10, speed: 4.2,
    dt: 4, dr: 0.3, detectRadius: 0, ...def,
  });
}

export const PLASMA: WeaponStats = { skill: 'smallGuns', dmg: [12, 26], ap: 5, range: 22, melee: false, visual: 'rifle' };

/** Солдат Анклава в силовой броне с плазменной винтовкой. */
export function enclaveSoldier(id: string, def: Partial<ActorDef> = {}): Actor {
  return human(id, 'Солдат Анклава', { skin: '#33363a', cloth: '#26282b', hair: '#33363a', build: 1.25, scale: 1.08, armor: 'power' }, 'rifle', {
    hp: 75, ap: 8, ac: 22, skill: 70, attack: PLASMA, dt: 6, dr: 0.35, speed: 3, xp: 400, sequence: 8,
    loot: [['microcell', 2, 8], ['stimpak', 0, 1], ['plasmaRifle', 0, 1]], ...def,
  });
}

/** Полковник Стракс — командир платформы в улучшенной силовой броне. */
export function colonel(): Actor {
  const a = enclaveSoldier('colonel', {
    hp: 200, ap: 10, ac: 28, skill: 82, dt: 6, dr: 0.4, xp: 2000, sequence: 12,
    attack: { skill: 'smallGuns', dmg: [18, 34], ap: 5, range: 24, melee: false, visual: 'rifle' },
    loot: [['microcell', 10, 20]],
  });
  a.name = 'Полковник Стракс';
  a.rig.root.scale.setScalar(1.2);
  return a;
}

/** Супермутант: огромный зеленоватый громила с кувалдой. */
export function superMutant(id: string, tag?: string): Actor {
  return human(id, 'Супермутант', { skin: '#74845a', cloth: '#3a3226', hair: '#74845a', build: 1.75, scale: 1.35 }, 'sledge', {
    faction: 'hostile', hp: 75, ap: 8, ac: 12, skill: 65, xp: 320, sequence: 6, speed: 3.4, tag,
    attack: { skill: 'melee', dmg: [8, 20], ap: 5, range: 1.8, melee: true, visual: 'sledge' },
    dt: 3, dr: 0.2, wanderRadius: 4, detectRadius: 11, loot: [['caps', 10, 60], ['ammo5', 0, 12], ['stimpak', 0, 1]],
  });
}

/** Автоматическая турель: не двигается, стреляет очередями. */
export function turret(id: string, hostile: boolean): Actor {
  return new Actor({
    id, name: 'Турель', faction: hostile ? 'hostile' : 'companion', rig: new TurretRig(),
    hp: 60, ap: 8, ac: 20, skill: 70, speed: 0, sequence: 9, dt: 6, dr: 0.4, xp: 150,
    attack: { skill: 'smallGuns', dmg: [8, 16], ap: 4, range: 18, melee: false, visual: 'gun' },
    detectRadius: hostile ? 12 : 0,
  });
}

export function vaultCitizen(id: string, name: string, variant: number, def: Partial<ActorDef> = {}): Actor {
  const skins = [SKIN.pale, SKIN.a, SKIN.b];
  return human(id, name, { skin: skins[variant % 3], cloth: '#2c4a7a', hair: ['#3a2516', '#c8a060', '#1a1210'][variant % 3], top: '#2f5590', build: 0.92 }, 'none', def);
}

export function vcGuard(id: string): Actor {
  return human(id, 'Охранник', { skin: SKIN.pale, cloth: '#3a3c40', hair: '#2a1a10', build: 1.1, armor: 'metal' }, 'rifle', {
    hp: 70, ap: 8, ac: 25, skill: 80, attack: ATTACKS.pistol, dt: 5, dr: 0.4,
  });
}

// ─── Нью-Рино и Брокен-Хиллз ──────────────────────────────────────────────

export const SHOTGUN: WeaponStats = { skill: 'smallGuns', dmg: [10, 22], ap: 5, range: 10, melee: false, visual: 'rifle' };

/** Кэссиди: старый стрелок с дробовиком и больным сердцем. */
export function cassidy(): Actor {
  return human('cassidy', 'Кэссиди', { skin: SKIN.pale, cloth: '#3a3026', hair: '#9a948a', beard: true, build: 1.05, armor: 'jacket' }, 'rifle', {
    dialogue: 'cassidy', hp: 55, ap: 8, ac: 10, skill: 72, attack: SHOTGUN, sequence: 8, speed: 3.4, dt: 1, dr: 0.15,
  });
}

/** Вик: старый торговец-радиомастер с пистолетом. */
export function vic(): Actor {
  return human('vic', 'Вик', { skin: SKIN.pale, cloth: '#4a4a3a', hair: '#6a6a60', top: '#5a5a48', beard: true, build: 0.95 }, 'gun', {
    dialogue: 'vic', hp: 40, ap: 8, ac: 8, skill: 60, attack: ATTACKS.pistol, sequence: 7, speed: 3.2, dr: 0.1,
  });
}

/** Горис: молодой разумный коготь смерти, книжник из Убежища 13. */
export function goris(): Actor {
  const a = deathclaw('goris', 'Горис', { dialogue: 'goris', hp: 110, ap: 10, skill: 80, xp: 0, sequence: 11 });
  a.rig.root.scale.multiplyScalar(0.88);
  return a;
}

/** Маркус: шериф Брокен-Хиллз, добродушный супермутант с пулемётом. */
export function marcus(): Actor {
  return human('marcus', 'Маркус', { skin: '#74845a', cloth: '#4a3a28', hair: '#74845a', top: '#5a4632', build: 1.75, scale: 1.35 }, 'rifle', {
    dialogue: 'marcus', hp: 130, ap: 8, ac: 14, skill: 70, sequence: 7, speed: 3.4, dt: 4, dr: 0.25,
    attack: { skill: 'smallGuns', dmg: [12, 24], ap: 5, range: 18, melee: false, visual: 'rifle' },
  });
}

export function radscorpion(id: string, tag?: string): Actor {
  return new Actor({
    id, name: 'Радскорпион', faction: 'hostile', rig: new LizardRig('#5e2c20', '#9a6a44', 1.25), hp: 32, ap: 7, ac: 8, skill: 55,
    attack: { skill: 'unarmed', dmg: [4, 12], ap: 4, range: 1.7, melee: true, visual: 'none' },
    xp: 160, sequence: 7, speed: 3.6, tag, dt: 2, dr: 0.2, wanderRadius: 4, detectRadius: 9, loot: [],
  });
}

/** Гангстер одной из семей Нью-Рино: костюм и пистолет. */
export function gangster(id: string, family: 'morelli' | 'carver', variant = 0): Actor {
  const suit = family === 'morelli' ? '#2a2a34' : '#3a2a24';
  return human(id, family === 'morelli' ? 'Боевик Морелли' : 'Боевик Карвера', {
    skin: [SKIN.pale, SKIN.a, SKIN.b][variant % 3], cloth: suit, hair: '#141010', top: suit, build: 1.05,
  }, 'gun', { hp: 45, ap: 8, ac: 10, skill: 65, attack: ATTACKS.pistol, xp: 150, sequence: 7, dt: 1, dr: 0.1, dialogue: 'goon', loot: [['caps', 20, 60], ['ammo10', 2, 8]] });
}

export const FISTS_PRO: WeaponStats = { skill: 'unarmed', dmg: [3, 8], ap: 3, range: 1.5, melee: true, visual: 'none' };

/** Боксёр с ринга: бьёт только кулаками. */
export function boxer(id: string, name: string, tier: number): Actor {
  return human(id, name, { skin: [SKIN.b, SKIN.pale, SKIN.c][tier % 3], cloth: ['#8a1a1a', '#1a3a8a', '#1a1a1a'][tier % 3], hair: '#141010', build: 1.1 + tier * 0.1 }, 'none', {
    hp: 30 + tier * 15, ap: 7 + tier, ac: 8 + tier * 3, skill: 55 + tier * 10, attack: { ...FISTS_PRO, dmg: [3 + tier, 8 + tier * 2] }, xp: 120 + tier * 80, dialogue: 'boxer', tag: 'boxer',
  });
}

/** Охранный робот склада Сьерра: медленный, бронированный, бьёт лазером. */
export function robot(id: string): Actor {
  return new Actor({
    id, name: 'Робот-охранник', faction: 'hostile', rig: new RobotRig(), hp: 70, ap: 8, ac: 15, skill: 65, speed: 2.4,
    attack: { skill: 'smallGuns', dmg: [9, 18], ap: 4, range: 16, melee: false, visual: 'gun' },
    xp: 350, sequence: 6, dt: 6, dr: 0.4, detectRadius: 13, wanderRadius: 5, tag: 'robots',
    loot: [['microcell', 1, 4]],
  });
}

/** Дикая собака: худая, злая, охотится стаей. */
export function wildDog(id: string): Actor {
  const rig = new QuadrupedRig({ color: '#6a5a48', secondary: '#3a3028', heads: 1, bodyLen: 0.5, bodyR: 0.17, legLen: 0.36, ears: true, tailLen: 0.3 });
  return new Actor({
    id, name: 'Дикая собака', faction: 'hostile', rig, hp: 16, ap: 7, ac: 5, skill: 50, attack: ATTACKS.dogBite,
    xp: 70, sequence: 9, speed: 4.4, tag: 'wdogs', wanderRadius: 5, detectRadius: 10, loot: [['hide', 0, 1]],
  });
}

/** Слаг: потомок тех, кто пережил войну под землёй. Бледная кожа, лохмотья, щурится на свет. */
export function slag(id: string, name: string, variant: number, def: Partial<ActorDef> = {}): Actor {
  const looks: HumanoidLook[] = [
    { skin: '#e2cdb8', cloth: '#3e3a36', hair: '#d8d4cc', top: '#5a5248', beard: true },
    { skin: '#e8d4c0', cloth: '#44403a', hair: '#2a2622', build: 0.92 },
    { skin: '#dcc6b0', cloth: '#3a3632', hair: '#6a5a4a', top: '#4a4640', build: 1.05 },
  ];
  return human(id, name, looks[variant % 3], variant === 0 ? 'staff' : 'spear', {
    dialogue: 'slag', hp: 28, ap: 7, ac: 6, skill: 55, attack: ATTACKS.club, xp: 110, sequence: 7, speed: 3.3,
    tag: 'slags', wanderRadius: 3, detectRadius: 0, loot: [['caps', 0, 15], ['powder', 0, 1]], ...def,
  });
}

/** Ванаминго из шахт Реддинга. Королева крупнее и злее. */
export function wanamingo(id: string, queen = false): Actor {
  return new Actor({
    id, name: queen ? 'Королева ванаминго' : 'Ванаминго', faction: 'hostile', rig: new WanamingoRig(queen ? 1.45 : 1),
    hp: queen ? 130 : 48, ap: queen ? 9 : 8, ac: queen ? 14 : 10, skill: queen ? 75 : 62, speed: queen ? 3.4 : 3.8,
    attack: { skill: 'unarmed', dmg: queen ? [10, 22] : [5, 13], ap: 4, range: queen ? 2.2 : 1.8, melee: true, visual: 'none' },
    xp: queen ? 1200 : 300, sequence: 9, dt: queen ? 4 : 2, dr: queen ? 0.3 : 0.15, tag: 'wanamingo',
    wanderRadius: 4, detectRadius: 9, loot: [['wanaSample', 0, 1]],
  });
}

/** Фрэнк Хорриган: агент Анклава, мутант-гигант в особой силовой броне. */
export function horrigan(): Actor {
  return human('horrigan', 'Фрэнк Хорриган', { skin: '#2a2c30', cloth: '#1e2024', hair: '#2a2c30', build: 1.6, scale: 1.45, armor: 'power' }, 'rifle', {
    faction: 'hostile', hp: 240, ap: 10, ac: 22, skill: 80, speed: 3.2, sequence: 10, xp: 3000, dt: 6, dr: 0.35,
    attack: { skill: 'smallGuns', dmg: [14, 26], ap: 5, range: 16, melee: false, visual: 'rifle' },
    detectRadius: 60, wanderRadius: 0, tag: 'enclaveAttack', loot: [['microcell', 20, 30], ['stimpak', 3, 3]],
  });
}
