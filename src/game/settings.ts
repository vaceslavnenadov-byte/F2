// Настройки игрока: хранятся в браузере отдельно от сохранений.

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: Quality;
  tips: boolean;
}

const KEY = 'wasteland2241.settings';
const DEFAULTS: Settings = { master: 0.8, music: 0.6, sfx: 0.8, quality: 'high', tips: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* настройки просто не запомнятся */
  }
}

export const QUALITY_NAMES: Record<Quality, string> = { low: 'Низкое', medium: 'Среднее', high: 'Высокое' };
