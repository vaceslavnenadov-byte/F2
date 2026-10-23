import type { DialogueDef } from './dialogues';

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Глава VII: новый Арройо и последний бой. */
export const CH7_DIALOGUES: Record<string, DialogueDef> = {
  elderNew: {
    start: (g) => {
      if (g.flags.has('finalDone')) return 'after';
      if (g.flags.has('horriganDead')) return 'victory';
      if (g.flags.has('enclaveAttack')) return 'fight';
      return g.quests.lastStand ? 'ready' : 'hello';
    },
    nodes: {
      hello: {
        text: 'Избранный! Посмотри вокруг. ГЭКК сотворил чудо: вода в пруду, зелень на полях, дети не плачут от голода. Племя живёт — благодаря тебе. ' +
          'Но Хакунину снова снятся сны. Железная птица возвращается, а с ней — человек-гора в чёрной броне. Он придёт мстить за платформу.',
        options: [
          { text: 'Пусть приходит. Я встречу его здесь.', action: (g) => g.startQuest('lastStand'), next: 'ready' },
          { text: 'Мне нужно подготовиться. Я вернусь.', action: (g) => g.startQuest('lastStand'), next: null },
        ],
      },
      ready: {
        text: 'Воины Арройо готовы встать рядом с тобой: Нагор, охотники, молодые копейщики. Хакунин говорит — птица прилетит, когда ты будешь ждать её. Ты готов, Избранный?',
        options: [
          { text: 'Я готов. Пусть приходят. [Начать последний бой]', action: (g) => g.startEnclaveAttack(), next: null },
          { text: 'Ещё не время.', next: null },
        ],
      },
      fight: {
        text: 'Они здесь! Сражайся, Избранный, — духи предков с тобой!',
        options: [{ text: '[В бой]', next: null }],
      },
      victory: {
        text: '*Старейшина опирается на посох и долго смотрит на поверженного гиганта.* Человек-гора пал. Чёрные люди больше не придут — я чувствую это. ' +
          'Ты прошёл Храм Испытаний мальчишкой, а вернулся легендой. Отныне твоё имя будут петь у каждого костра.',
        options: [{ text: 'Это конец пути. [Финал]', action: (g) => g.finalEnding(), next: null }],
      },
      after: {
        text: 'Арройо будет жить. Здесь всегда твой дом, Избранный.',
        options: [{ text: 'Спасибо, Старейшина.', next: null }],
      },
    },
  },

  hakuninNew: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: (g) => (g.flags.has('horriganDead')
          ? 'Сны ушли. Впервые за много лет я сплю спокойно. Ты сделал это, дитя.'
          : 'Я вижу железную птицу в каждом сне. Огромный человек в чёрном. Он идёт сюда. Будь готов.'),
        options: [
          { text: 'Покажи травы.', action: (g) => g.openTrade('hakunin'), next: null },
          { text: '[Уйти]', next: null },
        ],
      },
    },
  },

  arroyoNew: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: (g) => (g.flags.has('horriganDead')
          ? pick(['Ты видел, как он упал? Я буду рассказывать внукам!', 'Арройо выстоял! Слава Избранному!', 'Теперь можно снова сеять.'])
          : pick([
            'Кукуруза растёт выше моей головы! Я такого никогда не видел.',
            'ГЭКК даёт воду. Настоящую, чистую воду.',
            'На платформе было страшно. Спасибо, что пришёл за нами.',
            'Хакунин говорит, чёрные люди вернутся. Я не боюсь — ты же с нами.',
          ])),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },
};
