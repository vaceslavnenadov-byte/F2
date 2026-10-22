import type { DialogueDef, DialogueOption } from './dialogues';
import type { Game } from './game';

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Команды спутнику: ждать здесь или снова идти следом. */
export function partyOptions(): DialogueOption[] {
  return [
    {
      text: 'Жди здесь.',
      cond: (g) => !!g.talkingTo && g.isInParty(g.talkingTo),
      action: (g) => {
        g.companionWait(g.talkingTo!);
        g.closeDialogue();
      },
      next: null,
    },
    {
      text: 'Идём со мной.',
      cond: (g) => !!g.talkingTo && g.isWaiting(g.talkingTo.id),
      action: (g) => {
        g.companionFollow(g.talkingTo!);
        g.closeDialogue();
      },
      next: null,
    },
  ];
}

const bout = (g: Game) => [0, 1, 2].find((i) => !g.flags.has(`boutWon${i}`));
const PRIZES = [100, 200, 400];

export const CH4_DIALOGUES: Record<string, DialogueDef> = {
  // ─── Нью-Рино ─────────────────────────────────────────────────────────────
  cassidy: {
    start: (g) => (g.isJoined('cassidy') ? 'party' : 'hello'),
    nodes: {
      hello: {
        text: 'Кэссиди. Был караванщиком, пока сердце не начало шалить. Теперь пью и жду, когда кто-нибудь предложит работу поинтереснее.',
        options: [
          {
            text: 'Пойдёшь со мной? Впереди долгая дорога и много стрельбы.',
            check: '[Красноречие 50]',
            cond: (g) => g.char.skill('speech') >= 50,
            action: (g) => g.recruit('cassidy'),
            next: 'joined',
          },
          {
            text: 'Я оплачу твой счёт в баре (150 крышек), если пойдёшь со мной.',
            cond: (g) => g.inv.count('caps') >= 150,
            action: (g) => {
              g.takeItem('caps', 150);
              g.recruit('cassidy');
            },
            next: 'joined',
          },
          { text: 'Удачи, старик.', next: null },
        ],
      },
      joined: {
        text: 'Ха! А я уж думал, помру в этом баре. Дробовик при мне. Веди.',
        options: [{ text: 'Идём.', next: null }],
      },
      party: {
        text: 'Дробовик заряжен, сердце пока стучит. Что дальше, командир?',
        options: [...partyOptions(), { text: 'Ничего, идём.', next: null }],
      },
    },
  },

  croupier: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Добро пожаловать в «Десятку»! Кости, ставки, удача. Бросаем по паре: у кого больше — тот и забирает банк.',
        options: [
          { text: 'Ставлю 10 крышек.', cond: (g) => g.inv.count('caps') >= 10, action: (g) => g.gamble(10), next: 'result' },
          { text: 'Ставлю 50 крышек.', cond: (g) => g.inv.count('caps') >= 50, action: (g) => g.gamble(50), next: 'result' },
          { text: 'Ставлю 200 крышек.', cond: (g) => g.inv.count('caps') >= 200, action: (g) => g.gamble(200), next: 'result' },
          { text: 'Не сегодня.', next: null },
        ],
      },
      result: {
        text: (g) => g.lastGamble,
        options: [
          { text: 'Ещё раз.', next: 'hello' },
          { text: 'Хватит.', next: null },
        ],
      },
    },
  },

  promoter: {
    start: (g) => (g.flags.has('boutPrizeDue') ? 'prize' : bout(g) === undefined ? 'champ' : 'hello'),
    nodes: {
      hello: {
        text: (g) => `Бык Томми, хозяин ринга. Хочешь подраться? Правила простые: без оружия, только кулаки. Следующий соперник — ${['Малыш Джо', 'Железный Сэм', 'Чемпион Кид Кобра'][bout(g)!]}. Приз — ${PRIZES[bout(g)!]} крышек.`,
        options: [
          {
            text: 'Я готов. Начинаем!',
            cond: (g) => g.inv.weapon.skill === 'unarmed',
            action: (g) => g.startBout(),
            next: null,
          },
          { text: 'Сначала уберу оружие.', cond: (g) => g.inv.weapon.skill !== 'unarmed', next: null },
          { text: 'В другой раз.', next: null },
        ],
      },
      prize: {
        text: 'Вот это удар! Публика в восторге. Держи выигрыш.',
        options: [{ text: 'Спасибо.', action: (g) => g.collectBoutPrize(PRIZES), next: null }],
      },
      champ: {
        text: 'Ты теперь чемпион Нью-Рино! Никто больше не хочет выходить против тебя. Даже я.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  boxer: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick(['Выйдешь на ринг — пожалеешь.', 'Говори с Томми, если хочешь получить по морде.', '*Боксёр разминает кулаки и молча ухмыляется.*']),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  renoBar: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Бар «Подкова». Наливаем, продаём, не задаём вопросов. Старик Кэссиди опять сидит в долг.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('renoBar'), next: null },
          { text: 'Что слышно?', next: 'rumors' },
          { text: 'Пока.', next: null },
        ],
      },
      rumors: {
        text: 'Морелли и Карвер грызутся за город. Кто-то, говорят, ищет вора посмелее. А ещё к югу есть шахтёрский городок, Брокен-Хиллз, — там мутанты с людьми живут. Чудеса. Да, и механик Смитти в гараже на востоке ищет кого-то, кто сходит на старый армейский склад Сьерра. А в Реддинге, на западе, шахтёрам платят золотом — только в шахте у них завелась какая-то дрянь.',
        options: [
          {
            text: 'Интересно.',
            action: (g) => {
              g.discover('brokenhills');
              g.discover('redding');
            },
            next: 'hello',
          },
        ],
      },
    },
  },

  morelli: {
    start: (g) => {
      if (g.flags.has('sidedMorelli') && g.flags.has('nrWarWon') && !g.flags.has('nrWarPaid')) return 'warWon';
      if (g.flags.has('sidedMorelli')) return 'friend';
      if (g.flags.has('sidedCarver')) return 'enemy';
      if (g.inv.count('ledger')) return 'ledger';
      return g.quests.families ? 'waiting' : 'hello';
    },
    nodes: {
      hello: {
        text: 'Луиджи Морелли. Мой город, мои правила. Ты выглядишь как человек, который умеет лазить по чужим дворам. ' +
          'У Джека Карвера во дворе сейф, а в сейфе — его бухгалтерия. Принеси её мне, и 400 крышек твои. Охрана, понятно, не обрадуется.',
        options: [
          { text: 'Я достану книгу.', action: (g) => g.startQuest('families'), next: null },
          { text: 'Не интересует.', next: null },
        ],
      },
      waiting: {
        text: 'Книга Карвера. Сейф во дворе его дома, на востоке. Не попадись.',
        options: [{ text: 'Помню.', next: null }],
      },
      ledger: {
        text: 'Это она? Дай-ка… О, Джек, Джек. Теперь ты мой. Держи крышки — заслужил.',
        options: [
          {
            text: 'Приятно иметь дело.',
            action: (g) => {
              g.takeItem('ledger');
              g.flags.add('sidedMorelli');
              g.addKarma(-30);
              g.giveItem('caps', 400);
              g.addXp(500);
              g.quests.families.state = 'rewarded';
              g.makeHostile('carver');
            },
            next: null,
          },
        ],
      },
      friend: {
        text: (g) => (g.flags.has('nrWar') && !g.flags.has('nrWarWon')
          ? 'Карвер ещё дышит? Мои ребята с тобой — заканчивай дело.'
          : 'Друг семьи Морелли всегда желанный гость в Нью-Рино.'),
        options: [
          { text: 'Карвер не успокоится. Давай закончим это.', cond: (g) => !g.flags.has('nrWar'), next: 'war' },
          { text: '[Уйти]', next: null },
        ],
      },
      war: {
        text: 'Наконец-то разговор по делу. Бери моих парней, иди на восток и вынеси Джека Карвера. Голова Карвера — 600 крышек и мой личный пистолет.',
        options: [
          { text: 'Выдвигаемся.', action: (g) => g.startFamilyWar('morelli'), next: null },
          { text: 'Не сейчас.', next: null },
        ],
      },
      warWon: {
        text: 'Карвер мёртв! Нью-Рино — наш. Держи, что обещал. И знай: в этом городе для тебя всегда найдётся стол и стакан.',
        options: [
          {
            text: 'Приятно иметь дело.',
            action: (g) => {
              g.flags.add('nrWarPaid');
              g.giveItem('caps', 600);
              g.giveItem('pistol10', 1);
              g.addXp(800);
              g.addKarma(-20);
            },
            next: null,
          },
        ],
      },
      enemy: {
        text: 'Предатель!',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  carver: {
    start: (g) => {
      if (g.flags.has('sidedCarver') && g.flags.has('nrWarWon') && !g.flags.has('nrWarPaid')) return 'warWon';
      if (g.flags.has('sidedCarver')) return 'friend';
      if (g.inv.count('ledger')) return 'ledger';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'Джек Карвер. Если тебя прислал Морелли — проваливай. Если нет — тоже проваливай, но вежливее.',
        options: [{ text: '[Уйти]', next: null }],
      },
      ledger: {
        text: '*Карвер замечает книгу у тебя в руках.* Это моё. Морелли нанял тебя, да? Верни книгу — и получишь 250 крышек. И мою благодарность. А моя благодарность в этом городе стоит дорого.',
        options: [
          {
            text: 'Забирай. Морелли перебьётся.',
            action: (g) => {
              g.takeItem('ledger');
              g.flags.add('sidedCarver');
              g.giveItem('caps', 250);
              g.addXp(400);
              if (g.quests.families) g.quests.families.state = 'rewarded';
              g.makeHostile('morelli');
            },
            next: 'friend',
          },
          { text: 'Нет, у меня другие планы.', next: null },
        ],
      },
      friend: {
        text: (g) => (g.flags.has('nrWar') && !g.flags.has('nrWarWon')
          ? 'Морелли всё ещё жив. Мои люди с тобой — не тяни.'
          : 'Семья Карвер не забывает услуг. Заходи, если будут проблемы.'),
        options: [
          { text: 'Морелли отомстит. Ударим первыми?', cond: (g) => !g.flags.has('nrWar'), next: 'war' },
          { text: '[Уйти]', next: null },
        ],
      },
      war: {
        text: 'Ударить первыми… Мне нравится. Мои ребята пойдут с тобой. Луиджи сидит в своём особняке на западе. Принесёшь его перстень — 600 крышек и броня из моих запасов.',
        options: [
          { text: 'Выдвигаемся.', action: (g) => g.startFamilyWar('carver'), next: null },
          { text: 'Не сейчас.', next: null },
        ],
      },
      warWon: {
        text: 'Морелли больше нет. Теперь в Нью-Рино одна семья — и ты её друг. Держи награду.',
        options: [
          {
            text: 'Спасибо.',
            action: (g) => {
              g.flags.add('nrWarPaid');
              g.giveItem('caps', 600);
              g.giveItem('combatArmor', 1);
              g.addXp(800);
              g.addKarma(-20);
            },
            next: null,
          },
        ],
      },
    },
  },

  goon: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick(['Проходи, не задерживайся.', 'Босс занят.', 'Ты на чужой территории, приятель.']),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  renoFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'В «Десятке» сегодня везёт. Мне — нет.',
          'На ринге у Томми новый чемпион, Кид Кобра. Говорят, никто не держит его удар.',
          'Морелли и Карвер скоро начнут стрелять друг в друга. Держись подальше.',
          'Нью-Рино — город, где можно всё. Если есть крышки.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  smitty: {
    start: (g) => (g.flags.has('carOwned') ? 'owner' : g.inv.count('injector') ? 'injector' : g.quests.car ? 'waiting' : 'hello'),
    nodes: {
      hello: {
        text: 'Смитти, механик. Видишь эту красавицу? «Хайвеймен», довоенная тачка на микроядерном ходу. Всё цело, кроме топливного инжектора — сгорел. ' +
          'Новый можно найти только на армейском складе Сьерра, в горах к северо-западу. Там роботы до сих пор стерегут добро. Принесёшь инжектор — машина твоя.',
        options: [
          {
            text: 'Я достану инжектор.',
            action: (g) => {
              g.startQuest('car');
              g.discover('sierra');
            },
            next: null,
          },
          { text: 'Расскажи про склад.', next: 'sierra' },
          { text: 'Пока.', next: null },
        ],
      },
      sierra: {
        text: 'Склад Сьерра. Охранные роботы, турели, гермодверь арсенала без питания. Терминал охраны в командном бункере отключит железяк — если смыслишь в компьютерах. А генератор чинится руками или батареями.',
        options: [{ text: 'Понял.', action: (g) => g.discover('sierra'), next: 'hello' }],
      },
      waiting: {
        text: 'Инжектор ищи на складе Сьерра. Без него машина — просто груда металла.',
        options: [{ text: 'Иду.', next: null }],
      },
      injector: {
        text: 'Это он! Армейская упаковка, даже смазка не высохла. Поставлю за 150 крышек — или ставь сам, если руки откуда надо растут.',
        options: [
          {
            text: 'Ставь. [150 крышек]',
            cond: (g) => g.inv.count('caps') >= 150,
            action: (g) => {
              g.takeItem('caps', 150);
              g.closeDialogue();
              g.fixCar(true);
            },
            next: null,
          },
          { text: 'Сам справлюсь.', next: null },
        ],
      },
      owner: {
        text: 'Как ездит красавица? Батареи заливай вовремя — одна батарея даёт пятую часть заряда. Если надо, заряжу сам.',
        options: [
          { text: 'Заряди машину. [1 батарея]', cond: (g) => g.inv.count('microcell') > 0 && g.carFuel < 100, action: (g) => g.refuelCar(), next: 'owner' },
          { text: 'Пока.', next: null },
        ],
      },
    },
  },

  // ─── Брокен-Хиллз ─────────────────────────────────────────────────────────
  marcus: {
    start: (g) => {
      if (g.isJoined('marcus')) return 'party';
      if (g.quests.scorpions?.state === 'done') return 'thanks';
      if (g.quests.scorpions) return 'waiting';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'Не пугайся. Я Маркус, шериф. Да, мутант. Да, шериф. В Брокен-Хиллз все живут вместе — люди, гули, мутанты. ' +
          'А вот радскорпионы в шахте с нами жить не хотят. Шахтёры не могут работать. Поможешь?',
        options: [
          { text: 'Я зачищу шахту.', action: (g) => g.startQuest('scorpions'), next: null },
          { text: 'Мутант-шериф? Как так вышло?', next: 'story' },
          { text: 'Не сейчас.', next: null },
        ],
      },
      story: {
        text: 'Когда-то я служил в армии Мастера. Потом армия кончилась, а я — нет. Решил, что лучше строить, чем ломать. Город — моя идея.',
        options: [{ text: 'Достойно.', next: 'hello' }],
      },
      waiting: {
        text: 'Радскорпионы всё ещё у входа в шахту, на северо-востоке. Бей в голову — панцирь крепкий.',
        options: [{ text: 'Уже иду.', next: null }],
      },
      thanks: {
        text: 'Шахта чиста! Шахтёры вернулись. Знаешь… мне тут спокойно, но скучно. Возьмёшь с собой? Пулемёт у меня тяжёлый, но и я не лёгкий.',
        options: [
          {
            text: 'Добро пожаловать в отряд, Маркус.',
            action: (g) => {
              g.addKarma(40);
              g.quests.scorpions.state = 'rewarded';
              g.giveItem('caps', 200);
              g.addXp(500);
              g.recruit('marcus');
            },
            next: null,
          },
          {
            text: 'Город без шерифа пропадёт. Оставайся.',
            action: (g) => {
              g.addKarma(40);
              g.quests.scorpions.state = 'rewarded';
              g.giveItem('caps', 200);
              g.addXp(500);
            },
            next: null,
          },
        ],
      },
      party: {
        text: 'Маркус готов. Говори, куда.',
        options: [...partyOptions(), { text: 'Идём дальше.', next: null }],
      },
    },
  },

  mayorZeyna: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Мэр Зейна. Брокен-Хиллз живёт рудой. Пока шахта стоит, город голодает. Маркус всё тебе расскажет.',
        options: [{ text: 'Понятно.', next: null }],
      },
    },
  },

  betty: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Лавка Бетти. Дробь, лекарства, антирадин — шахтёрам без него никак.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('betty'), next: null },
          { text: 'Пока.', next: null },
        ],
      },
    },
  },

  hillsFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Мутант, гуль, человек — какая разница, если кирка в руках?',
          'Маркус — лучший шериф на всей пустоши. Честное слово.',
          'В шахте радскорпионы. Без Рад-Х туда не суйся.',
          'Раньше нас называли уродами. Теперь — соседями.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },
};
