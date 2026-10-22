import type { SkillId } from './character';
import type { WeaponVisual } from '../entities/rigs';

export interface WeaponStats {
  skill: SkillId;
  dmg: [number, number];
  ap: number;
  /** Дальность в метрах (клетках). */
  range: number;
  melee: boolean;
  ammo?: string;
  visual: WeaponVisual;
}

export interface ArmorStats {
  /** Бонус к классу брони. */
  ac: number;
  /** Порог урона: вычитается из каждого попадания. */
  dt: number;
  /** Сопротивление урону (доля 0..1). */
  dr: number;
  look: 'jacket' | 'leather' | 'metal';
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: 'weapon' | 'armor' | 'consumable' | 'ammo' | 'misc';
  value: number;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  heal?: [number, number];
  useAp?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  spear: {
    id: 'spear', name: 'Копьё', kind: 'weapon', value: 40,
    desc: 'Заострённый наконечник на длинном древке. Бьёт на два шага.',
    weapon: { skill: 'melee', dmg: [3, 10], ap: 4, range: 2.2, melee: true, visual: 'spear' },
  },
  zipgun: {
    id: 'zipgun', name: 'Самопал', kind: 'weapon', value: 120,
    desc: 'Самодельный однозарядный пистолет. Громкий, ненадёжный, но стреляет.',
    weapon: { skill: 'smallGuns', dmg: [6, 14], ap: 5, range: 14, melee: false, ammo: 'ammo10', visual: 'gun' },
  },
  knife: {
    id: 'knife', name: 'Нож', kind: 'weapon', value: 35,
    desc: 'Короткий клинок из рессоры. Быстрый удар.',
    weapon: { skill: 'melee', dmg: [2, 8], ap: 3, range: 1.5, melee: true, visual: 'none' },
  },
  pistol10: {
    id: 'pistol10', name: '10-мм пистолет', kind: 'weapon', value: 250,
    desc: 'Надёжный довоенный пистолет. Бьёт далеко и точно.',
    weapon: { skill: 'smallGuns', dmg: [5, 12], ap: 5, range: 18, melee: false, ammo: 'ammo10', visual: 'gun' },
  },
  sledge: {
    id: 'sledge', name: 'Кувалда', kind: 'weapon', value: 120,
    desc: 'Тяжёлый молот. Медленный, но сокрушительный удар сверху.',
    weapon: { skill: 'melee', dmg: [5, 16], ap: 5, range: 1.6, melee: true, visual: 'sledge' },
  },
  huntingRifle: {
    id: 'huntingRifle', name: 'Охотничья винтовка', kind: 'weapon', value: 420,
    desc: 'Длинноствольная винтовка под патрон .223. Бьёт далеко и больно.',
    weapon: { skill: 'smallGuns', dmg: [8, 20], ap: 6, range: 30, melee: false, ammo: 'ammo223', visual: 'rifle' },
  },
  ammo223: { id: 'ammo223', name: 'Патроны .223', kind: 'ammo', value: 3, desc: 'Винтовочные патроны.' },
  leatherJacket: {
    id: 'leatherJacket', name: 'Кожаная куртка', kind: 'armor', value: 110,
    desc: 'Потёртая куртка из кожи брамина. Немного защищает.',
    armor: { ac: 8, dt: 0, dr: 0.15, look: 'jacket' },
  },
  leatherArmor: {
    id: 'leatherArmor', name: 'Кожаная броня', kind: 'armor', value: 450,
    desc: 'Дублёная кожа с нашитыми пластинами. Хороший компромисс между защитой и подвижностью.',
    armor: { ac: 15, dt: 2, dr: 0.25, look: 'leather' },
  },
  metalArmor: {
    id: 'metalArmor', name: 'Металлическая броня', kind: 'armor', value: 950,
    desc: 'Склёпанные стальные пластины. Тяжёлая, громкая, надёжная.',
    armor: { ac: 10, dt: 4, dr: 0.35, look: 'metal' },
  },
  ammo10: { id: 'ammo10', name: 'Патроны 10 мм', kind: 'ammo', value: 2, desc: 'Довоенные патроны. Редкость в племени.' },
  powder: {
    id: 'powder', name: 'Целебный порошок', kind: 'consumable', value: 20, heal: [10, 18], useAp: 2,
    desc: 'Толчёные травы племени. Лечит раны, но туманит голову.',
  },
  stimpak: {
    id: 'stimpak', name: 'Стимулятор', kind: 'consumable', value: 75, heal: [15, 25], useAp: 2,
    desc: 'Довоенный шприц с лечебной смесью. Быстро затягивает раны.',
  },
  hide: { id: 'hide', name: 'Шкура геккона', kind: 'misc', value: 15, desc: 'Прочная чешуйчатая кожа. Пригодится для обмена.' },
  goldHide: { id: 'goldHide', name: 'Шкура золотого геккона', kind: 'misc', value: 60, desc: 'Переливается на солнце. Ценный трофей.' },
  caps: { id: 'caps', name: 'Крышки', kind: 'misc', value: 1, desc: 'Бутылочные крышки — деньги пустоши.' },
  flint: { id: 'flint', name: 'Кремень', kind: 'misc', value: 5, desc: 'Острый камень. Хорош для наконечников.' },
};

/** Торговцы: имя, начальный товар и запас крышек. */
export const TRADERS: Record<string, { name: string; stock: [string, number][] }> = {
  hakunin: { name: 'Хакунин', stock: [['caps', 60], ['powder', 5], ['flint', 3]] },
  maida: { name: 'Мэйда Бакнер', stock: [['caps', 350], ['powder', 6], ['ammo10', 30], ['knife', 2], ['leatherJacket', 1], ['sledge', 1], ['flint', 4]] },
  becky: {
    name: 'Бекки',
    stock: [['caps', 600], ['ammo10', 50], ['ammo223', 30], ['pistol10', 1], ['huntingRifle', 1], ['leatherArmor', 1], ['metalArmor', 1], ['stimpak', 4], ['powder', 2], ['knife', 1]],
  },
};

/** Множители цен: чем выше Бартер, тем дешевле покупка и дороже продажа. */
export function priceMult(barter: number) {
  return {
    buy: Math.max(1.1, 2.1 - barter / 100),
    sell: Math.min(0.9, 0.35 + barter / 200),
  };
}

export function itemPrice(id: string, mult: number, side: 'buy' | 'sell') {
  if (id === 'caps') return 1;
  const v = ITEMS[id].value * mult;
  return Math.max(1, side === 'buy' ? Math.ceil(v) : Math.floor(v));
}

/** Удар кулаком, когда оружие не экипировано. */
export const FISTS: WeaponStats = { skill: 'unarmed', dmg: [1, 3], ap: 3, range: 1.5, melee: true, visual: 'none' };

export class Inventory {
  items = new Map<string, number>();
  equipped: string | null = null;
  armor: string | null = null;

  add(id: string, n = 1) { this.items.set(id, (this.items.get(id) ?? 0) + n); }
  count(id: string) { return this.items.get(id) ?? 0; }
  remove(id: string, n = 1): boolean {
    const c = this.count(id);
    if (c < n) return false;
    if (c === n) {
      this.items.delete(id);
      if (this.equipped === id) this.equipped = null;
      if (this.armor === id) this.armor = null;
    } else this.items.set(id, c - n);
    return true;
  }
  get weapon(): WeaponStats { return (this.equipped && ITEMS[this.equipped].weapon) || FISTS; }
  get weaponName(): string { return this.equipped ? ITEMS[this.equipped].name : 'Кулаки'; }
  get armorStats(): ArmorStats | null { return this.armor ? ITEMS[this.armor].armor! : null; }

  toJSON() { return { items: [...this.items], equipped: this.equipped, armor: this.armor }; }
  static fromJSON(d: ReturnType<Inventory['toJSON']>): Inventory {
    const inv = new Inventory();
    inv.items = new Map(d.items);
    inv.equipped = d.equipped;
    inv.armor = d.armor ?? null;
    return inv;
  }
}
