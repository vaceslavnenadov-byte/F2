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
  { id: 'sneak', name: 'Скрытность', base: (s: Special) => 5 + 3 * s.ag },
  { id: 'steal', name: 'Кража', base: (s: Special) => 3 * s.ag },
  { id: 'firstAid', name: 'Первая помощь', base: (s: Special) => 2 * (s.pe + s.in) },
  { id: 'speech', name: 'Красноречие', base: (s: Special) => 5 * s.ch },
  { id: 'barter', name: 'Бартер', base: (s: Special) => 4 * s.ch },
  { id: 'science', name: 'Наука', base: (s: Special) => 4 * s.in },
  { id: 'repair', name: 'Ремонт', base: (s: Special) => 3 * s.in },
  { id: 'outdoorsman', name: 'Натуралист', base: (s: Special) => 2 * (s.en + s.in) },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

export const SPECIAL_POOL = 40;

/** Способности: одна на каждый нечётный уровень начиная с 3-го. */
export const PERKS = [
  { id: 'lifegiver', name: 'Жизнелюб', desc: '+12 к максимуму очков здоровья.' },
  { id: 'actionBoy', name: 'Ловкач', desc: '+1 очко действия в каждом ходу.' },
  { id: 'toughness', name: 'Толстокожий', desc: 'Порог урона +2 и сопротивление +10% поверх брони.' },
  { id: 'sniper', name: 'Меткий глаз', desc: '+15% к шансу попадания из стрелкового оружия.' },
  { id: 'fastShot', name: 'Скорострел', desc: 'Выстрел из любого стрелкового оружия стоит на 1 ОД меньше.' },
  { id: 'brute', name: 'Громила', desc: '+4 к урону в ближнем бою.' },
  { id: 'lucky', name: 'Счастливчик', desc: '+10% к шансу критического попадания.' },
  { id: 'healer', name: 'Быстрое заживление', desc: 'Раны затягиваются вдвое быстрее, лечебные средства — на 50% сильнее.' },
  { id: 'radResist', name: 'Иммунитет', desc: 'Организм набирает вдвое меньше радиации.' },
  { id: 'awareness', name: 'Наблюдательность', desc: 'Видно точное здоровье врагов и их оружие.' },
  { id: 'orator', name: 'Оратор', desc: '+20% к Красноречию.' },
  { id: 'trader', name: 'Торгаш', desc: '+20% к Бартеру.' },
  { id: 'tinker', name: 'Технарь', desc: '+15% к Науке и Ремонту.' },
] as const;
export type PerkId = (typeof PERKS)[number]['id'];

export type ChemId = 'jet' | 'buffout' | 'mentats';

/** Химия пустоши: длительность в часах, бонусы, шанс и цена зависимости. */
export const CHEMS: Record<ChemId, { name: string; hours: number; buff: Partial<Special>; ap?: number; addict: number; withdrawal: Partial<Special>; withdrawalAp?: number; desc: string }> = {
  jet: { name: 'Винт', hours: 2, buff: {}, ap: 2, addict: 0.25, withdrawal: { ag: -1 }, withdrawalAp: -1, desc: '+2 ОД' },
  buffout: { name: 'Баффаут', hours: 4, buff: { st: 2, en: 2 }, addict: 0.15, withdrawal: { st: -1, ag: -1 }, desc: '+2 СИЛ, +2 ВЫН' },
  mentats: { name: 'Ментаты', hours: 4, buff: { in: 2, pe: 2 }, addict: 0.1, withdrawal: { in: -1, pe: -1 }, desc: '+2 ИНТ, +2 ВОС' },
};

export class Character {
  name = 'Избранный';
  special: Special = { st: 5, pe: 5, en: 5, ch: 5, in: 5, ag: 5, lk: 5 };
  tags = new Set<SkillId>();
  spent: Record<SkillId, number> = { smallGuns: 0, melee: 0, unarmed: 0, firstAid: 0, sneak: 0, steal: 0, speech: 0, barter: 0, science: 0, repair: 0, outdoorsman: 0 };
  level = 1;
  xp = 0;
  skillPoints = 0;
  hp = 0;
  /** Накопленная доза радиации. */
  rads = 0;
  perks = new Set<PerkId>();
  perkPoints = 0;

  /** Химия: время окончания действия и зависимости (в днях игры). */
  chemUntil: Partial<Record<ChemId, number>> = {};
  addictUntil: Partial<Record<ChemId, number>> = {};
  /** Временные поправки к SPECIAL и ОД от химии; пересчитываются игрой. */
  buffs: Partial<Special> = {};
  apBuff = 0;

  /** Действующие характеристики с учётом химии (1..10). */
  get eff(): Special {
    const e = { ...this.special };
    for (const k of Object.keys(this.buffs) as (keyof Special)[]) e[k] = Math.max(1, Math.min(10, e[k] + (this.buffs[k] ?? 0)));
    return e;
  }

  /** Пересчёт эффектов химии на момент времени. Возвращает списки активных и ломок. */
  updateChems(days: number): { active: ChemId[]; withdrawal: ChemId[] } {
    const active = (Object.keys(CHEMS) as ChemId[]).filter((c) => (this.chemUntil[c] ?? -1) > days);
    const withdrawal = (Object.keys(CHEMS) as ChemId[]).filter((c) => (this.addictUntil[c] ?? -1) > days && !active.includes(c));
    const buffs: Partial<Special> = {};
    let ap = 0;
    for (const c of active) {
      for (const [k, v] of Object.entries(CHEMS[c].buff) as [keyof Special, number][]) buffs[k] = (buffs[k] ?? 0) + v;
      ap += CHEMS[c].ap ?? 0;
    }
    for (const c of withdrawal) {
      for (const [k, v] of Object.entries(CHEMS[c].withdrawal) as [keyof Special, number][]) buffs[k] = (buffs[k] ?? 0) + v;
      ap += CHEMS[c].withdrawalAp ?? 0;
    }
    this.buffs = buffs;
    this.apBuff = ap;
    this.hp = Math.min(this.hp, this.maxHp);
    return { active, withdrawal };
  }

  has(p: PerkId) { return this.perks.has(p); }

  private perkSkillBonus(id: SkillId) {
    let b = 0;
    if (id === 'speech' && this.has('orator')) b += 20;
    if (id === 'barter' && this.has('trader')) b += 20;
    if ((id === 'science' || id === 'repair') && this.has('tinker')) b += 15;
    return b;
  }

  skill(id: SkillId): number {
    const def = SKILLS.find((s) => s.id === id)!;
    const tag = this.tags.has(id);
    // Отмеченный навык: +20 сразу и двойная отдача от вложенных очков.
    return def.base(this.eff) + (tag ? 20 : 0) + this.spent[id] * (tag ? 2 : 1) + this.perkSkillBonus(id);
  }

  get maxHp() {
    return 15 + this.eff.st + 2 * this.eff.en + (this.level - 1) * (2 + Math.floor(this.eff.en / 2)) + (this.has('lifegiver') ? 12 : 0);
  }
  /** Лучевая болезнь: каждые 200 рад отнимают 1 ОД (максимум 3). */
  get radPenalty() { return Math.min(3, Math.floor(this.rads / 200)); }
  get maxAp() { return 5 + Math.floor(this.eff.ag / 2) - this.radPenalty + (this.has('actionBoy') ? 1 : 0) + this.apBuff; }
  get ac() { return this.eff.ag; }
  get meleeBonus() { return Math.max(1, this.eff.st - 5) + (this.has('brute') ? 4 : 0); }
  get sequence() { return 2 * this.eff.pe; }
  get critChance() { return this.eff.lk + (this.has('lucky') ? 10 : 0); }
  get nextLevelXp() { return ((this.level * (this.level + 1)) / 2) * 1000; }
  get skillPointsPerLevel() { return 5 + 2 * this.eff.in; }

  /** Берёт способность; здоровье растёт сразу, если она его увеличивает. */
  takePerk(p: PerkId): boolean {
    if (this.perkPoints <= 0 || this.perks.has(p)) return false;
    const before = this.maxHp;
    this.perks.add(p);
    this.perkPoints--;
    this.hp += this.maxHp - before;
    return true;
  }

  /** Начисляет опыт, возвращает число полученных уровней. */
  addXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.nextLevelXp) {
      const before = this.maxHp;
      this.level++;
      gained++;
      this.skillPoints += this.skillPointsPerLevel;
      if (this.level % 2 === 1) this.perkPoints++;
      this.hp += this.maxHp - before;
    }
    return gained;
  }

  toJSON() {
    return { name: this.name, special: this.special, tags: [...this.tags], spent: this.spent, level: this.level, xp: this.xp, skillPoints: this.skillPoints, hp: this.hp, rads: this.rads, perks: [...this.perks], perkPoints: this.perkPoints, chemUntil: this.chemUntil, addictUntil: this.addictUntil };
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
    c.perks = new Set(d.perks ?? []);
    c.perkPoints = d.perkPoints ?? 0;
    c.chemUntil = { ...(d.chemUntil ?? {}) };
    c.addictUntil = { ...(d.addictUntil ?? {}) };
    return c;
  }
}
