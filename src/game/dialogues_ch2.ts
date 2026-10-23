import type { DialogueDef } from './dialogues';
import type { Game } from './game';

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

const geckStage = (g: Game) => g.quests.geck?.progress ?? -1;
const CLAWS = ['grah', 'claw1', 'claw2', 'claw3'];

function grantPass(g: Game) {
  g.openVaultCityGate();
  g.addXp(150);
}

function rewardCitizen(g: Game) {
  g.flags.add('citizenAccess');
  g.advanceQuest('geck', 6);
  g.giveItem('caps', 300);
  g.addXp(400);
}

/** Диалоги второй главы: Убежище-Сити, Гекко, Убежище 13, разорённое Арройо. */
export const CH2_DIALOGUES: Record<string, DialogueDef> = {
  // ─── Убежище-Сити ─────────────────────────────────────────────────────────
  vcGuard: {
    start: (g) => (g.flags.has('vcPass') ? 'pass' : 'stop'),
    nodes: {
      stop: {
        text: 'Стой. Гражданам — внутрь, чужакам — на таможню. Офицер Рэндал справа от ворот.',
        options: [{ text: 'Понял.', next: null }],
      },
      pass: {
        text: 'Пропуск в порядке. Проходи. И не мусори.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  customs: {
    start: (g) => (g.flags.has('vcPass') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'Чужак? Убежище-Сити — не ночлежка. Дневной пропуск выдаётся тем, кто докажет свою пользу городу или заплатит сбор.',
        options: [
          {
            text: 'Речь о судьбе моего племени. Мне нужно поговорить с вашим руководством — это важно и для города.',
            check: '[Красноречие 55]',
            cond: (g) => g.char.skill('speech') >= 55,
            action: grantPass,
            next: 'granted',
          },
          {
            text: 'Я разбираюсь в довоенной технике. Вашему городу пригодятся мозги.',
            check: '[Наука 45]',
            cond: (g) => g.char.skill('science') >= 45,
            action: grantPass,
            next: 'smart',
          },
          { text: 'Сколько стоит пропуск?', next: 'fee' },
          { text: 'Пока.', next: null },
        ],
      },
      fee: {
        text: 'Сбор — 150 крышек. Плюс обязательный медосмотр… шучу. Плати — и проходи.',
        options: [
          {
            text: 'Вот 150 крышек.',
            cond: (g) => g.inv.count('caps') >= 150,
            action: (g) => {
              g.takeItem('caps', 150);
              g.openVaultCityGate();
            },
            next: 'granted',
          },
          { text: 'Слишком дорого.', next: 'hello' },
        ],
      },
      smart: {
        text: 'Хм. Пара вопросов о реакторах… Ладно, ты не врёшь. Нам такие нужны. Держи пропуск.',
        options: [{ text: 'Спасибо.', next: 'granted' }],
      },
      granted: {
        text: 'Пропуск выдан. Ворота открыты. Не нарушай порядок — охрана здесь стреляет быстро.',
        options: [{ text: '[Уйти]', next: null }],
      },
      after: {
        text: 'Пропуск при тебе? Хорошо. Первый гражданин принимает в Совете, в центре города.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  firstCitizen: {
    start: (g) => {
      const st = geckStage(g);
      if (st >= 6) return 'after';
      if (st === 5 || (st === 4 && g.flags.has('reactorFixed'))) return 'reward';
      if (st === 4) return 'waiting';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'Первый гражданин Хольм. Вы не гражданин — это видно. У вас минута.',
        options: [
          { text: 'Я ищу ГЭКК для своего племени.', cond: (g) => geckStage(g) === 3, next: 'geck' },
          { text: 'Что такое Убежище-Сити?', next: 'city' },
          { text: 'Ухожу.', next: null },
        ],
      },
      city: {
        text: 'Мы — потомки жителей Убежища 8. Порядок, чистота, медицина. Пустошь за стенами пусть сама о себе заботится.',
        options: [{ text: 'Понятно.', next: 'hello' }],
      },
      geck: {
        text: 'ГЭКК? Наш построил этот город — и давно израсходован. Но компьютер Убежища 8 хранит координаты других убежищ, в том числе тех, где ГЭКК могли не тронуть. ' +
          'Доступ — только для граждан. Однако у нас беда: станция гулей в Гекко травит наши поля радиацией. Остановите утечку — и я лично дам вам допуск.',
        options: [
          {
            text: 'Я займусь этим.',
            cond: (g) => !g.flags.has('reactorFixed'),
            action: (g) => {
              g.advanceQuest('geck', 4);
              g.discover('gecko');
            },
            next: null,
          },
          {
            text: 'Утечки уже нет — я починил реактор в Гекко.',
            cond: (g) => g.flags.has('reactorFixed'),
            action: (g) => g.advanceQuest('geck', 5),
            next: 'reward',
          },
          { text: 'Почему бы вам самим не разобраться?', next: 'why' },
        ],
      },
      why: {
        text: 'Наша охрана не полезет в радиоактивное логово гулей. А вы, племенной, выглядите… живучим.',
        options: [{ text: 'Ясно.', next: 'geck' }],
      },
      waiting: {
        text: 'Дозиметры на полях по-прежнему трещат. Гекко — к востоку отсюда. Не тяните.',
        options: [{ text: 'Уже иду.', next: null }],
      },
      reward: {
        text: 'Датчики на полях впервые за год показывают норму. Город у вас в долгу. Вот допуск к терминалу Убежища 8 — он у северной стены. И крышки за труды.',
        options: [{ text: 'Благодарю, Первый гражданин.', action: rewardCitizen, next: null }],
      },
      after: {
        text: 'Надеюсь, вы нашли, что искали. Убежище-Сити не забывает тех, кто ему помог.',
        options: [{ text: 'Прощайте.', next: null }],
      },
    },
  },

  vcDoctor: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Доктор Андерс. Лечу граждан, а за плату — и остальных. Антирадин, стимуляторы, Рад-Х — всё есть.',
        options: [
          { text: 'Покажи лекарства.', action: (g) => g.openTrade('vcdoctor'), next: null },
          {
            text: 'Вылечите меня полностью (50 крышек).',
            cond: (g) => g.inv.count('caps') >= 50 && (g.char.hp < g.char.maxHp || g.char.rads > 0),
            action: (g) => g.doctorHeal(50),
            next: 'healed',
          },
          { text: 'Пока.', next: null },
        ],
      },
      healed: {
        text: 'Готово. Раны зашиты, радиация выведена. Постарайтесь не возвращаться слишком скоро.',
        options: [{ text: 'Спасибо, доктор.', next: null }],
      },
    },
  },

  vcShop: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Лавка Мэйсона. Довоенное снаряжение, патроны, броня. Цены городские — то есть высокие.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('vcstore'), next: null },
          { text: 'Пока.', next: null },
        ],
      },
    },
  },

  citizen: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Вы не гражданин? Тогда держитесь подальше от моего газона.',
          'Говорят, гули из Гекко травят наши поля. Отвратительно.',
          'Первый гражданин Хольм — строгий, но справедливый.',
          'Слышали? В пустоши видели летающую машину. Чушь, конечно.',
          'Гражданство дают за заслуги перед городом. Или за брак с гражданином. Даже не думайте.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  // ─── Гекко ────────────────────────────────────────────────────────────────
  skeet: {
    start: (g) => (g.flags.has('reactorFixed') ? 'after' : g.inv.count('regulator') ? 'part' : 'hello'),
    nodes: {
      hello: {
        text: 'Не пялься, кожа у меня всегда такая. Я Скит, слежу за реактором. Регулятор потока сгорел, станция течёт — граждане грозятся прийти с огнемётами. ' +
          'Запасной лежит в ящике во дворе с отходами. Только там дикие гули… и фон такой, что зубы светятся.',
        options: [
          { text: 'Я достану регулятор.', action: (g) => g.startQuest('reactor'), next: null },
          { text: 'Что за дикие гули?', next: 'ferals' },
          { text: 'Как защититься от радиации?', next: 'rads' },
          { text: 'Пока.', next: null },
        ],
      },
      ferals: {
        text: 'Наши, которые свихнулись от радиации. Себя не помнят. Жалко их, но они тебя не пожалеют.',
        options: [{ text: 'Понял.', next: 'hello' }],
      },
      rads: {
        text: 'Рад-Х перед походом — вполовину меньше хватанёшь. Антирадин после — выведет дрянь. Лорин продаёт и то и другое.',
        options: [{ text: 'Спасибо.', next: 'hello' }],
      },
      part: {
        text: 'Это он! Давай сюда — поставлю за пару минут.',
        options: [
          { text: 'Держи.', action: (g) => g.fixReactor(false), next: 'thanks' },
          { text: 'Я поставлю сам.', check: '[Ремонт 60]', cond: (g) => g.repairSkill() >= 60, next: 'self' },
        ],
      },
      self: {
        text: 'Ого, умник. Пульт у входа в станцию. Не перепутай провода.',
        options: [{ text: '[Уйти]', next: null }],
      },
      thanks: {
        text: 'Готово. Слышишь? Градирни снова парят как положено. Граждане могут спать спокойно — и мы тоже.',
        options: [{ text: 'Рад помочь.', next: null }],
      },
      after: {
        text: 'Реактор поёт. Спасибо, гладкокожий.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  lorin: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Лорин, торгую всем, что не светится. Ну, почти всем. Антирадин? Рад-Х? Патроны?',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('gecko'), next: null },
          { text: 'Пока.', next: null },
        ],
      },
    },
  },

  cornelius: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Мне двести с лишним лет, юноша. Я помню, как падали бомбы. Помню, как Волт-Тек обещал убежища на всех. Врали, конечно.',
        options: [
          { text: 'Что вы знаете об Убежище 13?', next: 'v13' },
          { text: 'Прощайте.', next: null },
        ],
      },
      v13: {
        text: 'Тринадцатое? Говорили, его жители вышли наружу и построили мир заново. А потом туда пришли какие-то люди в чёрном… С тех пор оттуда никто не возвращался.',
        options: [{ text: 'Тревожно.', next: null }],
      },
    },
  },

  ghoulFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Не бойся, не укушу. Я из нормальных.',
          'Граждане нас ненавидят. А мы просто хотим, чтобы станция работала.',
          'Двор за станцией не трогай без Рад-Х. Серьёзно.',
          'Скит — гений. Если ему дать детали, он и луну починит.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  // ─── Убежище 13 ───────────────────────────────────────────────────────────
  grah: {
    start: (g) => (g.flags.has('clawsAllow') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: '*Огромный коготь смерти поднимается во весь рост.* Человек. Говори. Грах слушает. Грах не убивает… пока.',
        options: [
          { text: 'Вы… умеете говорить?', next: 'talk' },
          { text: 'Я пришёл за ГЭКК. Моё племя умирает от засухи.', next: 'geck' },
          { text: '[Атаковать]', action: (g) => { g.addKarma(-40); g.turnHostile(CLAWS, 'deathclawsHostile'); }, next: null },
          { text: 'Ухожу.', next: null },
        ],
      },
      talk: {
        text: 'Люди Убежища учили нас. Давно. Потом пришли люди в чёрном железе. Убили людей Убежища. Убили многих из нас. Мы остались. Мы ждём.',
        options: [{ text: 'Мне жаль.', next: 'hello' }],
      },
      geck: {
        text: 'Чемодан-сад. Люди Убежища говорили: он делает жизнь. Нам он не нужен. Но Грах не отдаст его просто так. Докажи, что ты не как люди в чёрном.',
        options: [
          {
            text: 'Люди в чёрном — и мои враги. Отдай ГЭКК, и мой народ будет жить, а не вымирать, как твой.',
            check: '[Красноречие 65]',
            cond: (g) => g.char.skill('speech') >= 65,
            action: (g) => {
              g.flags.add('clawsAllow');
              g.addKarma(40);
              g.addXp(400);
            },
            next: 'allow',
          },
          {
            text: 'Ваш очиститель воды едва работает. Я налажу его взамен.',
            check: '[Наука 50]',
            cond: (g) => g.char.skill('science') >= 50,
            action: (g) => {
              g.flags.add('clawsAllow');
              g.addKarma(40);
              g.addXp(400);
            },
            next: 'fixed',
          },
          {
            text: 'Отдайте, и я уйду с миром. Вот 400 крышек — вам пригодится для торговли с людьми.',
            cond: (g) => g.inv.count('caps') >= 400,
            action: (g) => {
              g.takeItem('caps', 400);
              g.flags.add('clawsAllow');
            },
            next: 'allow',
          },
          { text: 'Тогда я возьму его силой.', action: (g) => g.turnHostile(CLAWS, 'deathclawsHostile'), next: null },
          { text: 'Я подумаю.', next: null },
        ],
      },
      allow: {
        text: '*Грах долго смотрит на тебя.* …Бери. Иди. И помни: люди в чёрном придут и за тобой.',
        options: [{ text: 'Спасибо, Грах.', next: null }],
      },
      fixed: {
        text: '*Где-то в глубине убежища загудели насосы.* Вода чистая. Грах держит слово. Бери чемодан-сад.',
        options: [{ text: 'Спасибо, Грах.', next: null }],
      },
      after: {
        text: 'Иди, человек. Береги свой народ лучше, чем мы.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  deathclaw: {
    start: () => 'growl',
    nodes: {
      growl: {
        text: '*Коготь смерти глухо рычит и косится на Граха. Говорить будет вожак.*',
        options: [{ text: '[Отойти]', next: null }],
      },
    },
  },

  // ─── Разорённое Арройо ────────────────────────────────────────────────────
  hakuninRaid: {
    start: (g) => (g.quests.enclave ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: '*Хакунин лежит у кострища, весь в крови.* Ты… вернулся. С ГЭКК… Поздно, дитя. Они пришли с неба, на железной птице. Люди в чёрной броне. Анклав. ' +
          'Забрали всех… Старейшину… детей…',
        options: [{ text: 'Куда их увезли?', next: 'where' }],
      },
      where: {
        text: 'На запад… к морю… Я видел во сне платформу посреди воды, в огнях. В порту Сан-Франциско есть люди с кораблями. Найди их, Избранный. Верни наш народ. ГЭКК… сохрани. Он ещё понадобится.',
        options: [
          {
            text: 'Я найду их. Клянусь.',
            action: (g) => {
              g.advanceQuest('geck', 9);
              g.quests.geck.state = 'rewarded';
              g.startQuest('enclave');
              g.discover('sanfran');
              g.addXp(500);
              g.ui.banner('КОНЕЦ ГЛАВЫ II', 4);
            },
            next: 'end',
          },
        ],
      },
      end: {
        text: 'Духи… с тобой…',
        options: [{ text: '[Уйти]', next: null }],
      },
      after: {
        text: 'Иди… не медли…',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },
};
