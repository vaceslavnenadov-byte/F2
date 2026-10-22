export interface QuestState {
  state: 'active' | 'done' | 'rewarded';
  progress: number;
}

export const QUESTS: Record<string, { title: string; desc: (q: QuestState) => string }> = {
  geckos: {
    title: 'Гнездо в каньоне',
    desc: (q) =>
      q.state === 'rewarded'
        ? 'Гнездо гекконов уничтожено. Старейшина щедро наградил тебя.'
        : q.state === 'done'
          ? 'Все гекконы в гнезде мертвы. Вернись к Старейшине.'
          : `Старейшина просит уничтожить гекконов в каньоне за восточными воротами. Убито: ${q.progress}/5.`,
  },
  dog: {
    title: 'Пропавший Дымок',
    desc: (q) =>
      q.state === 'rewarded'
        ? 'Дымок вернулся к Нагору.'
        : q.state === 'done'
          ? 'Дымок нашёлся и идёт за тобой. Отведи его к Нагору.'
          : 'Пёс Нагора убежал на северо-запад, к скалам за воротами. Найди его.',
  },
};

export const GECKO_GOAL = 5;
