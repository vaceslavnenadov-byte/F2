import { Actor, type ActorDef } from '../entities/actor';
import { HumanoidRig, LizardRig, QuadrupedRig, type HumanoidLook, type WeaponVisual } from '../entities/rigs';
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
    loot: [['caps', 5, 30], ['ammo10', 0, 4], ['powder', 0, 1]], wanderRadius: 4, detectRadius: 11,
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
    dialogue: 'sulik', hp: 42, ap: 8, ac: 8, skill: 68, attack: ATTACKS.club, sequence: 8, speed: 3.6,
  });
}
