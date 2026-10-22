// Система S.P.E.C.I.A.L. и навыки — формулы близки к оригиналу Fallout 2.

export const SPECIAL_KEYS = ['st', 'pe', 'en', 'ch', 'in', 'ag', 'lk'] as const;
export type SpecialKey = (typeof SPECIAL_KEYS)[number];
export type Special = Record<SpecialKey, number>;

export const SPECIAL_INFO: Record<SpecialKey, { name: string; abbr: string; desc: string }> = {
  st: { name: 'Сила', abbr: 'СИЛ', desc: 'Физическая мощь. Влияет на урон в ближнем бою и здоровье.' },
  pe: { name: 'Восприятие', abbr: 'ВОС', desc: 'Зрение и чутьё. Точность на дистанции и очерёдность в бою.' },
  en: { name: 'Выносливость', abbr: 'ВЫН', desc: 'Стойкость. Здоровье и его прирост с уровнем.' },
  ch: { name: 'Обаяние', abbr: 'ОБА', desc: 'Харизма. Основа красноречия.' },
  in: { name: 'Интеллект', abbr: 'ИНТ', desc: 'Знания и ум. Очки навыков и варианты в диалогах.' },
  ag: { name: 'Ловкость', abbr: 'ЛОВ', desc: 'Координация. Очки действия и класс брони.' },
  lk: { name: 'Удача', abbr: 'УДЧ', desc: 'Везение. Шанс критического попадания.' },
};

export const SKILLS = [
  { id: 'smallGuns', name: 'Лёгкое оружие', base: (s: Special) => 4 + 2 * s.ag },
  { id: 'melee', name: 'Холодное оружие', base: (s: Special) => 20 + 2 * (s.ag + s.st) },
  { id: 'unarmed', name: 'Без оружия', base: (s: Special) => 30 + 2 * (s.ag + s.st) },
  { id: 'firstAid', name: 'Первая помощь', base: (s: Special) => 2 * (s.pe + s.in) },
  { id: 'speech', name: 'Красноречие', base: (s: Special) => 5 * s.ch },
  { id: 'barter', name: 'Бартер', base: (s: Special) => 4 * s.ch },
  { id: 'science', name: 'Наука', base: (s: Special) => 4 * s.in },
  { id: 'repair', name: 'Ремонт', base: (s: Special) => 3 * s.in },
  { id: 'outdoorsman', name: 'Натуралист', base: (s: Special) => 2 * (s.en + s.in) },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

export const SPECIAL_POOL = 40;

export class Character {
  name = 'Избранный';
  special: Special = { st: 5, pe: 5, en: 5, ch: 5, in: 5, ag: 5, lk: 5 };
  tags = new Set<SkillId>();
  spent: Record<SkillId, number> = { smallGuns: 0, melee: 0, unarmed: 0, firstAid: 0, speech: 0, barter: 0, science: 0, repair: 0, outdoorsman: 0 };
  level = 1;
  xp = 0;
  skillPoints = 0;
  hp = 0;
  /** Накопленная доза радиации. */
  rads = 0;

  skill(id: SkillId): number {
    const def = SKILLS.find((s) => s.id === id)!;
    const tag = this.tags.has(id);
    // Отмеченный навык: +20 сразу и двойная отдача от вложенных очков.
    return def.base(this.special) + (tag ? 20 : 0) + this.spent[id] * (tag ? 2 : 1);
  }

  get maxHp() { return 15 + this.special.st + 2 * this.special.en + (this.level - 1) * (2 + Math.floor(this.special.en / 2)); }
  /** Лучевая болезнь: каждые 200 рад отнимают 1 ОД (максимум 3). */
  get radPenalty() { return Math.min(3, Math.floor(this.rads / 200)); }
  get maxAp() { return 5 + Math.floor(this.special.ag / 2) - this.radPenalty; }
  get ac() { return this.special.ag; }
  get meleeBonus() { return Math.max(1, this.special.st - 5); }
  get sequence() { return 2 * this.special.pe; }
  get critChance() { return this.special.lk; }
  get nextLevelXp() { return ((this.level * (this.level + 1)) / 2) * 1000; }
  get skillPointsPerLevel() { return 5 + 2 * this.special.in; }

  /** Начисляет опыт, возвращает число полученных уровней. */
  addXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.nextLevelXp) {
      const before = this.maxHp;
      this.level++;
      gained++;
      this.skillPoints += this.skillPointsPerLevel;
      this.hp += this.maxHp - before;
    }
    return gained;
  }

  toJSON() {
    return { name: this.name, special: this.special, tags: [...this.tags], spent: this.spent, level: this.level, xp: this.xp, skillPoints: this.skillPoints, hp: this.hp, rads: this.rads };
  }

  static fromJSON(d: ReturnType<Character['toJSON']>): Character {
    const c = new Character();
    c.name = d.name;
    c.special = { ...d.special };
    c.tags = new Set(d.tags);
    c.spent = { ...c.spent, ...d.spent };
    c.level = d.level;
    c.xp = d.xp;
    c.skillPoints = d.skillPoints;
    c.hp = d.hp;
    c.rads = d.rads ?? 0;
    return c;
  }
}
