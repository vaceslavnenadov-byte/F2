import type { Game } from './game';
import { GECKO_GOAL } from './quests';

type Text = string | ((g: Game) => string);

export interface DialogueOption {
  text: Text;
  /** Подпись проверки, например «[Красноречие 45]». */
  check?: string;
  cond?: (g: Game) => boolean;
  action?: (g: Game) => void;
  next: string | null;
}

export interface DialogueNode {
  text: Text;
  options: DialogueOption[];
}

export interface DialogueDef {
  start: (g: Game) => string;
  nodes: Record<string, DialogueNode>;
}

const dumb = (g: Game) => g.char.special.in <= 3;
const smart = (g: Game) => !dumb(g);

function rewardGeckos(g: Game, bonus: boolean) {
  g.quests.geckos.state = 'rewarded';
  g.giveItem('zipgun', 1);
  g.giveItem('ammo10', 12);
  g.addXp(400);
  if (bonus) {
    g.giveItem('powder', 3);
    g.giveItem('ammo10', 8);
    g.addXp(100);
  }
}

export const DIALOGUES: Record<string, DialogueDef> = {
  elder: {
    start: (g) => {
      const q = g.quests.geckos;
      if (!q) return dumb(g) ? 'introDumb' : 'intro';
      if (q.state === 'active') return 'progress';
      if (q.state === 'done') return 'reward';
      return 'after';
    },
    nodes: {
      intro: {
        text: (g) =>
          `Подойди, ${g.char.name}. Ты прошёл Храм Испытаний и теперь по праву зовёшься воином Арройо. ` +
          'Но духи неспокойны: в каньоне к востоку расплодились гекконы. Они таскают наших брамин и нападают на охотников.',
        options: [
          { text: 'Я разберусь с гекконами.', action: (g) => g.startQuest('geckos'), next: 'accepted' },
          { text: 'Почему именно я?', next: 'whyme' },
          { text: 'Расскажи об Арройо.', next: 'arroyo' },
          { text: 'Позже.', next: null },
        ],
      },
      whyme: {
        text: 'Потому что в тебе течёт кровь Выходца из Убежища — того, кто основал нашу деревню. Он тоже не знал страха. ' +
          'А ещё потому, что у остальных воинов копья короче, чем языки.',
        options: [
          { text: 'Ладно. Я иду в каньон.', action: (g) => g.startQuest('geckos'), next: 'accepted' },
          { text: 'Мне нужно подумать.', next: null },
        ],
      },
      arroyo: {
        text: 'Наши предки пришли в эту долину давным-давно, следуя за Выходцем. Земля здесь скупа, а засуха с каждым годом всё злее. ' +
          'Хакунин говорит, что спасти нас может лишь легендарный ГЭКК — чудо старого мира, что творит сады из праха. Но это история для другого дня.',
        options: [{ text: 'Вернёмся к гекконам.', next: 'intro' }],
      },
      accepted: {
        text: 'Пусть духи хранят тебя. Гнездо — в каньоне за восточными воротами, между двумя столовыми горами. ' +
          'Убей всех. И загляни к Хакунину — он даст целебного порошка.',
        options: [{ text: 'Будет сделано.', next: null }],
      },
      introDumb: {
        text: 'Дитя... ты меня понимаешь? *Старейшина медленно показывает на восток и изображает пальцами бегущую ящерицу.*',
        options: [
          { text: 'Ящерка! Бить ящерка!', action: (g) => g.startQuest('geckos'), next: 'acceptedDumb' },
          { text: 'Ыыы?', next: null },
        ],
      },
      acceptedDumb: {
        text: '*Старейшина вздыхает.* Да. Бить ящерка. Много ящерка. Там, где встаёт солнце.',
        options: [{ text: 'Угу!', next: null }],
      },
      progress: {
        text: (g) => `Гекконы всё ещё живы — охотники каждое утро находят свежие следы. (Убито: ${g.quests.geckos.progress}/${GECKO_GOAL})`,
        options: [
          { text: 'Где именно гнездо?', cond: smart, next: 'where' },
          { text: 'Уже иду.', next: null },
        ],
      },
      where: {
        text: 'Выйди через восточные ворота и иди на восход солнца. Каньон зажат между двумя скалами. Гнездо — в каменном кольце.',
        options: [{ text: 'Понял.', next: null }],
      },
      reward: {
        text: 'Охотники видели твою работу. Гнездо опустело! Ты вернул мир в долину.',
        options: [
          {
            text: 'Я рисковал жизнью. Племя могло бы отблагодарить щедрее.',
            check: '[Красноречие 45]',
            cond: (g) => g.char.skill('speech') >= 45 && smart(g),
            action: (g) => rewardGeckos(g, true),
            next: 'rewardedBonus',
          },
          { text: 'Это было несложно.', action: (g) => rewardGeckos(g, false), next: 'rewarded' },
        ],
      },
      rewarded: {
        text: 'Возьми это. Самопал — оружие старого мира, его выменял у торговцев мой отец. Пусть служит тебе лучше, чем ему.',
        options: [{ text: 'Спасибо, Старейшина.', next: null }],
      },
      rewardedBonus: {
        text: '*Старейшина усмехается.* Язык у тебя острее копья. Хорошо: вот самопал моего отца, патроны и порошок от Хакунина.',
        options: [{ text: 'Племя не пожалеет.', next: null }],
      },
      after: {
        text: 'Ты — гордость Арройо. Но когда придёт время, тебе предстоит путь куда длиннее этого каньона.',
        options: [
          { text: 'Какой путь?', cond: smart, next: 'path' },
          { text: 'До встречи.', next: null },
        ],
      },
      path: {
        text: 'Засуха убивает нас. Однажды тебе придётся покинуть долину и отыскать ГЭКК. Но не сегодня. Сегодня отдохни у костра.',
        options: [{ text: 'Я буду готов.', next: null }],
      },
    },
  },

  nagor: {
    start: (g) => {
      if (g.quests.dog?.state === 'rewarded') return 'after';
      if (g.flags.has('dogFound')) return 'returned';
      if (g.quests.dog) return 'waiting';
      return 'intro';
    },
    nodes: {
      intro: {
        text: 'Эй! Ты не видел Дымка? Мой пёс сбежал вчера, когда гекконы завыли. Я слышал лай на северо-западе, у скал за воротами... но одному мне туда страшно.',
        options: [
          { text: 'Я найду твоего пса.', action: (g) => g.startQuest('dog'), next: 'thanks' },
          { text: 'Сам ищи.', next: 'rude' },
          { text: 'Пока.', next: null },
        ],
      },
      thanks: {
        text: 'Правда?! Духи тебя благословят! Он серый, лохматый и обожает, когда чешут за ухом. Будь осторожен — там тоже бродят гекконы.',
        options: [{ text: 'Скоро вернусь.', next: null }],
      },
      rude: {
        text: '...Ладно. Извини, что побеспокоил.',
        options: [{ text: '[Уйти]', next: null }],
      },
      waiting: {
        text: 'Ты нашёл Дымка? Северо-запад, у камней за воротами!',
        options: [{ text: 'Ищу.', next: null }],
      },
      returned: {
        text: 'ДЫМОК! Ах ты, блохастый бродяга! Спасибо тебе, правда. Возьми — это всё, что у меня есть.',
        options: [{ text: 'Рад помочь.', action: (g) => g.completeDogQuest(), next: null }],
      },
      after: {
        text: 'Дымок теперь от меня ни на шаг. Если что — мы с ним всегда у моей хижины.',
        options: [{ text: 'Береги его.', next: null }],
      },
    },
  },

  hakunin: {
    start: (g) => (g.flags.has('hakuninGift') ? 'after' : 'intro'),
    nodes: {
      intro: {
        text: 'Хм-м-м... Я видел тебя во сне, дитя. Ты шёл сквозь огонь и пепел, а за тобой тянулась тень Убежища.',
        options: [
          { text: 'Что это значит?', next: 'meaning' },
          { text: 'Старейшина сказал, у тебя есть целебный порошок.', next: 'gift' },
          { text: 'Странный ты.', next: null },
        ],
      },
      meaning: {
        text: 'Сны не объясняют — сны предупреждают. Остерегайся того, что сияет в пустоши, и не верь людям в синих одеждах.',
        options: [
          { text: 'Мне нужен целебный порошок.', next: 'gift' },
          { text: 'Я запомню.', next: null },
        ],
      },
      gift: {
        text: 'Конечно. Корень ксандера и цветок брока — лучшее, что даёт эта земля. Лечит раны, но не злоупотребляй.',
        options: [
          {
            text: 'Спасибо.',
            action: (g) => {
              g.flags.add('hakuninGift');
              g.giveItem('powder', 3);
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Духи шепчут, что ты ещё вернёшься ко мне. Береги себя.',
        options: [
          { text: 'Как лучше лечить раны?', next: 'howto' },
          { text: 'Прощай.', next: null },
        ],
      },
      howto: {
        text: 'Порошок — в твоей сумке (клавиша I). В бою он отнимает 2 очка действия. А вне боя раны затягиваются сами — понемногу.',
        options: [{ text: 'Понятно.', next: null }],
      },
    },
  },

  villager: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => {
          const lines = [
            'Пусть духи хранят тебя.',
            'Слышал? Гекконы опять утащили брамина с южного выпаса.',
            'Жара... Колодец почти пересох. Шаман говорит — это знак.',
            'Говорят, ты прошёл Храм быстрее всех! Даже муравьёв не испугался.',
            'Нагор совсем извёлся из-за своего пса.',
            'Раньше дожди приходили каждую весну. Теперь — только пыль.',
          ];
          return lines[Math.floor(Math.random() * lines.length)];
        },
        options: [{ text: 'И тебе удачи.', next: null }],
      },
    },
  },
};

export function resolveText(t: Text, g: Game): string {
  return typeof t === 'function' ? t(g) : t;
}
