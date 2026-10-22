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

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: 'weapon' | 'consumable' | 'ammo' | 'misc';
  value: number;
  weapon?: WeaponStats;
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
  ammo10: { id: 'ammo10', name: 'Патроны 10 мм', kind: 'ammo', value: 2, desc: 'Довоенные патроны. Редкость в племени.' },
  powder: {
    id: 'powder', name: 'Целебный порошок', kind: 'consumable', value: 20, heal: [10, 18], useAp: 2,
    desc: 'Толчёные травы племени. Лечит раны, но туманит голову.',
  },
  hide: { id: 'hide', name: 'Шкура геккона', kind: 'misc', value: 15, desc: 'Прочная чешуйчатая кожа. Пригодится для обмена.' },
  goldHide: { id: 'goldHide', name: 'Шкура золотого геккона', kind: 'misc', value: 60, desc: 'Переливается на солнце. Ценный трофей.' },
  caps: { id: 'caps', name: 'Крышки', kind: 'misc', value: 1, desc: 'Бутылочные крышки — деньги пустоши.' },
  flint: { id: 'flint', name: 'Кремень', kind: 'misc', value: 5, desc: 'Острый камень. Хорош для наконечников.' },
};

/** Удар кулаком, когда оружие не экипировано. */
export const FISTS: WeaponStats = { skill: 'unarmed', dmg: [1, 3], ap: 3, range: 1.5, melee: true, visual: 'none' };

export class Inventory {
  items = new Map<string, number>();
  equipped: string | null = null;

  add(id: string, n = 1) { this.items.set(id, (this.items.get(id) ?? 0) + n); }
  count(id: string) { return this.items.get(id) ?? 0; }
  remove(id: string, n = 1): boolean {
    const c = this.count(id);
    if (c < n) return false;
    if (c === n) {
      this.items.delete(id);
      if (this.equipped === id) this.equipped = null;
    } else this.items.set(id, c - n);
    return true;
  }
  get weapon(): WeaponStats { return (this.equipped && ITEMS[this.equipped].weapon) || FISTS; }
  get weaponName(): string { return this.equipped ? ITEMS[this.equipped].name : 'Кулаки'; }

  toJSON() { return { items: [...this.items], equipped: this.equipped }; }
  static fromJSON(d: ReturnType<Inventory['toJSON']>): Inventory {
    const inv = new Inventory();
    inv.items = new Map(d.items);
    inv.equipped = d.equipped;
    return inv;
  }
}
