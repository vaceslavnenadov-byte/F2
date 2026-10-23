import type { DialogueDef } from './dialogues';

function pick(lines: string[]) {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Глава V: Модок и Ферма призраков. */
export const CH5_DIALOGUES: Record<string, DialogueDef> = {
  modocJo: {
    start: (g) => {
      const q = g.quests.ghostfarm;
      if (!q) return 'hello';
      if (q.state === 'rewarded') return 'after';
      return q.progress >= 2 ? 'report' : 'waiting';
    },
    nodes: {
      hello: {
        text: 'Джо, мэр Модока. Городок у нас тихий: брамины, кожи, кукуруза. Только вот на старой ферме к востоку творится чертовщина. ' +
          'Люди слышат голоса из-под земли, видят тени по ночам. А неделю назад туда ушёл Карл, сын Фаррела, — и не вернулся. Говорят, призраки забрали.',
        options: [
          { text: 'Я схожу на ферму и всё выясню.', action: (g) => g.startQuest('ghostfarm'), next: 'deal' },
          { text: 'Призраков не бывает.', next: 'skeptic' },
          { text: 'Пока.', next: null },
        ],
      },
      skeptic: {
        text: 'Вот и я так думал, пока сам не услышал, как там кто-то скребётся под досками. Сходишь — заплачу 300 крышек.',
        options: [
          { text: 'Ладно, схожу.', action: (g) => g.startQuest('ghostfarm'), next: 'deal' },
          { text: 'Без меня.', next: null },
        ],
      },
      deal: {
        text: 'Ферма к востоку, за мёртвыми полями. Ищи заколоченный люк у пугал — оттуда и идут голоса.',
        options: [{ text: 'Понял.', next: null }],
      },
      waiting: {
        text: 'Ну что там, на ферме? Карла нашёл?',
        options: [{ text: 'Пока нет.', next: null }],
      },
      report: {
        text: (g) => (g.flags.has('slagsPeace')
          ? 'Слаги? Люди, которые живут под землёй с самой войны? И они хотят торговать с нами — еда за их инструменты… Карл жив и женится? Святые брамины. Ты принёс Модоку не беду, а соседей.'
          : 'Ты перебил их всех? Карл вернулся, только молчит и смотрит в стену. Что ж… угроза устранена. Уговор есть уговор.'),
        options: [
          {
            text: 'Забираю награду.',
            action: (g) => {
              const peace = g.flags.has('slagsPeace');
              g.giveItem('caps', 300);
              g.addXp(peace ? 800 : 500);
              g.addKarma(peace ? 25 : -10);
              if (peace) g.flags.add('modocPeace');
              g.quests.ghostfarm.state = 'rewarded';
            },
            next: null,
          },
        ],
      },
      after: {
        text: (g) => (g.flags.has('modocPeace') ? 'Слаги принесли первые ножи и лопаты. Лучшие во всей округе. Спасибо тебе.' : 'Модок снова спит спокойно. Почти.'),
        options: [{ text: 'Пока.', next: null }],
      },
    },
  },

  balthas: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Балтас. Лучшие кожи на севере — брамин, геккон, собака. Куртки, броня, ремни. Чего изволишь?',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('balthas'), next: null },
          { text: 'Что за ферма на востоке?', next: 'farm' },
          { text: 'Пока.', next: null },
        ],
      },
      farm: {
        text: 'Ферма Призраков. Хозяева пропали лет двадцать назад, с тех пор там никто не пашет. Ночью над полями туман, и в нём… тени. Я туда ни ногой.',
        options: [{ text: 'Ясно.', next: 'hello' }],
      },
    },
  },

  grisham: {
    start: (g) => {
      const q = g.quests.dogs;
      if (!q) return 'hello';
      if (q.state === 'done') return 'done';
      return q.state === 'rewarded' ? 'after' : 'waiting';
    },
    nodes: {
      hello: {
        text: 'Гришэм, держу браминов. Повадилась стая диких собак: уже двух телят зарезали. Сидят у северных полей, на холме. Перебьёшь — заплачу 150 крышек и накормлю до отвала.',
        options: [
          { text: 'Займусь собаками.', action: (g) => g.startQuest('dogs'), next: null },
          { text: 'Не сейчас.', next: null },
        ],
      },
      waiting: {
        text: 'Собаки всё там же, к северо-западу от полей. Стая из четырёх.',
        options: [{ text: 'Иду.', next: null }],
      },
      done: {
        text: 'Всех? Вот это дело! Держи крышки. И жаркое из брамина — сам коптил.',
        options: [
          {
            text: 'Спасибо.',
            action: (g) => {
              g.giveItem('caps', 150);
              g.giveItem('jerky', 2);
              g.addXp(300);
              g.addKarma(5);
              g.quests.dogs.state = 'rewarded';
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Брамины спят спокойно. Заходи ещё.',
        options: [{ text: 'Пока.', next: null }],
      },
    },
  },

  farrel: {
    start: (g) => (g.flags.has('karlHome') ? 'home' : g.flags.has('slagsPeace') ? 'peace' : 'hello'),
    nodes: {
      hello: {
        text: 'Мой Карл… ушёл на ферму призраков и пропал. Найди его, прошу. Живого или… просто найди.',
        options: [{ text: 'Я поищу.', action: (g) => g.startQuest('ghostfarm'), next: null }],
      },
      peace: {
        text: (g) => (g.flags.has('farrelPaid')
          ? 'Женится, подумать только. На подземной девчонке. Ну и пусть — главное, живой.'
          : 'Карл жив?! Живёт с теми, подземными… и счастлив? Господи. Вот, возьми — всё, что скопил. Спасибо тебе.'),
        options: [
          {
            text: 'Он в порядке.',
            action: (g) => {
              if (g.flags.has('farrelPaid')) return;
              g.flags.add('farrelPaid');
              g.giveItem('caps', 100);
              g.addKarma(5);
            },
            next: null,
          },
        ],
      },
      home: {
        text: 'Сын дома. Не говорит, что там было. Может, оно и к лучшему.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  karl: {
    start: (g) => (g.flags.has('karlHome') ? 'home' : 'peace'),
    nodes: {
      peace: {
        text: 'Я Карл. Да, я сам сюда пришёл. Ребекка… она из слагов. Мы поженимся. Скажи отцу, что я жив и счастлив — и что буду заходить.',
        options: [{ text: 'Передам.', next: null }],
      },
      home: {
        text: '*Карл не поднимает глаз.* Ты убил их. Ребекку тоже. Уходи.',
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  modocFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: () => pick([
          'Кукуруза в этом году уродилась. Если собаки не сожрут браминов, перезимуем.',
          'Ночью от фермы призраков тянет холодом. Не ходи туда.',
          'Балтас шьёт лучшие куртки отсюда до Кламата.',
          'Мэр Джо добрый, но слишком много говорит.',
        ]),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  hen: {
    start: (g) => (g.flags.has('slagsPeace') ? 'friend' : 'hello'),
    nodes: {
      hello: {
        text: 'Стой, верхний! Мы — слаги. Наши деды спрятались в туннелях, когда упали бомбы, и так и остались под землёй. Наверху нас зовут призраками. Нам это на руку: меньше гостей.',
        options: [
          { text: 'Где Карл, сын Фаррела?', next: 'karl' },
          { text: 'Как вы живёте под землёй?', next: 'life' },
          { text: 'Я ухожу.', next: null },
        ],
      },
      life: {
        text: 'Грибы, вода из глубоких колодцев, железо из старых труб. Мы куём лучшие инструменты в округе. Вот только еды мало. С поверхности её не возьмёшь — верхние стреляют в «призраков».',
        options: [{ text: 'Понятно.', next: 'hello' }],
      },
      karl: {
        text: 'Карл пришёл сам. Он и наша Ребекка встречались у колодца год, тайком. Теперь он хочет остаться внизу. Мы его не держим — но и не отдадим силой.',
        options: [
          {
            text: 'Модоку нужны ваши инструменты, вам — их еда. Давайте договоримся о торговле, а Карл пусть навещает отца.',
            check: '[Красноречие 50]',
            cond: (g) => g.char.skill('speech') >= 50,
            next: 'peace',
          },
          {
            text: 'Я принёс от Модока мир. Вот подарок — 5 вяленых мяс в знак дружбы.',
            cond: (g) => g.inv.count('jerky') >= 5,
            action: (g) => g.takeItem('jerky', 5),
            next: 'peace',
          },
          { text: 'Отпустите его. Или я перережу вас всех.', action: (g) => g.slagsWar(), next: null },
          { text: 'Мне нужно подумать.', next: null },
        ],
      },
      peace: {
        text: 'Торговать с верхними? Мы мечтали об этом три поколения, но боялись их ружей. Если Джо даст слово — слаги дадут своё. Скажи ему. И… спасибо, верхний.',
        options: [{ text: 'Скажу.', action: (g) => g.makeSlagPeace(), next: null }],
      },
      friend: {
        text: 'Друг слагов всегда может спуститься к нашему огню. Как там наверху?',
        options: [{ text: 'Всё хорошо. Пока.', next: null }],
      },
    },
  },

  // ─── Реддинг ──────────────────────────────────────────────────────────────
  dutton: {
    start: (g) => {
      const q = g.quests.wanamingo;
      if (!q) return 'hello';
      if (q.state === 'rewarded') return 'after';
      return q.progress >= 1 ? 'report' : 'waiting';
    },
    nodes: {
      hello: {
        text: 'Даттон, мэр Реддинга. Город живёт золотом, а золото — в шахте Кокавиф. Месяц назад шахтёры пробили стену в старую пещеру, и оттуда полезли ванаминго. ' +
          'Твари с косами вместо рук, шкура как у слизня. Семеро погибли. Шахту заколотили, а без неё Реддинг сдохнет к зиме. Убей их королеву — и тысяча крышек твоя.',
        options: [
          { text: 'Я спущусь в шахту.', action: (g) => g.startQuest('wanamingo'), next: 'go' },
          { text: 'Тысяча крышек за смерть? Подумаю.', next: null },
        ],
      },
      go: {
        text: 'Вход под копром на севере. Гнездо где-то в дальней пещере, на востоке. Если увидишь кладку — сожги, приплачу ещё двести.',
        options: [{ text: 'Понял.', next: null }],
      },
      waiting: {
        text: 'Королева ещё жива? Шахтёры сидят без работы, а в «Маламуте» уже пьют в долг.',
        options: [{ text: 'Работаю над этим.', next: null }],
      },
      report: {
        text: (g) => 'Королева мертва? Ты спустился туда и вернулся? Реддинг у тебя в долгу. ' + (g.flags.has('eggsDestroyed') ? 'И кладку уничтожил — значит, они не вернутся. Держи всё, что обещал.' : 'Жаль, кладка осталась… но и так — огромное дело.'),
        options: [
          {
            text: 'Забираю награду.',
            action: (g) => {
              g.giveItem('caps', g.flags.has('eggsDestroyed') ? 1200 : 1000);
              g.addXp(1500);
              g.addKarma(15);
              g.quests.wanamingo.state = 'rewarded';
            },
            next: null,
          },
        ],
      },
      after: {
        text: 'Шахта снова работает. Если надумаешь осесть — для героя Реддинга всегда найдётся дом.',
        options: [{ text: 'Пока.', next: null }],
      },
    },
  },

  marge: {
    start: () => 'hello',
    nodes: {
      hello: {
        text: 'Марж Лабарж, хозяйка «Маламута». Виски, пиво, патроны — и никаких драк в зале. Ну, почти никаких.',
        options: [
          { text: 'Покажи товар.', action: (g) => g.openTrade('marge'), next: null },
          { text: 'Что слышно?', next: 'rumors' },
          { text: 'Пока.', next: null },
        ],
      },
      rumors: {
        text: 'Шахтёры только и говорят, что о тварях в Кокавифе. Даттон обещает тысячу за королеву — и никто не идёт. А доктор Джонсон всё ищет кусок ванаминго для опытов. Чокнутый.',
        options: [{ text: 'Интересно.', next: 'hello' }],
      },
    },
  },

  docJohnson: {
    start: (g) => {
      const q = g.quests.sample;
      if (q && q.state !== 'rewarded' && g.inv.count('wanaSample')) return 'sample';
      return 'hello';
    },
    nodes: {
      hello: {
        text: (g) => 'Доктор Джонсон. Лечу шахтёров от того, от чего их можно вылечить. ' + (g.quests.sample?.state === 'rewarded' ? 'Сыворотка из твоего образца уже спасла двоих.' : 'Слизь ванаминго разъедает раны — мне нужен образец ткани, чтобы сделать сыворотку. Принесёшь — заплачу.'),
        options: [
          { text: 'Я достану образец.', cond: (g) => !g.quests.sample, action: (g) => g.startQuest('sample'), next: null },
          {
            text: 'Подлечите меня (50 крышек).',
            cond: (g) => g.inv.count('caps') >= 50 && g.needsDoctor,
            action: (g) => g.doctorHeal(50),
            next: null,
          },
          { text: 'Пока.', next: null },
        ],
      },
      sample: {
        text: 'Это он! Ткань ещё живая… Отлично. Держи крышки и стимуляторы — первые порции сыворотки пойдут шахтёрам.',
        options: [
          {
            text: 'Рад помочь.',
            action: (g) => {
              g.takeItem('wanaSample');
              g.giveItem('caps', 200);
              g.giveItem('stimpak', 3);
              g.addXp(400);
              g.addKarma(5);
              g.quests.sample.state = 'rewarded';
            },
            next: null,
          },
        ],
      },
    },
  },

  reddingFolk: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: (g) => (g.quests.wanamingo?.state === 'rewarded'
          ? pick(['Снова в забое! Спасибо тебе, приятель.', 'Говорят, это ты прикончил королеву. Выпивка в «Маламуте» за мой счёт.', 'Золото пошло. Реддинг будет жить.'])
          : pick(['Я слышал, как они скребутся за досками. Каждую ночь.', 'Без шахты нам конец. Кто-то должен туда спуститься.', 'Видел ванаминго? Нет? Твоё счастье.', 'Марж наливает в долг — пока.'])),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },

  slag: {
    start: () => 'talk',
    nodes: {
      talk: {
        text: (g) => (g.flags.has('slagsPeace')
          ? pick(['Солнце жжёт глаза, но к нему можно привыкнуть.', 'Скоро свадьба Карла и Ребекки! Приходи.', 'Мы куём ножи. Верхним понравится.'])
          : pick(['*Слаг щурится и отступает в тень.*', 'Говори с Хеном, верхний.', 'Не стреляй. Мы не призраки.'])),
        options: [{ text: '[Уйти]', next: null }],
      },
    },
  },
};
