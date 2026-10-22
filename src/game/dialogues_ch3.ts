import type { DialogueDef } from './dialogues';
import type { Game } from './game';
import { NAVARRO_SOLDIERS } from '../world/locations/navarro';

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

const stage = (g: Game) => g.quests.enclave?.progress ?? -1;

/** Диалоги третьей главы: Сан-Франциско, Наварро, платформа Анклава. */
export const CH3_DIALOGUES: Record<string, DialogueDef> = {
  // ─── Сан-Франциско ────────────────────────────────────────────────────────
  captain: {
    start: (g) => {
      if (g.flags.has('rigDestroyed')) return 'after';
      if (stage(g) >= 2) return 'ready';
      if (stage(g) === 1) return 'status';
      return 'intro';
    },
    nodes: {
      intro: {
        text: 'Капитан Барнаби, «Посейдон». Тебе к платформе посреди моря? Ха! Её видно в хорошую погоду — огни на воде. ' +
          'Мой танкер дойдёт, но баки пусты. А Анклав топит любое судно, которое не передаёт их код «свой-чужой».',
        options: [
          {
            text: 'Где взять топливо и код?',
            action: (g) => {
              g.startQuest('enclave');
              g.advanceQuest('enclave', 1);
              g.discover('navarro');
            },
            next: 'needs',
          },
          { text: 'Позже.', next: null },
        ],
      },
      needs: {
        text: 'Топливо — спроси механика Ли у старого склада к северу. А коды Анклав хранит на базе Наварро, на северном побережье. ' +
          'Как ты туда пролезешь — не моё дело. Добудешь оба — отплываем.',
        options: [{ text: 'Будет сделано.', next: null }],
      },
      status: {
        text: (g) => {
          const fuel = g.flags.has('tankerFuel') ? 'Топливо в баках.' : 'Баки пусты — иди к механику Ли.';
          const code = g.inv.count('fobCode') ? 'Код у тебя.' : 'Кода опознавания нет — он на базе Наварро.';
          return `${fuel} ${code}`;
        },
        options: [{ text: 'Понял.', next: null }],
      },
      ready: {
        text: 'Баки полны, код в передатчике. «Посейдон» готов. Только учти: обратного билета Анклав не выдаёт.',
        options: [
          { text: 'Отплываем!', action: (g) => g.sailToRig(), next: null },
          { text: 'Ещё не время.', next: null },
        ],
      },
      after: {
        text: 'Видел этот взрыв? Полнеба горело! Если когда-нибудь снова понадобится танкер — ты знаешь, где меня найти.',
        options: [{ text: 'Спасибо, капитан.', next: null }],
      },
    },
  },

  mechanicLee: {
    start: (g) => (g.flags.has('tankerFuel') ? 'after' : (g.questKills.mutants ?? 0) >= 3 ? 'cleared' : 'hello'),
    nodes: {
      hello: {
        text: 'Топливо для «Посейдона»? На складе за забором его полно. Только склад заняли супермутанты — огромные, зелёные и злые. ' +
          'Выбьешь их — заправлю танкер бесплатно. Или найди 800 крышек: у меня есть заначка.',
        options: [
          { text: 'Я разберусь с мутантами.', action: (g) => g.startQuest('mutants'), next: null },
          {
            text: 'Вот 800 крышек.',
            cond: (g) => g.inv.count('caps') >= 800,
            action: (g) => {
              g.takeItem('caps', 800);
              g.flags.add('tankerFuel');
              g.checkTanker();
            },
            next: 'paid',
          },
          { text: 'Кто такие супермутанты?', next: 'mutants' },
          { text: 'Пока.', next: null },
        ],
      },
      mutants: {
        text: 'Говорят, их сделали из людей каким-то вирусом. Сильны как брамины, глупы как пробка. Не подходи к ним с ножиком.',
        options: [{ text: 'Учту.', next: 'hello' }],
      },
      paid: {
        text: 'Деньги любят тишину. К вечеру «Посейдон» будет заправлен.',
        options: [{ text: '[Уйти]', next: null }],
      },
      cleared: {
        text: 'Ты их перебил?! Ну ты зверь. Заправлю танкер сегодня же — бесплатно, как обещал.',
        options: [
          {
            text: 'Договорились.',
            action: (g) => {
              g.flags.add('tankerFuel');
              if (g.quests.mutants) g.quests.mutants.state = 'rewarded';
              g.addXp(400);
              g.checkTanker();
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Баки «Посейдона» полны. Удачи в море.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  rico: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Рико. Достаю то, что достать нельзя. Патроны, батареи для плазмы, бумаги… Платишь — не задаёшь вопросов.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('rico'), next: null },
          { text: 'Мне нужно попасть на базу Анклава.', next: 'papers' },
          { text: 'Пока.', next: null },
        ],
      },
      papers: {
        text: 'Тогда тебе нужны бумаги новобранца. Они есть в моём товаре. С ними сержант на воротах Наварро даже не моргнёт.',
        options: [{ text: 'Понятно.', next: 'hello' }],
      },
    },
  },

  sfFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Ночью видел огни в море. Это платформа. Оттуда прилетают железные птицы.',
          'Мутанты засели на топливном складе. Ли весь извёлся.',
          'Капитан Барнаби — старый пират, но слово держит.',
          'Рико продаст тебе что угодно. Даже то, чего не существует.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  // ─── Наварро ──────────────────────────────────────────────────────────────
  navGate: {
    start: (g) => (g.flags.has('navarroIn') ? 'in' : 'hello'),
    nodes: {
      hello: {
        text: 'Стоять! Посторонним вход на базу запрещён. Назовись.',
        options: [
          {
            text: 'Рядовой, прибыл по направлению. Вот документы.',
            cond: (g) => g.inv.count('fakePapers') > 0,
            action: (g) => g.flags.add('navarroIn'),
            next: 'welcome',
          },
          {
            text: 'Новобранец из пустоши! Меня направили к интенданту, сэр!',
            check: '[Красноречие 70]',
            cond: (g) => g.char.skill('speech') >= 70,
            action: (g) => {
              g.flags.add('navarroIn');
              g.addXp(300);
            },
            next: 'welcome',
          },
          { text: '[Атаковать]', action: (g) => g.turnHostile(NAVARRO_SOLDIERS, 'navarroAlarm'), next: null },
          { text: 'Ухожу.', next: null },
        ],
      },
      welcome: {
        text: 'Хм. Ещё один дикарь в новобранцы… Ладно. Интендант Белл у казарм выдаст тебе броню. В командный бункер без приказа не соваться.',
        options: [{ text: 'Есть, сэр!', next: null }],
      },
      in: {
        text: 'Проходи, рядовой. И приведи себя в порядок.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  quartermaster: {
    start: (g) => (g.flags.has('gotPA') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'Новобранец? Получи силовую броню. Распишись здесь. Поцарапаешь — вычту из жалованья.',
        options: [
          {
            text: 'Спасибо, интендант.',
            action: (g) => {
              g.flags.add('gotPA');
              g.giveItem('powerArmor');
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Броня по размеру? Отлично. Свободен.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  enclaveTalk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Чистота крови — залог будущего Америки.',
          'Мутанты снаружи… Скоро мы очистим пустошь от этой заразы.',
          'Говорят, на платформе готовят что-то страшное. Вирус. Но приказ есть приказ.',
          'Президент знает, что делает. Не задавай лишних вопросов, рядовой.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  // ─── Платформа ────────────────────────────────────────────────────────────
  elderRig: {
    start: (g) => (g.flags.has('tribeFreed') ? 'freed' : 'caged'),
    nodes: {
      caged: {
        text: 'Избранный! Ты пришёл… Они держат нас в клетке и что-то колют. Говорят о «чистке». Замки открываются с пульта у командного модуля. Ключ-карта — у офицера.',
        options: [{ text: 'Держитесь. Я вас вытащу.', next: null }],
      },
      freed: {
        text: 'Свободны! Мы бежим к танкеру. А ты… реактор этой проклятой платформы — на южной палубе. Если он рванёт, Анклав больше никому не причинит зла. Береги себя, дитя.',
        options: [{ text: 'Бегите к причалу!', next: null }],
      },
    },
  },

  rigOfficer: {
    start: (g) => (g.inv.count('keycard') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'Рядовой? Почему не на посту? Докладывай.',
        options: [
          {
            text: 'Приказ сверху, сэр: проверить пульт тюремного блока. Нужна ваша карта доступа.',
            check: '[Красноречие 60]',
            cond: (g) => g.char.skill('speech') >= 60,
            action: (g) => {
              g.giveItem('keycard');
              g.addXp(300);
            },
            next: 'card',
          },
          { text: 'Виноват, сэр. Возвращаюсь на пост.', next: null },
        ],
      },
      card: {
        text: 'Опять эти проверки… Держи. Вернёшь до конца смены.',
        options: [{ text: 'Есть, сэр.', next: null }],
      },
      after: {
        text: 'Карту не потеряй, рядовой.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  tribeRig: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: (g) => (g.flags.has('tribeFreed')
          ? pick(['К танкеру! Быстрее!', 'Духи, спасибо!', 'Я знал, что ты придёшь!'])
          : pick(['Спаси нас!', 'Они кололи нам что-то… голова кружится.', 'Старейшина говорит, ты нас вытащишь.'])),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },
};
