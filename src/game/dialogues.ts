import type { Game } from './game';
import { CAGE } from '../world/locations/den';
import { CH2_DIALOGUES } from './dialogues_ch2';
import { CH3_DIALOGUES } from './dialogues_ch3';

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
  g.giveItem('caps', 50);
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
        text: (g) => `Гекконы всё ещё живы — охотники каждое утро находят свежие следы. (Убито: ${g.quests.geckos.progress}/5)`,
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
          { text: 'Я готов к долгому пути. Что нужно делать?', cond: (g) => !g.quests.geck, next: 'geck' },
          { text: 'Какой путь?', cond: (g) => smart(g) && !g.quests.geck, next: 'path' },
          { text: 'Я ищу Вика. Есть советы?', cond: (g) => g.quests.geck?.state === 'active', next: 'geckHint' },
          { text: 'До встречи.', next: null },
        ],
      },
      path: {
        text: 'Засуха убивает нас. Однажды тебе придётся покинуть долину и отыскать ГЭКК. Может, это время уже пришло.',
        options: [{ text: 'Расскажи, с чего начать.', next: 'geck' }, { text: 'Я буду готов.', next: null }],
      },
      geck: {
        text: 'Деревне нужен ГЭКК — чудо, что творит сады из праха. Начни с торговца по имени Вик: он бывал у нас и рассказывал о Выходцах из Убежищ. ' +
          'Последний раз его видели в Кламате, к юго-востоку отсюда. Иди по южной тропе — она выведет в пустошь.',
        options: [
          {
            text: 'Я найду Вика.',
            action: (g) => {
              g.startQuest('geck');
              g.discover('klamath');
            },
            next: null,
          },
        ],
      },
      geckHint: {
        text: (g) =>
          g.quests.geck.progress === 0
            ? 'Спроси о Вике в Кламате. Там всегда кто-то торгует, кто-то пьёт — кто-нибудь да знает.'
            : g.quests.geck.progress < 3
              ? 'Дэн — дурное место, дитя. Держи копьё наготове и не верь тамошним людям.'
              : 'Ты ушёл дальше, чем любой из нас. Слушай своё сердце — и не трать время. Засуха не ждёт.',
        options: [{ text: 'Спасибо.', next: null }],
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
          { text: 'Обменяемся? У меня есть шкуры.', action: (g) => g.openTrade('hakunin'), next: null },
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

  // ─── Кламат ───────────────────────────────────────────────────────────────
  maida: {
    start: (g) => (g.quests.rats?.state === 'done' ? 'ratsDone' : 'hello'),
    nodes: {
      hello: {
        text: 'Добро пожаловать в Кламат, путник. Я Мэйда Бакнер — держу салун и лавку. Выпивка, патроны, слухи — всё за крышки.',
        options: [
          {
            text: 'Я ищу торговца по имени Вик.',
            cond: (g) => g.quests.geck?.state === 'active' && g.quests.geck.progress === 0,
            action: (g) => {
              g.advanceQuest('geck', 1);
              g.discover('den');
            },
            next: 'vic',
          },
          { text: 'Давай поторгуем.', action: (g) => g.openTrade('maida'), next: null },
          { text: 'Что за город Кламат?', next: 'town' },
          { text: 'Нет ли работы?', cond: (g) => !g.quests.rats, next: 'job' },
          { text: 'Насчёт крыс…', cond: (g) => g.quests.rats?.state === 'active', next: 'ratsWait' },
          { text: 'Что за парень сидит у крыльца?', cond: (g) => !g.flags.has('sulikJoined'), next: 'sulikInfo' },
          { text: 'Пока.', next: null },
        ],
      },
      vic: {
        text: 'Вик? Старый лис уехал в Дэн месяц назад — хотел сбыть хабар. Говорят, проигрался и теперь сидит в клетке у Мецгера, главного работорговца. ' +
          'Дэн — к югу отсюда. Держи ухо востро: там за крышку горло перережут.',
        options: [{ text: 'Спасибо.', next: 'hello' }],
      },
      town: {
        text: 'Трапперы, пастухи брамина да пара бродяг. Живём охотой на гекконов и торговлей шкурами. Мирно — если не считать крыс и бандитов на дорогах.',
        options: [{ text: 'Понятно.', next: 'hello' }],
      },
      job: {
        text: 'Есть. У склада на западной окраине завелись крысы — здоровые, как собаки. Перебьёшь — заплачу сотню крышек.',
        options: [
          { text: 'Берусь.', action: (g) => g.startQuest('rats'), next: null },
          { text: 'Не сейчас.', next: 'hello' },
        ],
      },
      ratsWait: {
        text: 'Крысы всё ещё там? Склад на западе, не промахнёшься.',
        options: [{ text: 'Уже иду.', next: null }],
      },
      ratsDone: {
        text: 'Слышала, у склада тихо! Держи сотню, ты её заработал.',
        options: [
          {
            text: 'Благодарю.',
            action: (g) => {
              g.quests.rats.state = 'rewarded';
              g.giveItem('caps', 100);
              g.addXp(200);
            },
            next: 'hello',
          },
        ],
      },
      sulikInfo: {
        text: 'Сулик? Племенной, как и ты. Выпил у меня в долг на полсотни крышек и теперь отрабатывает. Заплатишь за него — мне меньше хлопот.',
        options: [{ text: 'Ясно.', next: 'hello' }],
      },
    },
  },

  sulik: {
    start: (g) => (g.flags.has('sulikJoined') ? 'party' : 'hello'),
    nodes: {
      hello: {
        text: 'Сулик видит — ты с племени. Дедушка говорит: хороший знак. Сулик должен Мэйде, уйти не может.',
        options: [
          {
            text: 'Я заплачу твой долг (50 крышек). Пойдёшь со мной?',
            cond: (g) => g.inv.count('caps') >= 50,
            action: (g) => {
              g.takeItem('caps', 50);
              g.recruitSulik();
            },
            next: 'joined',
          },
          {
            text: 'Мэйда отпустит тебя — я с ней договорюсь.',
            check: '[Красноречие 70]',
            cond: (g) => g.char.skill('speech') >= 70,
            action: (g) => g.recruitSulik(),
            next: 'joined',
          },
          { text: 'Дедушка?', next: 'grandpa' },
          { text: 'Удачи.', next: null },
        ],
      },
      grandpa: {
        text: 'Дух дедушки. Живёт в кости. *Сулик стучит по кости в носу.* Дедушка говорит много. Иногда — правду.',
        options: [{ text: 'Понятно…', next: 'hello' }],
      },
      joined: {
        text: 'Хорошо! Сулик идёт с тобой. Дубина Сулика — твоя дубина.',
        options: [{ text: 'Идём.', next: null }],
      },
      party: {
        text: 'Сулик здесь. Дедушка говорит — идти вперёд.',
        options: [{ text: 'Идём.', next: null }],
      },
    },
  },

  torr: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Я Торр. Пасу брамина. Гекконы по ночам воют — брамин нервничает. А нервный брамин — плохое молоко.',
        options: [
          { text: 'Сколько стоит брамин?', next: 'price' },
          { text: 'Удачи с брамином.', next: null },
        ],
      },
      price: {
        text: 'Не продаётся! Ну… для тебя — тоже не продаётся.',
        options: [{ text: 'Ладно.', next: null }],
      },
    },
  },

  klamathFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Шкуры гекконов нынче в цене. Если добудешь — неси к Мэйде.',
          'На дорогах снова бандиты. Без ствола из города лучше не выходить.',
          'Слыхал, в Дэне торгуют людьми. Мерзкое место.',
          'Сулик опять спорит со своим «дедушкой». Чудной парень.',
          'Говорят, на юге есть город, где всё из довоенного бетона.',
        ]),
        options: [{ text: 'Бывай.', next: null }],
      },
    },
  },

  // ─── Дэн ──────────────────────────────────────────────────────────────────
  metzger: {
    start: (g) => (g.flags.has('vicFree') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'Чего надо, племенной? Ищешь работу? Гильдии всегда нужны крепкие рабы. Шучу. Наверное.',
        options: [
          { text: 'Я пришёл за Виком.', next: 'vic' },
          { text: 'Кто ты такой?', next: 'who' },
          { text: 'Ничего.', next: null },
        ],
      },
      who: {
        text: 'Мецгер. Гильдия работорговцев. Всё, что движется в Дэне, движется с моего разрешения.',
        options: [{ text: 'Ясно.', next: 'hello' }],
      },
      vic: {
        text: (g) => (g.flags.has('metzgerDiscount') ? 'Договорились на полторы сотни. Крышки есть?' : 'Старик должен Гильдии. Хочешь его — 300 крышек. Или проваливай.'),
        options: [
          {
            text: 'Вот 300 крышек.',
            cond: (g) => !g.flags.has('metzgerDiscount') && g.inv.count('caps') >= 300,
            action: (g) => {
              g.takeItem('caps', 300);
              freeVic(g);
            },
            next: 'paid',
          },
          {
            text: 'Старик еле дышит. Сдохнет у тебя — ни крышки не получишь. Сто пятьдесят.',
            check: '[Красноречие 60]',
            cond: (g) => !g.flags.has('metzgerDiscount') && g.char.skill('speech') >= 60,
            action: (g) => g.flags.add('metzgerDiscount'),
            next: 'discount',
          },
          {
            text: 'Вот 150 крышек.',
            cond: (g) => g.flags.has('metzgerDiscount') && g.inv.count('caps') >= 150,
            action: (g) => {
              g.takeItem('caps', 150);
              freeVic(g);
            },
            next: 'paid',
          },
          { text: 'Вернусь с крышками.', next: null },
        ],
      },
      discount: {
        text: 'Хех. Язык у тебя подвешен. Ладно — 150, и забирай своего старика.',
        options: [{ text: 'Договорились.', next: 'vic' }],
      },
      paid: {
        text: 'Приятно иметь дело. Эй, там! Выпустите старика!',
        options: [{ text: '[Уйти]', next: null }],
      },
      after: {
        text: 'Сделка закрыта. Проваливай, пока я не передумал.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  slaver: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: 'Не стой столбом. Есть дело — говори с Мецгером.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  vic: {
    start: (g) => (g.flags.has('vicFree') ? (g.flags.has('vicTalked') ? 'after' : 'free') : 'caged'),
    nodes: {
      caged: {
        text: 'Эй, ты! Ты из Арройо? По одежде вижу. Вытащи меня отсюда — поговори с Мецгером. Я в долгу не останусь.',
        options: [
          { text: 'Старейшина послал меня за тобой.', next: 'caged2' },
          { text: 'Посмотрим.', next: null },
        ],
      },
      caged2: {
        text: 'Значит, это из-за фляги… Сначала выпусти, потом поговорим. Мецгер хочет 300 крышек — но он жаден, а не глуп. Можно и поторговаться.',
        options: [{ text: 'Жди.', next: null }],
      },
      free: {
        text: 'Спасибо, дружище! Так Арройо ищет ГЭКК… Ту флягу с цифрой «13» я выменял давно. Но я знаю место, где помнят довоенные Убежища: ' +
          'Убежище-Сити, на северо-востоке. Если кто и знает, где искать ГЭКК, — так это они.',
        options: [
          {
            text: 'Спасибо, Вик. Встретимся в Убежище-Сити.',
            action: (g) => {
              g.flags.add('vicTalked');
              g.advanceQuest('geck', 3);
              g.discover('vaultcity');
              g.addXp(500);
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Береги себя в дороге. Я ещё немного побуду в Дэне, а потом — домой.',
        options: [{ text: 'Удачи, Вик.', next: null }],
      },
    },
  },

  becky: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Добро пожаловать в лучший бар Дэна. Ну, единственный. Выпивка, патроны, стимуляторы — плати крышками или хабаром.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('becky'), next: null },
          { text: 'Что слышно в городе?', next: 'rumors' },
          { text: 'Пока.', next: null },
        ],
      },
      rumors: {
        text: 'Мецгер держит в клетке старика-торговца. А в южном переулке засели бандиты — режут всех, кто сунется. Если перебьёшь их, весь Дэн скажет спасибо.',
        options: [{ text: 'Учту.', next: 'hello' }],
      },
    },
  },

  denFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Есть пара крышек? Нет? Тогда отвали.',
          'Не ходи в южный переулок. Там ребята со стволами, и они не любят гостей.',
          'Мецгер скупает всех, кто не может за себя постоять. Смотри в оба.',
          'Бекки разливает лучшую бормотуху в Дэне. Ну, единственную.',
          'Видел старика в клетке? Бедолага. Мецгер с него шкуру спустит.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  ...CH2_DIALOGUES,
  ...CH3_DIALOGUES,

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

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

function freeVic(g: Game) {
  g.flags.add('vicFree');
  g.advanceQuest('geck', 2);
  const vic = g.actors.find((a) => a.id === 'vic');
  if (vic) {
    vic.place(CAGE.x + 3, CAGE.z + 3);
    vic.wanderRadius = 3;
  }
}

export function resolveText(t: Text, g: Game): string {
  return typeof t === 'function' ? t(g) : t;
}
