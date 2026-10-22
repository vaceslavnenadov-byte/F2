import * as THREE from 'three';
import { clamp, randInt } from '../core/math';
import { tickTimers } from '../core/clock';
import { Renderer } from '../engine/renderer';
import { Effects } from '../engine/effects';
import { audio } from '../engine/audio';
import { World, type Interactable } from '../world/world';
import type { Cell } from '../world/nav';
import { heightAt } from '../world/terrain';
import { LOCATIONS, WORLD_MAP } from '../world/locations';
import { ARROYO, NAGOR_HOME } from '../world/locations/arroyo';
import { makeEncounter, ENCOUNTER_NAMES, type EncounterKind } from '../world/locations/encounter';
import type { LocationDef } from '../world/locations/types';
import { Actor } from '../entities/actor';
import { HumanoidRig, LizardRig, QuadrupedRig } from '../entities/rigs';
import { Character, PERKS, type PerkId, type SkillId } from './character';
import { Inventory, ITEMS, TRADERS, priceMult, itemPrice } from './items';
import { Combat, BODY_PARTS, AIM_AP, type BodyPart } from './combat';
import { DIALOGUES, resolveText, type DialogueDef, type DialogueOption } from './dialogues';
import { QUESTS, QUEST_GOALS, type QuestState } from './quests';
import { dog as makeDog, sulik as makeSulik, cassidy as makeCassidy, marcus as makeMarcus, colonel } from './bestiary';
import { OIL_RIG, RIG_DOCK, RIG_SOLDIERS } from '../world/locations/oilrig';
import { highwayman } from '../world/props';
import { SIERRA_GUARDS } from '../world/locations/sierra';
import { NAVARRO_SOLDIERS } from '../world/locations/navarro';
import { MORELLI_IDS, CARVER_IDS } from '../world/locations/newreno';
import { UI } from '../ui/ui';
import { LOCATION_BARKS, COMPANION_BANTER } from './barks';
import { loadSettings, saveSettings, type Settings } from './settings';
import { TIPS, tipShown, markTip } from './tips';
import { showWorldMap } from '../ui/worldmap';

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const PLAYER_LOOK = { skin: '#c48a60', cloth: '#6e5038', hair: '#3a2516', build: 1.05 };

type Mode = 'menu' | 'explore' | 'combat' | 'dialogue' | 'dead' | 'map' | 'pause';

const SAVE_KEY = 'wasteland2241.save';
const LOAD_FLAG = 'wasteland2241.loadOnStart';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

interface Hover {
  actor?: Actor;
  inter?: Interactable;
  cell?: Cell;
}

interface SaveData {
  v: 2;
  meta: { name: string; level: number; place: string; date: string; savedAt: number };
  char: ReturnType<Character['toJSON']>;
  inv: ReturnType<Inventory['toJSON']>;
  loc: { id: string; kind?: EncounterKind; seed?: number };
  pos: [number, number];
  quests: Record<string, QuestState>;
  flags: string[];
  locState: Record<string, { dead: string[] }>;
  discovered: string[];
  worldPos: { x: number; y: number };
  days: number;
  kills: number;
  questKills: Record<string, number>;
  traders: Record<string, Record<string, number>>;
  karma?: number;
  carFuel?: number;
  trunk?: Record<string, number>;
}

export class Game {
  readonly r: Renderer;
  readonly ui: UI;
  readonly effects: Effects;
  world!: World;
  location!: LocationDef;
  private encounterInfo: { kind: EncounterKind; seed: number } | null = null;

  char = new Character();
  inv = new Inventory();
  quests: Record<string, QuestState> = {};
  flags = new Set<string>();
  /** Состояние локаций между визитами: кто уже убит. */
  locState: Record<string, { dead: string[] }> = {};
  discovered = new Set<string>(['arroyo', 'klamath']);
  worldPos: { x: number; y: number } = { x: WORLD_MAP.arroyo.x, y: WORLD_MAP.arroyo.y };
  days = 0;
  actors: Actor[] = [];
  readonly player: Actor;
  readonly dog: Actor;
  mode: Mode = 'menu';
  combat: Combat | null = null;
  time = 0;
  kills = 0;
  /** Убийства по меткам заданий (nest, rats). */
  questKills: Record<string, number> = {};
  helpHidden = false;
  /** Режим прицельной атаки: следующий клик по врагу открывает выбор части тела. */
  aimMode = false;
  /** Товары торговцев (меняются после сделок). */
  traders: Record<string, Record<string, number>> = {};

  private camYaw = 2.55;
  private camPitch = 0.92;
  private camDist = 19;
  private camCur = { dist: 40, pitch: 0.5 };
  private camTarget = new THREE.Vector3();
  private keys = new Set<string>();
  private mouse = new THREE.Vector2(-10, -10);
  private mouseClient = { x: 0, y: 0 };
  private overCanvas = false;
  private rotating = false;
  private downPos = { x: 0, y: 0 };
  private raycaster = new THREE.Raycaster();
  private hover: Hover = {};
  private hitProxies: THREE.Mesh[] = [];
  private pathMarkers: THREE.InstancedMesh;
  private hoverRing: THREE.Mesh;
  private moveMarker: THREE.Mesh;
  private moveMarkerT = 0;
  private dialogueActor: Actor | null = null;
  private dialogueDef: DialogueDef | null = null;
  private dialogueOptions: DialogueOption[] = [];
  private regenAcc = 0;
  private clickToken = 0;
  private previewKey = '';
  private previewCost = 0;
  private pendingAttack: Actor | null = null;
  private exitArmed = false;
  private lastTime = performance.now();

  constructor(container: HTMLElement) {
    this.r = new Renderer(container);
    this.effects = new Effects(this.r.scene);
    this.ui = new UI(this);

    const markerGeo = new THREE.CircleGeometry(0.2, 16).rotateX(-Math.PI / 2);
    this.pathMarkers = new THREE.InstancedMesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
      80,
    );
    for (let i = 0; i < 80; i++) this.pathMarkers.setColorAt(i, new THREE.Color(0x58f06a));
    this.pathMarkers.count = 0;
    this.pathMarkers.frustumCulled = false;
    this.pathMarkers.renderOrder = 5;
    this.r.scene.add(this.pathMarkers);

    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x58f06a, transparent: true, opacity: 0.9, depthWrite: false, fog: false }),
    );
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 5;
    this.r.scene.add(this.hoverRing);
    this.moveMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.4, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf3b347, transparent: true, depthWrite: false, fog: false }),
    );
    this.moveMarker.visible = false;
    this.r.scene.add(this.moveMarker);

    this.player = new Actor({
      id: 'player',
      name: 'Вы',
      faction: 'player',
      rig: new HumanoidRig(PLAYER_LOOK),
      hp: 30,
      ap: 8,
      ac: 5,
      speed: 4,
    });
    this.dog = makeDog();

    this.enterLocation(ARROYO, 'default');
    this.bindInput();
    this.applySettings();
    this.r.renderer.setAnimationLoop(() => this.frame());
  }

  get nav() { return this.world.nav; }

  // ─── Локации ───────────────────────────────────────────────────────────────

  private addActor(a: Actor, x: number, z: number, proxyR = 0.5) {
    a.place(x, z);
    a.heading = Math.random() * Math.PI * 2;
    this.r.scene.add(a.object);
    let proxy = a.object.children.find((c) => c.userData.actor === a) as THREE.Mesh | undefined;
    if (!proxy) {
      const h = Math.max(0.8, a.rig.height);
      proxy = new THREE.Mesh(new THREE.CylinderGeometry(proxyR, proxyR, h, 8));
      proxy.visible = false;
      proxy.position.y = h / 2;
      proxy.userData.actor = a;
      a.object.add(proxy);
    }
    this.hitProxies.push(proxy);
    this.actors.push(a);
    return a;
  }

  /** Добавляет актёра локации, если он не погиб в прошлый визит. */
  spawn(a: Actor, x: number, z: number, proxyR = 0.5) {
    if (this.locState[this.location.id]?.dead.includes(a.id)) return null;
    return this.addActor(a, x, z, proxyR);
  }

  isInParty(a: Actor) { return a.follow === this.player && !a.dead; }
  get party() { return this.actors.filter((a) => this.isInParty(a)); }

  enterLocation(def: LocationDef, entry: string, at?: [number, number]) {
    // Союзники на время войны семей остаются в Нью-Рино.
    const party = this.actors.filter((a) => this.isInParty(a) && a.tag !== 'warAlly');
    for (const a of this.actors) {
      a.stop();
      this.r.scene.remove(a.object);
      // Персистентные актёры (игрок, отряд, пёс) живут между локациями.
      if (a !== this.player && a !== this.dog && !party.includes(a) && ![...this.companionActors.values()].includes(a)) {
        a.object.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
        });
      }
    }
    if (this.world) {
      this.r.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.combat = null;
    this.pendingAttack = null;
    this.actors = [];
    this.hitProxies = [];
    this.location = def;
    if (def.id === 'arroyo' && this.flags.has('hasGeck') && !this.flags.has('arroyoRaided')) {
      this.flags.add('arroyoRaided');
      this.ui.banner('АРРОЙО В ОГНЕ', 3);
      this.ui.log('Деревня горит. Повсюду следы тяжёлых сапог… Найди выживших.', 'bad');
    }
    if (def.id === 'encounter') this.locState.encounter = { dead: [] };
    this.locState[def.id] ??= { dead: [] };
    this.world = new World(def, this.flags);
    this.r.scene.add(this.world.group);
    const water = this.world.water;
    if (water) {
      // Отражение рендерим без неба: его HDR-яркость пересвечивает зеркало до белого.
      const reflect = water.onBeforeRender.bind(water);
      water.onBeforeRender = (...args) => {
        const sky = this.r.sky;
        const was = sky.visible;
        sky.visible = false;
        reflect(...args);
        sky.visible = was;
      };
    }

    const [x, z] = at ?? def.entries[entry] ?? def.entries.default;
    this.addActor(this.player, x, z);
    party.forEach((a, i) => this.addActor(a, x + Math.cos(i * 2 + 1) * 1.8, z + Math.sin(i * 2 + 1) * 1.8));
    def.spawn(this);
    this.spawnWaitingCompanions(def.id);
    this.parkCar(def);
    this.camTarget.copy(this.player.pos);
    this.exitArmed = false;
  }

  discover(id: string) {
    if (this.discovered.has(id)) return;
    this.discovered.add(id);
    this.ui.log(`На карте отмечено: ${WORLD_MAP[id].label}.`, 'warn');
  }

  /** Игра начинается 25 июля 2241 года в 15:00; 1 секунда реального времени = 1 игровая минута. */
  dateText(days = this.days, withTime = false) {
    const d = new Date(Date.UTC(2241, 6, 25, 15) + days * 864e5);
    const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return withTime ? `${date}, ${this.clockText(days)}` : date;
  }

  clockText(days = this.days) {
    const d = new Date(Date.UTC(2241, 6, 25, 15) + days * 864e5);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  get hour() { return (((this.days * 24 + 15) % 24) + 24) % 24; }

  private openWorldMap() {
    this.tip('map');
    this.mode = 'map';
    this.ui.closePanel();
    this.ui.showHud(false);
    this.ui.tooltip(null);
    const here = WORLD_MAP[this.location.id] ? this.location.id : null;
    if (here) this.worldPos = { x: WORLD_MAP[here].x, y: WORLD_MAP[here].y };
    let encounterBudget = 0;
    showWorldMap(this.ui.screenEl, {
      pos: this.worldPos,
      days: this.days,
      discovered: [...this.discovered],
      here,
      onDiscover: (id) => this.discover(id),
      vehicle: this.flags.has('carOwned') ? { fuel: this.carFuel, onFuel: (f) => (this.carFuel = f) } : undefined,
      dateText: (d) => this.dateText(d, true),
      encounterCheck: (dist) => {
        encounterBudget += dist;
        // Примерно одна встреча на 25 единиц пути.
        if (encounterBudget > 4 && Math.random() < dist * 0.04) return true;
        return false;
      },
      onEnter: (id, pos, days) => {
        this.worldPos = pos;
        this.days = days;
        this.ui.hideScreen();
        this.encounterInfo = null;
        this.enterLocation(LOCATIONS[id], 'world');
        this.mode = 'explore';
        this.ui.showHud(true);
        this.ui.banner(LOCATIONS[id].name.toUpperCase(), 2);
        this.ui.log(`Вы прибыли: ${LOCATIONS[id].name}.`);
      },
      onEncounter: (pos, days) => {
        this.worldPos = pos;
        this.days = days;
        this.ui.hideScreen();
        const roll = Math.random();
        const kind: EncounterKind = roll < 0.35 ? 'geckos' : roll < 0.6 ? 'rats' : roll < 0.9 ? 'bandits' : 'quiet';
        this.encounterInfo = { kind, seed: Math.floor(Math.random() * 1e6) };
        this.enterLocation(makeEncounter(kind, this.encounterInfo.seed), 'world');
        this.mode = 'explore';
        this.ui.showHud(true);
        this.ui.banner('СЛУЧАЙНАЯ ВСТРЕЧА', 2);
        this.ui.log(`Случайная встреча: ${ENCOUNTER_NAMES[kind]}. Уйти можно через любой край карты.`, 'warn');
      },
    });
  }

  // ─── Начало игры, сохранение, загрузка ─────────────────────────────────────

  beginNewGame(c: Character) {
    this.char = c;
    this.inv = new Inventory();
    this.inv.add('spear');
    this.inv.add('powder', 2);
    this.inv.add('flint');
    this.inv.add('caps', 25);
    this.inv.equipped = 'spear';
    const [x, z] = ARROYO.entries.default;
    this.player.place(x, z);
    this.startPlaying();
    this.ui.log(`${c.name}, добро пожаловать в Арройо.`, 'good');
    this.ui.log('Поговори со Старейшиной у большой хижины на севере деревни.');
    this.ui.log('Южная тропа ведёт к выходу на карту мира.');
    this.tip('start');
    this.ui.banner('АРРОЙО', 2.5);
  }

  private startPlaying() {
    this.mode = 'explore';
    this.player.hp = this.char.hp;
    this.player.maxHp = this.char.maxHp;
    this.player.ap = this.player.maxAp = this.char.maxAp;
    this.updatePlayerLook();
    this.applyPerks();
    this.camTarget.copy(this.player.pos);
    this.ui.showHud(true);
    this.ui.updateHud();
  }

  /** Слоты сохранений: быстрый (F5/F9) и три ручных. */
  static readonly SLOTS = ['quick', '1', '2', '3'];

  private static slotKey(slot: string) { return `${SAVE_KEY}.${slot}`; }

  /** Краткая сводка слота для меню (или null, если пусто). */
  static slotInfo(slot: string): { name: string; level: number; place: string; date: string; savedAt: number } | null {
    try {
      const d = JSON.parse(localStorage.getItem(Game.slotKey(slot)) ?? 'null');
      return d?.v === 2 && d.meta ? d.meta : null;
    } catch {
      return null;
    }
  }

  canSave(): boolean {
    if (this.mode !== 'explore' && !(this.mode === 'pause' && this.pausedFrom === 'explore')) {
      this.ui.log('Сохраниться можно только вне боя и диалога.', 'warn');
      return false;
    }
    if (this.combat || this.countdown !== null) {
      this.ui.log(this.countdown !== null ? 'Не время сохраняться — реактор вот-вот рванёт!' : 'Сохраниться можно только вне боя.', 'bad');
      return false;
    }
    return true;
  }

  save(slot = 'quick'): boolean {
    if (!this.canSave()) return false;
    const data: SaveData = {
      v: 2,
      meta: { name: this.char.name, level: this.char.level, place: this.location.name, date: this.dateText(this.days, true), savedAt: Date.now() },
      char: this.char.toJSON(),
      inv: this.inv.toJSON(),
      loc: this.encounterInfo ? { id: 'encounter', ...this.encounterInfo } : { id: this.location.id },
      pos: [this.player.pos.x, this.player.pos.z],
      quests: this.quests,
      flags: [...this.flags],
      locState: this.locState,
      discovered: [...this.discovered],
      worldPos: this.worldPos,
      days: this.days,
      kills: this.kills,
      questKills: this.questKills,
      traders: this.traders,
      karma: this.karma,
      carFuel: this.carFuel,
      trunk: this.trunk,
    };
    try {
      localStorage.setItem(Game.slotKey(slot), JSON.stringify(data));
      this.ui.log(slot === 'quick' ? 'Быстрое сохранение.' : `Игра сохранена в слот ${slot}.`, 'good');
      return true;
    } catch {
      this.ui.log('Не удалось сохранить игру.', 'bad');
      return false;
    }
  }

  static hasSave(): boolean {
    // Старое единственное сохранение переносим в быстрый слот.
    try {
      const legacy = localStorage.getItem(SAVE_KEY);
      if (legacy && !localStorage.getItem(Game.slotKey('quick'))) {
        const d = JSON.parse(legacy);
        d.meta ??= { name: d.char?.name ?? '—', level: d.char?.level ?? 1, place: '—', date: '—', savedAt: 0 };
        localStorage.setItem(Game.slotKey('quick'), JSON.stringify(d));
      }
    } catch {
      /* нет хранилища — нет и сохранений */
    }
    return Game.SLOTS.some((s) => Game.slotInfo(s));
  }

  /** Загрузка через перезапуск страницы — мир гарантированно возвращается в исходное состояние. */
  requestLoad(slot = 'quick') {
    if (!Game.slotInfo(slot)) {
      this.ui.log('В этом слоте нет сохранения.', 'warn');
      return;
    }
    try {
      sessionStorage.setItem(LOAD_FLAG, slot);
    } catch {
      /* без sessionStorage просто откроется меню */
    }
    location.reload();
  }

  /** Слот, который нужно загрузить после перезапуска (или null). */
  static consumeLoadFlag(): string | null {
    try {
      const v = sessionStorage.getItem(LOAD_FLAG);
      sessionStorage.removeItem(LOAD_FLAG);
      return v === '1' && !Game.slotInfo('1') ? 'quick' : v;
    } catch {
      return null;
    }
  }

  loadFromStorage(slot = 'quick'): boolean {
    let d: SaveData | null;
    try {
      d = JSON.parse(localStorage.getItem(Game.slotKey(slot)) ?? 'null');
    } catch {
      d = null;
    }
    if (!d || d.v !== 2) return false;
    this.char = Character.fromJSON(d.char);
    this.inv = Inventory.fromJSON(d.inv);
    this.quests = d.quests;
    this.flags = new Set(d.flags);
    this.locState = d.locState;
    this.discovered = new Set(d.discovered);
    this.worldPos = d.worldPos;
    this.days = d.days;
    this.kills = d.kills;
    this.questKills = d.questKills;
    this.traders = d.traders ?? {};
    this.karma = d.karma ?? 0;
    this.carFuel = d.carFuel ?? 0;
    this.trunk = d.trunk ?? {};
    // Восстанавливаем отряд до входа в локацию, чтобы он появился рядом с игроком.
    const restored: Actor[] = [];
    if (this.flags.has('dogFound') && this.quests.dog?.state !== 'rewarded' && !this.flags.has('dogDead')) restored.push(this.dog);
    for (const id of Object.keys(this.companionFactories)) {
      if (!this.isJoined(id) || this.flags.has(`${id}Dead`) || this.isWaiting(id)) continue;
      restored.push(this.companion(id));
    }
    for (const a of restored) this.joinParty(a);
    this.actors = [...new Set([...this.actors, ...restored])];
    if (d.loc.id === 'encounter' && d.loc.kind && d.loc.seed !== undefined) {
      this.encounterInfo = { kind: d.loc.kind, seed: d.loc.seed };
      this.enterLocation(makeEncounter(d.loc.kind, d.loc.seed), 'default', d.pos);
    } else {
      this.enterLocation(LOCATIONS[d.loc.id] ?? ARROYO, 'default', d.pos);
    }
    this.exitArmed = true;
    this.startPlaying();
    this.ui.log('Игра загружена.', 'good');
    return true;
  }

  private joinParty(a: Actor) {
    a.faction = 'companion';
    a.follow = this.player;
    a.wanderRadius = 0;
    if (a.rig instanceof QuadrupedRig) a.rig.wag = 1;
  }

  // ─── API для диалогов и интерфейса ─────────────────────────────────────────

  get isPlayerTurn() { return !!this.combat?.isPlayerTurn; }

  giveItem(id: string, n = 1) {
    this.inv.add(id, n);
    this.ui.log(`Получено: ${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}.`, 'good');
    this.ui.updateHud();
  }

  takeItem(id: string, n = 1): boolean {
    if (!this.inv.remove(id, n)) return false;
    this.ui.log(`Отдано: ${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}.`);
    this.ui.updateHud();
    return true;
  }

  addXp(n: number) {
    const levels = this.char.addXp(n);
    this.ui.log(`Получено опыта: ${n}.`, 'good');
    if (levels > 0) {
      this.player.hp = this.char.hp;
      this.player.maxHp = this.char.maxHp;
      this.ui.banner('НОВЫЙ УРОВЕНЬ!', 2.5);
      this.tip('levelup');
      audio.play('levelup');
      this.ui.log(`Уровень ${this.char.level}! Очки навыков: +${this.char.skillPointsPerLevel}. Распредели их в окне персонажа (C).`, 'warn');
      if (this.char.perkPoints > 0) this.ui.log('Доступна новая способность! Выбери её в окне персонажа (C).', 'warn');
      this.levelCompanions(levels);
      this.applyPerks();
    }
    this.ui.updateHud();
  }

  startQuest(id: string) {
    if (this.quests[id]) return;
    this.quests[id] = { state: 'active', progress: 0 };
    this.ui.log(`Новое задание: «${QUESTS[id].title}».`, 'warn');
    this.updateKillQuests();
    if (id === 'dog' && this.flags.has('dogFound')) this.quests.dog.state = 'done';
  }

  /** Переводит сюжетное задание на следующую стадию (не назад). */
  advanceQuest(id: string, stage: number) {
    this.startQuest(id);
    const q = this.quests[id];
    if (q.progress < stage) {
      q.progress = stage;
      this.ui.log(`Задание обновлено: «${QUESTS[id].title}».`, 'warn');
      audio.play('quest');
    }
  }

  private updateKillQuests() {
    for (const [id, goal] of Object.entries(QUEST_GOALS)) {
      const q = this.quests[id];
      if (!q || q.state !== 'active') continue;
      q.progress = Math.min(goal.count, this.questKills[goal.tag] ?? 0);
      if (q.progress >= goal.count) {
        q.state = 'done';
        this.ui.log(goal.doneText, 'warn');
        this.ui.banner('ЗАДАНИЕ ВЫПОЛНЕНО', 2);
        audio.play('quest');
      }
    }
  }

  completeDogQuest() {
    if (!this.quests.dog) this.quests.dog = { state: 'done', progress: 0 };
    this.quests.dog.state = 'rewarded';
    this.addKarma(30);
    this.giveItem('powder', 2);
    this.addXp(250);
    this.dog.follow = null;
    this.dog.faction = 'animal';
    this.dog.home.set(NAGOR_HOME.x - 1, heightAt(NAGOR_HOME.x - 1, NAGOR_HOME.z + 1), NAGOR_HOME.z + 1);
    this.dog.wanderRadius = 3;
    (this.dog.rig as QuadrupedRig).wag = 0.3;
  }

  recruitSulik() { this.recruit('sulik'); }

  // ─── Отряд ─────────────────────────────────────────────────────────────────

  /** Нанимаемые спутники: создаются один раз и живут между локациями. */
  private companionFactories: Record<string, () => Actor> = { sulik: makeSulik, cassidy: makeCassidy, marcus: makeMarcus };
  private companionActors = new Map<string, Actor>();

  private joinedFlag(id: string) { return id === 'sulik' ? 'sulikJoined' : `joined:${id}`; }
  isJoined(id: string) { return this.flags.has(this.joinedFlag(id)); }

  private companion(id: string): Actor {
    let a = this.companionActors.get(id);
    if (!a) {
      a = this.actors.find((x) => x.id === id) ?? this.companionFactories[id]();
      this.companionActors.set(id, a);
    }
    return a;
  }

  /** Нанять спутника, стоящего в текущей локации. */
  recruit(id: string) {
    const a = this.actors.find((x) => x.id === id);
    if (!a) return;
    this.companionActors.set(id, a);
    this.flags.add(this.joinedFlag(id));
    this.joinParty(a);
    this.ui.log(`${a.name}: присоединяется к отряду.`, 'good');
    this.ui.banner(`${a.name.toUpperCase()} В ОТРЯДЕ`, 2);
  }

  private clearWait(id: string) {
    for (const f of [...this.flags]) if (f.startsWith(`wait:${id}:`)) this.flags.delete(f);
  }

  /** Спутник остаётся в этой локации, пока за ним не вернутся. */
  companionWait(a: Actor) {
    this.clearWait(a.id);
    a.follow = null;
    a.stop();
    a.home.copy(a.pos);
    a.wanderRadius = 2;
    this.flags.add(`wait:${a.id}:${this.location.id}`);
    this.ui.log(`${a.name} ждёт здесь.`);
  }

  companionFollow(a: Actor) {
    this.clearWait(a.id);
    this.joinParty(a);
    this.ui.log(`${a.name} снова идёт с тобой.`);
  }

  isWaiting(id: string) { return [...this.flags].some((f) => f.startsWith(`wait:${id}:`)); }

  /** Спутники, оставленные ждать в этой локации. */
  private spawnWaitingCompanions(locId: string) {
    for (const f of this.flags) {
      const m = /^wait:(\w+):(\w+)$/.exec(f);
      if (!m || m[2] !== locId || this.flags.has(`${m[1]}Dead`)) continue;
      const a = this.companion(m[1]);
      if (this.actors.includes(a)) continue;
      a.faction = 'companion';
      a.follow = null;
      a.wanderRadius = 2;
      const [x, z] = this.location.entries.default;
      this.addActor(a, a.home.x || x + 2, a.home.z || z + 2);
      a.home.copy(a.pos);
    }
  }

  /** Метка «кто-то ушёл из локации навсегда» (освобождённый Вик). */
  removeFromLocation(id: string) {
    const a = this.actors.find((x) => x.id === id);
    if (!a) return;
    this.r.scene.remove(a.object);
    this.actors = this.actors.filter((x) => x !== a);
    this.hitProxies = this.hitProxies.filter((p) => p.userData.actor !== a);
  }

  // ─── Торговля ──────────────────────────────────────────────────────────────

  traderStock(id: string): Record<string, number> {
    this.traders[id] ??= Object.fromEntries(TRADERS[id].stock);
    return this.traders[id];
  }

  get prices() { return priceMult(this.char.skill('barter')); }

  openTrade(id: string) {
    this.tip('trade');
    this.closeDialogue();
    this.traderStock(id);
    this.ui.openTrade(id);
  }

  /** Стоимость предложений: мы продаём по цене sell, покупаем по цене buy. */
  tradeValue(mine: Map<string, number>, theirs: Map<string, number>) {
    const m = this.prices;
    let give = 0;
    let get = 0;
    for (const [id, n] of mine) give += itemPrice(id, m.sell, 'sell') * n;
    for (const [id, n] of theirs) get += itemPrice(id, m.buy, 'buy') * n;
    return { give, get };
  }

  completeTrade(id: string, mine: Map<string, number>, theirs: Map<string, number>): boolean {
    const { give, get } = this.tradeValue(mine, theirs);
    if (give < get || (give === 0 && get === 0)) return false;
    const stock = this.traderStock(id);
    for (const [item, n] of mine) {
      this.inv.remove(item, n);
      stock[item] = (stock[item] ?? 0) + n;
    }
    for (const [item, n] of theirs) {
      stock[item] -= n;
      if (stock[item] <= 0) delete stock[item];
      this.inv.add(item, n);
    }
    this.updatePlayerLook();
    this.ui.log(`Сделка с торговцем ${TRADERS[id].name} заключена.`, 'good');
    audio.play('coins');
    this.ui.updateHud();
    return true;
  }

  get playerAC() { return this.char.ac + (this.inv.armorStats?.ac ?? 0); }
  get playerArmor() {
    const a = this.inv.armorStats;
    const tough = this.char.has('toughness');
    return { dt: (a?.dt ?? 0) + (tough ? 2 : 0), dr: Math.min(0.9, (a?.dr ?? 0) + (tough ? 0.1 : 0)) };
  }

  /** Выбор способности из окна персонажа. */
  takePerk(id: PerkId) {
    if (!this.char.takePerk(id)) return;
    const def = PERKS.find((p) => p.id === id)!;
    this.ui.log(`Новая способность: «${def.name}».`, 'good');
    audio.play('levelup');
    this.applyPerks();
  }

  /** Производные от способностей значения, которые хранятся не в персонаже. */
  private applyPerks() {
    this.inv.rangedApBonus = this.char.has('fastShot') ? 1 : 0;
    this.player.hp = this.char.hp;
    this.player.maxHp = this.char.maxHp;
    this.syncAp();
  }

  equipArmor(id: string | null) {
    if (this.mode === 'combat') {
      this.ui.log('Переодеваться в бою некогда.', 'warn');
      return;
    }
    this.inv.armor = id;
    this.updatePlayerLook();
    this.ui.log(id ? `Надето: ${ITEMS[id].name}.` : 'Броня снята.');
    this.ui.updateHud();
  }

  /** Перестраивает модель игрока под надетую броню. */
  private updatePlayerLook() {
    const look = this.inv.armorStats?.look;
    const current = (this.player.rig as HumanoidRig).armorLook;
    if (current !== look) this.player.replaceRig(new HumanoidRig({ ...PLAYER_LOOK, armor: look }));
    this.updatePlayerWeapon();
  }

  equip(id: string | null) {
    if (this.mode === 'combat' && !this.isPlayerTurn) return;
    this.inv.equipped = id;
    this.updatePlayerWeapon();
    this.ui.log(id ? `В руках: ${ITEMS[id].name}.` : 'Оружие убрано.');
    this.ui.updateHud();
  }

  private updatePlayerWeapon() {
    (this.player.rig as HumanoidRig).setWeapon(this.inv.weapon.visual);
  }

  useItem(id: string) {
    const def = ITEMS[id];
    if (!this.inv.count(id)) return;
    if (id === 'radaway' || id === 'radx') {
      if (id === 'radaway' && this.char.rads <= 0) {
        this.ui.log('Радиации в организме нет.');
        return;
      }
      if (this.mode === 'combat' && (!this.combat || !this.combat.spendPlayerAp(def.useAp ?? 2))) {
        this.ui.log('Сейчас нельзя: не ваш ход или мало ОД.', 'warn');
        return;
      }
      this.inv.remove(id);
      if (id === 'radaway') {
        this.char.rads = Math.max(0, this.char.rads - 150);
        this.ui.log(`Антирадин: доза снижена до ${Math.round(this.char.rads)} рад.`, 'good');
      } else {
        this.radxUntil = this.days + 1 / 24;
        this.ui.log('Рад-Х: защита от радиации на час.', 'good');
      }
      audio.play('heal');
      this.syncAp();
      return;
    }
    if (!def.heal) return;
    if (this.char.hp >= this.char.maxHp) {
      this.ui.log('Вы и так здоровы.');
      return;
    }
    if (this.mode === 'combat') {
      if (!this.combat || !this.combat.spendPlayerAp(def.useAp ?? 2)) {
        this.ui.log('Сейчас нельзя: не ваш ход или мало ОД.', 'warn');
        return;
      }
    }
    const amount = Math.round(randInt(def.heal[0], def.heal[1]) * (this.char.has('healer') ? 1.5 : 1));
    const healed = Math.min(amount, this.char.maxHp - this.char.hp);
    this.char.hp += healed;
    this.player.hp = this.char.hp;
    this.inv.remove(id);
    this.ui.floatText(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${healed}`, '#7dff8a');
    this.ui.log(`${def.name}: восстановлено ${healed} ОЗ.`, 'good');
    audio.play('heal');
    this.ui.updateHud();
  }

  /** Лучевая болезнь меняет максимум ОД. */
  private syncAp() {
    this.player.maxAp = this.char.maxAp;
    if (this.mode !== 'combat') this.player.ap = this.char.maxAp;
    this.ui.updateHud();
  }

  private radxUntil = -1;
  private geigerAcc = 0;
  private radWarned = 0;

  /** Радиоактивные зоны локации: доза, треск счётчика, последствия. */
  private radiation(dt: number) {
    const zones = this.location.radZones;
    if (!zones || this.mode === 'menu' || this.mode === 'map' || this.mode === 'dead') return;
    let rate = 0;
    for (const z of zones) {
      const d = Math.hypot(this.player.pos.x - z.x, this.player.pos.z - z.z);
      if (d < z.r) rate += z.rate * (1 - (d / z.r) * 0.5);
    }
    if (rate <= 0) return;
    if (this.days < this.radxUntil) rate *= 0.5;
    if (this.char.has('radResist')) rate *= 0.5;
    const before = this.char.radPenalty;
    this.char.rads += rate * dt;
    // Счётчик Гейгера трещит тем чаще, чем выше фон.
    this.geigerAcc += rate * dt * 3;
    this.tip('rads');
    while (this.geigerAcc > Math.random()) {
      this.geigerAcc -= 1;
      audio.play('geiger', undefined, 0.5);
    }
    const level = Math.floor(this.char.rads / 100);
    if (level > this.radWarned) {
      this.radWarned = level;
      this.ui.log(`Доза радиации: ${level * 100} рад.${level >= 2 ? ' Лучевая болезнь отнимает силы.' : ' Тошнит.'}`, 'bad');
    }
    if (this.char.radPenalty !== before) this.syncAp();
  }

  spendSkillPoint(id: SkillId) {
    if (this.char.skillPoints <= 0) return;
    this.char.spent[id]++;
    this.char.skillPoints--;
  }

  // ─── Бой ───────────────────────────────────────────────────────────────────

  requestCombat() {
    if (this.mode !== 'explore') return;
    const near = this.actors.some((a) => a.faction === 'hostile' && !a.dead && a.distanceTo(this.player) < a.detectRadius + 3);
    if (!near) {
      this.ui.log('Рядом нет врагов.');
      return;
    }
    this.startCombat(true);
  }

  private startCombat(playerFirst: boolean, by?: Actor) {
    if (this.mode !== 'explore') return;
    this.tip('combat');
    if (this.sneaking) this.toggleSneak();
    for (const a of this.actors) {
      a.stop();
      a.speed = a.baseSpeed;
    }
    this.ui.closePanel();
    this.mode = 'combat';
    this.combat = new Combat(this, playerFirst, this.pendingAttack ?? by);
    this.ui.banner('БОЙ!', 1.2);
    if (by) this.ui.log(`${by.name} замечает вас!`, 'bad');
    this.ui.log('Начинается бой. Клик по врагу — атака, по земле — шаг (1 ОД за клетку).', 'warn');
    void this.combat.run();
  }

  toggleAim() {
    this.aimMode = !this.aimMode;
    this.ui.log(this.aimMode ? 'Прицельный режим: выберите цель, затем часть тела.' : 'Прицельный режим выключен.');
    this.ui.updateHud();
  }

  private openAimMenu(target: Actor) {
    const c = this.combat;
    if (!c) return;
    const w = this.inv.weapon;
    const parts = Object.keys(BODY_PARTS) as BodyPart[];
    this.ui.showAimMenu(
      this.mouseClient.x,
      this.mouseClient.y,
      target.name,
      parts.map((p) => {
        const plan = c.planPlayerAttack(target, p);
        return {
          label: BODY_PARTS[p].name,
          chance: c.hitChance(this.player, target, w, p),
          ap: plan ? plan.total : 0,
          enabled: !!plan && plan.total <= this.player.ap,
        };
      }),
      (i) => {
        this.aimMode = false;
        void c.playerAttack(target, parts[i]);
      },
    );
  }

  /** Вызывается в начале хода игрока: выполняет атаку, с которой начался бой. */
  onPlayerTurn() {
    if (this.pendingAttack && this.combat) {
      const t = this.pendingAttack;
      this.pendingAttack = null;
      void this.combat.playerAttack(t);
    }
  }

  endTurn() { this.combat?.endPlayerTurn(); }

  onCombatEnded() {
    this.combat = null;
    this.aimMode = false;
    this.ui.hideAimMenu();
    for (const a of this.actors) a.crippled.clear();
    this.pendingAttack = null;
    this.pathMarkers.count = 0;
    if (this.player.dead) return;
    this.mode = 'explore';
    this.player.ap = this.char.maxAp;
    this.ui.banner('БОЙ ОКОНЧЕН', 1.4);
    this.ui.updateHud();
  }

  damage(target: Actor, dmg: number, attacker: Actor) {
    if (target === this.player) {
      this.char.hp -= dmg;
      target.hp = this.char.hp;
      // На ринге проигрывают нокаутом, а не смертью.
      if (this.char.hp <= 0 && this.flags.has('inBout')) {
        this.char.hp = 1;
        target.hp = 1;
        this.loseBout(attacker);
        return;
      }
    } else target.hp -= dmg;
    const isLizard = target.rig instanceof LizardRig;
    this.effects.hit(target, attacker.pos, isLizard ? new THREE.Color(0.25, 0.3, 0.05) : undefined);
    this.ui.floatText(target.pos.clone().setY(target.pos.y + target.rig.height + 0.3), `−${dmg}`, target === this.player ? '#ff5a4a' : target.faction === 'companion' ? '#ff9a6a' : '#ffd060');
    target.rig.playHit();
    if (target === this.player && this.char.hp < this.char.maxHp * 0.35) this.tip('lowhp');
    const beast = !(attacker.rig instanceof HumanoidRig);
    audio.play(beast ? 'bite' : 'hit', target.pos);
    if (target === this.player) audio.play('hurt');
    if (target.hp <= 0) this.kill(target);
    this.ui.updateHud();
  }

  private kill(target: Actor) {
    target.dead = true;
    target.stop();
    target.rig.playDeath();
    audio.play('death', target.pos, 0.8);
    if (target === this.player) {
      this.gameOver();
      return;
    }
    if (target.faction === 'companion') {
      target.follow = null;
      this.flags.add(`${target.id}Dead`);
      this.ui.log(`${target.name} погибает...`, 'bad');
      return;
    }
    this.locState[this.location.id].dead.push(target.id);
    this.kills++;
    this.ui.log(`${target.name} погибает.`, 'good');
    if (target.xp) this.addXp(target.xp);
    for (const [id, min, max] of target.loot) {
      const n = randInt(min, max);
      if (n > 0) this.giveItem(id, n);
    }
    if ((target.id === 'carver' || target.id === 'morelli') && this.flags.has('nrWar') && !this.flags.has('nrWarWon')) this.endFamilyWar();
    if (target.tag === 'boxer') {
      const n = Number(target.id.replace('boxer', ''));
      this.flags.add(`boutWon${n}`);
      this.flags.add('boutPrizeDue');
      this.flags.delete('inBout');
      this.ui.banner('НОКАУТ!', 2);
      this.ui.log(`${target.name} в нокауте! Забери приз у Быка Томми.`, 'good');
      this.questKills.boxing = (this.questKills.boxing ?? 0) + 1;
      if (this.quests.boxing) this.quests.boxing.progress = this.questKills.boxing;
    }
    if (target.id === 'colonel') {
      this.flags.add('colonelDead');
      this.ui.banner('ПОЛКОВНИК ПОВЕРЖЕН', 2.5);
    }
    if (target.tag) {
      this.questKills[target.tag] = (this.questKills[target.tag] ?? 0) + 1;
      this.updateKillQuests();
    }
  }

  private gameOverScreen() {
    this.ui.showGameOver(Game.hasSave() ? () => this.ui.showSlots('load', (s) => this.requestLoad(s), () => this.gameOverScreen()) : null, () => location.reload());
  }

  private gameOver() {
    this.mode = 'dead';
    this.ui.log('Вы погибли.', 'bad');
    this.combat?.abort();
    setTimeout(() => {
      this.ui.showHud(false);
      this.ui.showGameOver(Game.hasSave() ? () => this.ui.showSlots('load', (s) => this.requestLoad(s), () => this.gameOverScreen()) : null, () => location.reload());
    }, 1800);
  }

  // ─── Диалоги ───────────────────────────────────────────────────────────────

  private openDialogue(a: Actor) {
    this.tip('dialogue');
    const def = DIALOGUES[a.dialogue!];
    if (!def) return;
    this.ui.closePanel();
    this.mode = 'dialogue';
    this.dialogueActor = a;
    this.dialogueDef = def;
    a.stop();
    a.faceTowards(this.player.pos);
    this.player.faceTowards(a.pos);
    this.showNode(def.start(this));
  }

  private showNode(id: string) {
    const def = this.dialogueDef!;
    const node = def.nodes[id];
    this.dialogueOptions = node.options.filter((o) => !o.cond || o.cond(this));
    this.ui.showDialogue(
      this.dialogueActor!.name,
      resolveText(node.text, this),
      this.dialogueOptions.map((o) => ({ text: resolveText(o.text, this), check: o.check })),
      (i) => this.pickOption(i),
    );
  }

  private pickOption(i: number) {
    const o = this.dialogueOptions[i];
    if (!o) return;
    o.action?.(this);
    if (this.mode !== 'dialogue') return;
    if (o.next) this.showNode(o.next);
    else this.closeDialogue();
  }

  closeDialogue() {
    this.ui.hideDialogue();
    this.dialogueActor = null;
    this.dialogueDef = null;
    if (this.mode === 'dialogue') this.mode = 'explore';
    this.ui.updateHud();
  }

  get talkingTo() { return this.dialogueActor; }

  // ─── Перемещение и взаимодействие вне боя ──────────────────────────────────

  private async walkTo(target: THREE.Vector3, range: number, token: number): Promise<boolean> {
    const p = this.player;
    const start = p.cell(this.nav);
    const goal = this.nav.cellOf(target.x, target.z);
    const path = range > 0 ? this.nav.findPathToRange(start, goal, range) : this.nav.findPath(start, goal);
    if (!path) {
      this.ui.log('Туда не пройти.', 'warn');
      return false;
    }
    const smooth = this.nav.smooth(start, path);
    await p.moveAlong(smooth.map(([i, j]) => this.nav.center(i, j)));
    return token === this.clickToken && this.mode === 'explore';
  }

  private interactActor(a: Actor) {
    if (a.dialogue) {
      this.openDialogue(a);
      return;
    }
    if (a === this.dog) {
      if (this.isInParty(a) || this.quests.dog?.state === 'rewarded') this.ui.log('Дымок радостно виляет хвостом и тычется носом в ладонь.');
      else this.findDog();
      return;
    }
    if (a.name === 'Брамин') this.ui.log('Брамин. Обе головы жуют жвачку и смотрят на вас с подозрением.');
  }

  private interactObject(it: Interactable) {
    const sci = this.char.skill('science');
    const card = this.inv.count('keycard') > 0;
    switch (it.id) {
      case 'sierraSecurity':
        if (this.flags.has('sierraSecurityOff')) this.ui.log('Охранная система отключена.');
        else if (sci >= 60) {
          this.ui.log('ОХРАННЫЙ ПРОТОКОЛ… ОТМЕНЁН. Роботы и турели замирают один за другим. [Наука]', 'good');
          this.disableSierraGuards();
        } else {
          this.ui.log('НЕВЕРНЫЙ ПАРОЛЬ. ТРЕВОГА! (нужна Наука 60)', 'bad');
          for (const a of this.actors) if (SIERRA_GUARDS.includes(a.id) && !a.dead) a.detectRadius = 40;
        }
        break;
      case 'sierraGenerator':
        if (this.flags.has('sierraPower')) this.ui.log('Генератор гудит ровно.');
        else if (this.char.skill('repair') >= 50 || this.inv.count('microcell') >= 2) {
          const bySkill = this.char.skill('repair') >= 50;
          if (!bySkill) this.inv.remove('microcell', 2);
          this.flags.add('sierraPower');
          this.advanceQuest('sierra', 1);
          this.addXp(bySkill ? 400 : 200);
          this.ui.log(bySkill ? 'Вы чините генератор. Где-то с лязгом откатывается гермодверь арсенала. [Ремонт]' : 'Две батареи заводят генератор вручную. Гермодверь арсенала откатывается.', 'good');
          this.ui.banner('ПИТАНИЕ ВОССТАНОВЛЕНО', 2);
        } else this.ui.log('Генератор мёртв. Нужен Ремонт 50 — или две микроядерные батареи, чтобы завести его вручную.', 'warn');
        break;
      case 'sierraArmory':
        if (!this.flags.has('sierraPower')) {
          this.ui.log('Ящики за решёткой арсенала. Решётка открывается только при работающем генераторе.', 'warn');
          break;
        }
        this.flags.add('sierraLooted');
        for (const [id, n] of [['injector', 1], ['combatArmor', 1], ['microcell', 10], ['stimpak', 3], ['caps', 300]] as const) this.giveItem(id, n);
        this.advanceQuest('sierra', 2);
        if (this.quests.sierra) this.quests.sierra.state = 'rewarded';
        this.addXp(600);
        this.removeFromWorld('sierraArmory');
        break;
      case 'car':
        this.ui.openTrunk();
        break;
      case 'brokenCar':
        if (this.flags.has('carOwned')) break;
        if (!this.inv.count('injector')) this.ui.log('Старый «Хайвеймен». Двигатель цел, но сгорел топливный инжектор. Смитти говорит, такой можно найти на армейском складе Сьерра.', 'warn');
        else if (this.char.skill('repair') >= 50) {
          this.ui.log('Вы ставите новый инжектор и подключаете проводку. Мотор кашляет — и оживает! [Ремонт]', 'good');
          this.fixCar(false);
        } else this.ui.log('Инжектор есть, но самому не справиться (Ремонт 50). Попроси Смитти.', 'warn');
        break;
      case 'carverSafe': {
        if (this.flags.has('ledgerTaken')) break;
        // Охрана рядом — заметят.
        const nearGuards = this.actors.filter((a) => CARVER_IDS.includes(a.id) && !a.dead && a.faction !== 'hostile' && a.distanceTo(this.player) < 9);
        // Крадущийся вор может остаться незамеченным даже под носом у охраны.
        const guards = nearGuards.length && this.sneakCheck(0) ? [] : nearGuards;
        if (nearGuards.length && !guards.length) this.ui.log('Вы бесшумно возитесь с замком прямо за спиной охраны. [Скрытность]', 'good');
        this.flags.add('ledgerTaken');
        this.giveItem('ledger');
        this.removeInteractable(it);
        it.object.visible = false;
        if (guards.length) {
          this.ui.log('Охрана Карвера замечает вас у сейфа!', 'bad');
          this.makeHostile('carver');
        } else this.ui.log('Сейф открыт тихо. Никто ничего не заметил.', 'good');
        break;
      }
      case 'navTerminal':
        if (this.inv.count('fobCode')) {
          this.ui.log('Код опознавания уже у тебя.');
        } else if (this.flags.has('navarroIn') || NAVARRO_SOLDIERS.every((id) => !this.actors.some((a) => a.id === id && !a.dead))) {
          this.ui.log('ВОЕННАЯ СЕТЬ АНКЛАВА… Протоколы опознавания… Код «свой-чужой» для платформы скопирован.', 'good');
          this.giveItem('fobCode');
          this.addXp(400);
          this.checkTanker();
        } else this.ui.log('Терминал под охраной. Без допуска к нему не подойти.', 'warn');
        break;
      case 'cellTerminal':
        if (this.flags.has('tribeFreed')) this.ui.log('Клетки открыты.');
        else if (card || sci >= 70) {
          this.ui.log(card ? 'Ключ-карта офицера подходит. Замки клеток щёлкают.' : 'Вы обходите защиту пульта. Замки клеток щёлкают. [Наука]', 'good');
          this.freeTribe();
          this.rigAlarm();
        } else this.ui.log('Доступ только по ключ-карте офицера (или Наука 70).', 'warn');
        break;
      case 'turretTerminal':
        if (this.flags.has('turretsHacked')) this.ui.log('Турели уже работают на вас.');
        else if (card || sci >= 60) {
          this.flags.add('turretsHacked');
          for (const a of this.actors) {
            if (a.id.startsWith('rigturret') && !a.dead) {
              a.faction = 'companion';
              a.detectRadius = 0;
            }
          }
          this.ui.log('Система «свой-чужой» перепрограммирована. Турели теперь стреляют по Анклаву.', 'good');
          this.addXp(300);
          this.rigAlarm();
        } else this.ui.log('Нужна ключ-карта или Наука 60.', 'warn');
        break;
      case 'rigReactor':
        if (this.flags.has('rigOverload')) this.ui.log('Реактор ревёт. Беги!', 'bad');
        else if (card || sci >= 50) {
          if (!this.flags.has('tribeFreed')) this.ui.log('Племя всё ещё в клетке… Но времени нет.', 'bad');
          this.overloadReactor();
          this.rigAlarm();
        } else this.ui.log('Защита реактора: нужна ключ-карта или Наука 50.', 'warn');
        break;
      case 'temple':
        this.ui.log('Храм Испытаний. Ты уже прошёл его — каменная дверь запечатана до следующего Избранного.');
        break;
      case 'vcgate':
        this.ui.log('Ворота заперты. Без пропуска граждане чужаков не пускают — поговори с офицером на таможне.', 'warn');
        break;
      case 'v8terminal':
        if (!this.flags.has('citizenAccess')) {
          this.ui.log('ДОСТУП ЗАПРЕЩЁН. Терминал требует допуска гражданина.', 'warn');
        } else if (!this.flags.has('v13known')) {
          this.flags.add('v13known');
          this.ui.log('Архив Волт-Тек… список убежищ… УБЕЖИЩЕ 13: координаты найдены. Голодиск записан.', 'good');
          this.giveItem('v13coords');
          this.discover('vault13');
          this.advanceQuest('geck', 7);
          this.addXp(300);
        } else this.ui.log('Терминал Убежища 8 мерцает. Координаты Убежища 13 уже у тебя.');
        break;
      case 'regulatorCrate':
        if (this.flags.has('gotRegulator')) break;
        this.flags.add('gotRegulator');
        this.giveItem('regulator');
        this.advanceQuest('reactor', 1);
        this.removeInteractable(it);
        break;
      case 'reactorPanel':
        if (this.flags.has('reactorFixed')) this.ui.log('Индикаторы горят зелёным. Реактор работает ровно.');
        else if (!this.inv.count('regulator')) this.ui.log('Пульт мигает красным. Регулятор потока выгорел — нужна новая деталь.', 'warn');
        else if (this.char.skill('repair') >= 60) {
          this.ui.log('Вы сами меняете регулятор потока. Стрелки приборов ползут в зелёную зону. [Ремонт]', 'good');
          this.fixReactor(true);
        } else this.ui.log('Слишком сложно без навыка (Ремонт 60). Отдай деталь Скиту.', 'warn');
        break;
      case 'geckPedestal':
        if (this.flags.has('hasGeck')) {
          this.ui.log('Постамент пуст.');
          break;
        }
        if (!this.flags.has('clawsAllow') && this.actors.some((a) => !a.dead && (a.id.startsWith('claw') || a.id === 'grah'))) {
          this.ui.log('Когти смерти не подпустят к ГЭКК без разрешения Граха.', 'warn');
          break;
        }
        this.flags.add('hasGeck');
        this.giveItem('geck');
        this.advanceQuest('geck', 8);
        this.addXp(1000);
        this.ui.banner('ГЭКК НАЙДЕН', 3);
        this.removeInteractable(it);
        break;
    }
  }

  private removeInteractable(it: Interactable) {
    const i = this.world.interactables.indexOf(it);
    if (i >= 0) this.world.interactables.splice(i, 1);
    if (it.id === 'regulatorCrate' || it.id === 'geckPedestal') {
      // Убираем сам предмет с постамента/ящик.
      if (it.id === 'regulatorCrate') it.object.visible = false;
      else it.object.children.slice(1).forEach((c) => (c.visible = false));
    }
  }

  fixReactor(byPlayer: boolean) {
    this.inv.remove('regulator');
    this.flags.add('reactorFixed');
    this.addKarma(60);
    const q = this.quests.reactor ?? (this.quests.reactor = { state: 'active', progress: 1 });
    q.state = 'rewarded';
    this.addXp(byPlayer ? 600 : 350);
    if (this.quests.geck?.progress === 4) this.advanceQuest('geck', 5);
    this.ui.banner('УТЕЧКА ОСТАНОВЛЕНА', 2.5);
  }

  /** Полное лечение у доктора: раны и радиация. */
  doctorHeal(cost: number) {
    this.takeItem('caps', cost);
    this.char.hp = this.char.maxHp;
    this.player.hp = this.char.hp;
    this.char.rads = 0;
    this.radWarned = 0;
    audio.play('heal');
    this.syncAp();
  }

  // ─── Глава III ─────────────────────────────────────────────────────────────

  /** Секунды до взрыва платформы (тикают вне боя). */
  countdown: number | null = null;

  /** Свой среди чужих: допуск Наварро + силовая броня, и тревога ещё не поднята. */
  get disguisedOnRig() {
    return this.flags.has('navarroIn') && this.inv.armor === 'powerArmor' && !this.flags.has('rigAlarm');
  }

  /** Тревога на платформе: маскировка раскрыта. */
  rigAlarm() {
    if (this.flags.has('rigAlarm') || this.location.id !== 'oilrig') return;
    const wasDisguised = this.disguisedOnRig;
    this.flags.add('rigAlarm');
    if (!wasDisguised) return;
    this.ui.log('ТРЕВОГА! Нарушитель на платформе! Маскировка раскрыта.', 'bad');
    this.turnHostile(RIG_SOLDIERS);
    for (const a of this.actors) {
      if (a.id.startsWith('rigturret') && a.faction === 'hostile') a.detectRadius = 12;
    }
  }

  /** Танкер готов, если есть топливо и код. */
  checkTanker() {
    if (this.flags.has('tankerFuel') && this.inv.count('fobCode') && (this.quests.enclave?.progress ?? 0) < 2) {
      this.advanceQuest('enclave', 2);
      this.ui.log('Для «Посейдона» всё готово. Возвращайся к капитану Барнаби.', 'warn');
    }
  }

  sailToRig() {
    this.closeDialogue();
    // Плавание длится до ночи следующих суток — подходим к платформе в темноте.
    this.days = Math.floor(this.days + 15 / 24) + 1 + 7 / 24;
    this.encounterInfo = null;
    this.enterLocation(OIL_RIG, 'world');
    if ((this.quests.enclave?.progress ?? 0) < 3) this.advanceQuest('enclave', 3);
    this.ui.banner('ПЛАТФОРМА АНКЛАВА', 3);
    this.ui.log(this.disguisedOnRig
      ? '«Посейдон» передаёт код опознавания. В силовой броне тебя принимают за своего — пока.'
      : '«Посейдон» передаёт код опознавания, и танкер подпускают к причалу. Но на палубе чужака уже ждут.', 'warn');
  }

  freeTribe() {
    this.flags.add('tribeFreed');
    this.addKarma(100);
    this.advanceQuest('enclave', 4);
    this.addXp(800);
    const dock = this.nav.center(...this.nav.cellOf(RIG_DOCK.x, RIG_DOCK.z));
    for (const a of this.actors.filter((x) => x.id.startsWith('rig_'))) {
      a.dialogue = a.id === 'rig_elder' ? 'elderRig' : 'tribeRig';
      // Племя бежит к танкеру и поднимается на борт.
      const path = this.nav.findPathToRange(a.cell(this.nav), this.nav.cellOf(dock.x, dock.z), 2);
      a.speed = a.baseSpeed * 1.2;
      if (path) {
        void a.moveAlong(path.map(([i, j]) => this.nav.center(i, j))).then(() => {
          if (a.id !== 'rig_elder') this.removeFromLocation(a.id);
        });
      }
    }
    // Клетка открыта.
    this.nav.unblockCircle(0, -25, 6);
    this.ui.banner('ПЛЕМЯ СВОБОДНО', 2.5);
  }

  overloadReactor() {
    this.flags.add('rigOverload');
    this.countdown = 150;
    this.advanceQuest('enclave', 5);
    this.addXp(500);
    this.ui.banner('РЕАКТОР ПЕРЕГРУЖЕН', 3);
    this.ui.log('Сирены воют по всей платформе. До взрыва 150 секунд. Беги к причалу!', 'bad');
    this.spawnColonel();
  }

  /** Командир платформы перекрывает путь к причалу. */
  spawnColonel() {
    if (this.actors.some((a) => a.id === 'colonel') || this.flags.has('colonelDead')) return;
    const c = colonel();
    c.faction = 'hostile';
    c.detectRadius = 16;
    const a = this.spawn(c, RIG_DOCK.x - 6, RIG_DOCK.z - 2, 0.8);
    if (a) this.ui.log('На причале появляется Полковник Стракс в улучшенной силовой броне.', 'bad');
  }

  private tickCountdown(dt: number) {
    if (this.countdown === null || this.location.id !== 'oilrig') return;
    if (this.mode !== 'explore') return;
    const before = Math.ceil(this.countdown);
    this.countdown -= dt;
    if (Math.ceil(this.countdown) !== before && before % 30 === 0) this.ui.log(`До взрыва: ${before} с.`, 'bad');
    if (this.countdown <= 0) {
      this.countdown = null;
      this.ui.banner('ВЗРЫВ', 2);
      this.r.danger = 1;
      this.char.hp = 0;
      this.player.hp = 0;
      this.player.dead = true;
      this.player.rig.playDeath();
      this.gameOver();
    }
  }

  /** Выход с платформы через причал. */
  leaveRig() {
    if (this.flags.has('rigOverload')) {
      this.countdown = null;
      this.flags.add('rigDestroyed');
      this.quests.enclave.progress = 6;
      this.quests.enclave.state = 'rewarded';
      this.mode = 'menu';
      this.ui.showHud(false);
      audio.play('quest');
      this.ui.showEnding(this.endingSlides(), () => {
        this.enterLocation(LOCATIONS.sanfran, 'dock');
        this.mode = 'explore';
        this.ui.showHud(true);
        this.ui.log('Платформы больше нет. Пустошь открыта — свободная игра.', 'good');
      });
      return;
    }
    this.enterLocation(LOCATIONS.sanfran, 'dock');
    this.ui.log('«Посейдон» вернулся в порт Сан-Франциско.');
  }

  private endingSlides(): string[] {
    const f = this.flags;
    const slides: string[] = [];
    slides.push('Реактор платформы вспыхнул над океаном. Огненный столб видели даже в Кламате. Анклав на западном побережье перестал существовать.' +
      (f.has('colonelDead') ? ' Полковник Стракс так и не покинул причал.' : ''));
    slides.push(f.has('tribeFreed')
      ? '«Посейдон» доставил жителей Арройо домой. ГЭКК превратил выжженную долину в зелёный сад — впервые за сто лет здесь шёл урожай.'
      : 'Племя погибло вместе с платформой. ГЭКК подарил долине жизнь — но встречать её было уже некому.');
    const fates: string[] = [];
    if (this.quests.dog?.state === 'rewarded' && !this.dog.dead) fates.push('Дымок дожил до седой морды у очага Нагора.');
    if (f.has('sulikJoined') && !f.has('sulikDead')) fates.push('Сулик вернулся в своё племя с рассказами о походах. Дедушка, говорят, одобрил.');
    if (f.has('vicFree')) fates.push('Вик открыл лавку в Убежище-Сити и до старости торговал с племенем Арройо.');
    if (this.isJoined('cassidy') && !f.has('cassidyDead')) fates.push('Кэссиди так и не бросил пить, но сердце его пережило ещё много дорог.');
    if (this.isJoined('marcus') && !f.has('marcusDead')) fates.push('Маркус вернулся в Брокен-Хиллз и до конца дней оставался его шерифом.');
    if (fates.length) slides.push(fates.join(' '));
    slides.push(f.has('reactorFixed')
      ? 'Убежище-Сити и Гекко заключили хрупкий мир: чистая энергия гулей в обмен на лекарства граждан.'
      : 'Ссора Убежище-Сити и Гекко переросла в войну, и ни один из городов так и не оправился.');
    if (f.has('nrWarWon')) slides.push(f.has('sidedMorelli')
      ? 'Война семей закончилась быстро. Джек Карвер лёг в песок, и Нью-Рино целиком достался Морелли. Говорят, на стене казино до сих пор висит твой портрет.'
      : 'В войне семей Луиджи Морелли пал. Карвер правил Нью-Рино железной рукой и помнил, кому обязан короной.');
    else if (f.has('sidedMorelli')) slides.push('Без бухгалтерии Карвер быстро пал. Нью-Рино стал вотчиной семьи Морелли — и ещё на шаг ближе к тому, чтобы стать столицей пороков всей пустоши.');
    else if (f.has('sidedCarver')) slides.push('Семья Карвер вернула свои книги и вытеснила Морелли. Новый порядок в Нью-Рино оказался ничуть не лучше старого.');
    if (f.has('carOwned')) slides.push('«Хайвеймен» ещё долго колесил по дорогам пустоши. Смитти до старости хвастал, что это он поставил ему сердце.');
    if (this.quests.scorpions?.state === 'rewarded') slides.push('Шахта Брокен-Хиллз снова давала руду. Город, где люди, гули и мутанты живут вместе, процветал назло всем предсказаниям.');
    if (f.has('clawsAllow')) slides.push('Когти смерти Убежища 13 жили тихо. Путники рассказывали о разумных чудовищах, которые не трогают людей.');
    else if (f.has('deathclawsHostile')) slides.push('Убежище 13 опустело навсегда. Ветер гоняет пыль по его залам.');
    const days = Math.max(1, Math.floor(this.days));
    slides.push(this.karma >= 100
      ? `В деревнях от Арройо до Брокен-Хиллз о тебе рассказывали детям как о герое. «${this.karmaTitle}» — так тебя звали у костров.`
      : this.karma <= -100
        ? `Твоё имя произносили шёпотом и с оглядкой. «${this.karmaTitle}» — так тебя звали те, кому ты встречался на пути.`
        : 'Одни звали тебя героем, другие — бродягой с ружьём. Пустошь не любит простых ответов.');
    slides.push(`${this.char.name} стал легендой пустоши. Уровень ${this.char.level}, побеждено врагов: ${this.kills}, ${days} ${plural(days, 'день', 'дня', 'дней')} в пути.`);
    return slides;
  }

  // ─── Нью-Рино ──────────────────────────────────────────────────────────────

  lastGamble = '';

  /** Кости в «Десятке»: шанс выигрыша растёт с Удачей. */
  gamble(bet: number) {
    if (this.inv.count('caps') < bet) return;
    const chance = 0.42 + (this.char.special.lk - 5) * 0.03 + (this.char.has('lucky') ? 0.05 : 0);
    const win = Math.random() < chance;
    const d6 = () => 1 + Math.floor(Math.random() * 6);
    let mine = [d6(), d6()];
    let house = [d6(), d6()];
    // Подбираем броски, совпадающие с исходом (ничья — заведению).
    for (let i = 0; i < 50 && (mine[0] + mine[1] > house[0] + house[1]) !== win; i++) {
      mine = [d6(), d6()];
      house = [d6(), d6()];
    }
    const roll = `Ваши кости: ${mine[0]} и ${mine[1]}. У заведения: ${house[0]} и ${house[1]}.`;
    if (win) {
      this.inv.add('caps', bet);
      this.lastGamble = `${roll} Вы выиграли ${bet} крышек!`;
      audio.play('coins');
    } else {
      this.inv.remove('caps', bet);
      this.lastGamble = `${roll} Заведение забирает ${bet} крышек.`;
    }
    this.ui.log(this.lastGamble, win ? 'good' : '');
    this.ui.updateHud();
  }

  startBout() {
    const b = this.actors.find((a) => a.tag === 'boxer' && !a.dead);
    if (!b) return;
    this.startQuest('boxing');
    this.flags.add('inBout');
    this.ui.banner('БОЙ НА РИНГЕ', 1.5);
    this.turnHostile([b.id]);
  }

  private loseBout(boxer: Actor) {
    this.flags.delete('inBout');
    boxer.faction = 'villager';
    boxer.detectRadius = 0;
    boxer.dialogue = 'boxer';
    boxer.hp = boxer.maxHp;
    this.ui.banner('НОКАУТ', 2);
    this.ui.log('Вы в нокауте! Бой проигран. Отлежитесь и попробуйте снова.', 'bad');
    this.combat?.abort();
  }

  collectBoutPrize(prizes: number[]) {
    this.flags.delete('boutPrizeDue');
    const won = [0, 1, 2].filter((i) => this.flags.has(`boutWon${i}`)).length;
    this.giveItem('caps', prizes[won - 1] ?? 100);
    if (won >= 3) {
      this.giveItem('brassKnuckles');
      if (this.quests.boxing) this.quests.boxing.state = 'rewarded';
      this.ui.banner('ЧЕМПИОН НЬЮ-РИНО', 2.5);
    }
  }

  /** Война семей: боевики союзной семьи идут за героем, соперники нападают. */
  startFamilyWar(side: 'morelli' | 'carver') {
    this.flags.add('nrWar');
    const allies = side === 'morelli' ? MORELLI_IDS : CARVER_IDS;
    for (const a of this.actors) {
      if (!allies.includes(a.id) || a.dead || a.id === side) continue;
      a.faction = 'companion';
      a.follow = this.player;
      a.tag = 'warAlly';
      a.wanderRadius = 0;
    }
    this.closeDialogue();
    this.ui.banner('ВОЙНА СЕМЕЙ', 2.5);
    this.ui.log(`Боевики ${side === 'morelli' ? 'Морелли' : 'Карвера'} идут за тобой. Глава враждебной семьи должен умереть.`, 'warn');
    this.makeHostile(side === 'morelli' ? 'carver' : 'morelli');
    for (const a of this.actors) if ((side === 'morelli' ? CARVER_IDS : MORELLI_IDS).includes(a.id) && !a.dead) a.detectRadius = 40;
  }

  private endFamilyWar() {
    this.flags.add('nrWarWon');
    this.ui.banner('НЬЮ-РИНО ВЗЯТ', 2.5);
    this.ui.log('Глава враждебной семьи убит. Вернись к своему боссу за наградой.', 'warn');
    for (const a of this.actors) {
      if (a.tag !== 'warAlly' || a.dead) continue;
      a.follow = null;
      a.faction = 'villager';
      a.tag = undefined;
      a.home.copy(a.pos);
      a.wanderRadius = 3;
    }
  }

  /** Семья Нью-Рино становится враждебной (после предательства). */
  makeHostile(family: 'morelli' | 'carver') {
    this.flags.add(`${family}Hostile`);
    const ids = family === 'morelli' ? MORELLI_IDS : CARVER_IDS;
    for (const a of this.actors) {
      if (!ids.includes(a.id) || a.dead) continue;
      a.faction = 'hostile';
      a.dialogue = undefined;
      a.detectRadius = 14;
    }
  }

  /** Пропуск в Убежище-Сити: ворота открываются. */
  openVaultCityGate() {
    this.flags.add('vcPass');
    const gate = this.world.interactables.find((i) => i.id === 'vcgate');
    if (gate) {
      gate.object.visible = false;
      this.removeInteractable(gate);
      this.nav.unblockCircle(gate.object.position.x, gate.object.position.z, 3.4);
    }
    this.ui.log('Ворота Убежище-Сити открыты для вас.', 'good');
  }

  /** Мирные существа становятся врагами и сразу нападают. */
  turnHostile(ids: string[], flag?: string) {
    if (flag) this.flags.add(flag);
    for (const a of this.actors) {
      if (!ids.includes(a.id) || a.dead) continue;
      a.faction = 'hostile';
      a.dialogue = undefined;
      a.detectRadius = 30;
    }
    this.closeDialogue();
  }

  private findDog() {
    if (this.flags.has('dogFound')) return;
    this.flags.add('dogFound');
    this.joinParty(this.dog);
    this.ui.log('Лохматый серый пёс радостно бросается к вам. Это, должно быть, Дымок!', 'good');
    if (this.quests.dog?.state === 'active') {
      this.quests.dog.state = 'done';
      this.ui.log('Отведи Дымка к Нагору.', 'warn');
    }
  }

  private async onClick() {
    if (this.mode === 'menu' || this.mode === 'dialogue' || this.mode === 'dead' || this.mode === 'map' || this.mode === 'pause') return;
    if (this.ui.panel) {
      this.ui.closePanel();
      return;
    }
    const h = this.hover;
    if (this.mode === 'combat') {
      if (!this.combat || !this.combat.isPlayerTurn) return;
      if (h.actor && h.actor.faction === 'hostile' && !h.actor.dead) {
        if (this.aimMode || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) this.openAimMenu(h.actor);
        else void this.combat.playerAttack(h.actor);
      } else if (h.cell) void this.combat.playerMove(h.cell);
      return;
    }
    const token = ++this.clickToken;
    if (h.actor && h.actor !== this.player && !h.actor.dead) {
      const a = h.actor;
      if (a.faction === 'hostile') {
        this.pendingAttack = a;
        this.startCombat(true);
        return;
      }
      // Shift+клик по мирному человеку — попытка карманной кражи.
      const steal = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && a.faction === 'villager' && a.rig instanceof HumanoidRig;
      if (await this.walkTo(a.pos, steal ? 1.6 : 2.6, token)) {
        if (steal) this.attemptSteal(a);
        else this.interactActor(a);
      }
      return;
    }
    if (h.inter) {
      if (await this.walkTo(h.inter.approach, 1.5, token)) this.interactObject(h.inter);
      return;
    }
    if (h.cell) {
      const c = this.nav.center(h.cell[0], h.cell[1]);
      this.moveMarker.position.copy(c).add(new THREE.Vector3(0, 0.06, 0));
      this.moveMarker.visible = true;
      this.moveMarkerT = 0;
      await this.walkTo(c, 0, token);
    }
  }

  // ─── Ввод ──────────────────────────────────────────────────────────────────

  private bindInput() {
    const canvas = this.r.renderer.domElement;
    // Звук запускается по первому действию пользователя.
    const unlock = () => audio.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, .opt, .item, .tag')) audio.play('click');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) this.rotating = true;
      if (e.button === 0) this.downPos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rotating = false;
      if (e.button === 0 && e.target === canvas && Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) < 6) void this.onClick();
    });
    window.addEventListener('pointermove', (e) => {
      if (this.rotating) {
        this.camYaw -= e.movementX * 0.006;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.004, 0.18, 1.35);
      }
      this.overCanvas = e.target === canvas;
      this.mouseClient = { x: e.clientX, y: e.clientY };
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.1), 5, 45);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.keys.add(e.code);
      this.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onKey(e: KeyboardEvent) {
    if (this.mode === 'menu' || this.mode === 'map') return;
    if (this.mode === 'pause') {
      if (e.code === 'Escape') this.resume();
      return;
    }
    if (this.mode === 'dialogue') {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.pickOption(n - 1);
      return;
    }
    switch (e.code) {
      case 'KeyI': this.ui.togglePanel('inv'); break;
      case 'KeyC': this.ui.togglePanel('cha'); break;
      case 'KeyP': this.ui.togglePanel('pip'); break;
      case 'Escape':
        if (this.ui.panel) this.ui.closePanel();
        else this.openPause();
        break;
      case 'Space': e.preventDefault(); this.endTurn(); break;
      case 'KeyF': this.requestCombat(); break;
      case 'KeyV': this.toggleSneak(); break;
      case 'KeyH':
        this.helpHidden = !this.helpHidden;
        this.ui.showHud(this.mode !== 'dead');
        break;
      case 'KeyM': this.ui.log(audio.toggleMute() ? 'Звук выключен.' : 'Звук включён.'); break;
      case 'F5': e.preventDefault(); this.save(); break;
      case 'F9': e.preventDefault(); this.requestLoad(); break;
    }
  }

  // ─── Наведение мыши ────────────────────────────────────────────────────────

  private groundHit(ray: THREE.Ray): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    let prev = 0;
    for (let t = 0.5; t < 400; t += 0.5) {
      ray.at(t, p);
      if (p.y > 90 && ray.direction.y > 0) return null;
      if (p.y <= heightAt(p.x, p.z)) {
        let a = prev;
        let b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          ray.at(m, p);
          if (p.y <= heightAt(p.x, p.z)) b = m;
          else a = m;
        }
        return ray.at(b, p);
      }
      prev = t;
    }
    return null;
  }

  private healthWord(a: Actor) {
    const k = a.hp / a.maxHp;
    return k > 0.9 ? 'невредим' : k > 0.6 ? 'легко ранен' : k > 0.3 ? 'ранен' : 'тяжело ранен';
  }

  private updateHover() {
    this.hover = {};
    this.hoverRing.visible = false;
    let tip: string | null = null;
    let cost = 0;
    const interactive = this.mode === 'explore' || this.mode === 'combat';
    if (this.overCanvas && interactive && !this.ui.panel) {
      this.raycaster.setFromCamera(this.mouse, this.r.camera);
      const hit = this.raycaster.intersectObjects(this.hitProxies, false).find((h) => !(h.object.userData.actor as Actor).dead);
      const ground = this.groundHit(this.raycaster.ray);
      const groundDist = ground ? ground.distanceTo(this.raycaster.ray.origin) : Infinity;
      if (hit && hit.distance < groundDist + 1 && hit.object.userData.actor !== this.player) {
        const a = hit.object.userData.actor as Actor;
        this.hover.actor = a;
        const color = a.faction === 'hostile' ? 0xff4b3a : a.faction === 'animal' ? 0xf3b347 : 0x58f06a;
        (this.hoverRing.material as THREE.MeshBasicMaterial).color.setHex(color);
        this.hoverRing.visible = true;
        this.hoverRing.position.copy(a.pos).add(new THREE.Vector3(0, 0.07, 0));
        const s = a.rig instanceof QuadrupedRig && a.rig.height > 1.2 ? 1.6 : a.rig.height < 1 ? 0.9 : 1;
        this.hoverRing.scale.setScalar(s);
        tip = `${a.name}`;
        if (a.faction === 'hostile' || a.faction === 'companion') {
          tip += this.char.has('awareness') ? ` — ОЗ ${Math.max(0, a.hp)}/${a.maxHp}` : ` — ${this.healthWord(a)}`;
          if (this.char.has('awareness') && a.attack) tip += `, урон ${a.attack.dmg[0]}–${a.attack.dmg[1]}`;
        }
        if (a.faction === 'hostile' && this.combat?.isPlayerTurn) {
          const w = this.inv.weapon;
          const plan = this.combat.planPlayerAttack(a, this.aimMode ? 'head' : 'torso');
          if (plan) {
            const chance = this.combat.hitChance(this.player, a, w);
            if (this.aimMode) tip += `<br><span class="warn">Прицельно: +${AIM_AP} ОД, выбор части тела</span>`;
            cost = plan.total;
            const enough = plan.total <= this.player.ap;
            tip += `<br>Шанс попадания: ${chance}% · <span class="${enough ? '' : 'bad'}">ОД: ${plan.total}</span>`;
            if (w.ammo && !this.inv.count(w.ammo)) tip += '<br><span class="bad">Нет патронов</span>';
          } else tip += '<br><span class="bad">Не подобраться</span>';
        }
      } else if (ground) {
        const inter = this.raycaster.intersectObjects(this.world.interactables.map((i) => i.object), true)[0];
        if (inter && inter.distance < groundDist + 0.5) {
          const it = this.world.interactables.find((x) => {
            for (let o: THREE.Object3D | null = inter.object; o; o = o.parent) if (o === x.object) return true;
            return false;
          });
          if (it && this.mode === 'explore') {
            this.hover.inter = it;
            tip = it.name;
          }
        }
        const cell = this.nav.cellOf(ground.x, ground.z);
        if (this.nav.inBounds(cell[0], cell[1])) this.hover.cell = cell;
        if (!tip && this.mode === 'explore' && this.location.exits.some((e) => Math.hypot(ground.x - e.x, ground.z - e.z) < e.r)) {
          tip = '<span class="warn">Выход на карту мира</span>';
        }
      }
    }

    // Предпросмотр пути в бою.
    if (this.mode === 'combat' && this.combat?.isPlayerTurn && this.hover.cell && !this.hover.actor) {
      const key = `${this.hover.cell[0]},${this.hover.cell[1]},${this.player.ap},${this.player.pos.x.toFixed(1)},${this.player.pos.z.toFixed(1)}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        const path = this.combat.movePath(this.player, this.hover.cell);
        this.pathMarkers.count = 0;
        this.previewCost = 0;
        if (path && path.length) {
          const n = Math.min(path.length, 80);
          for (let k = 0; k < n; k++) {
            const c = this.nav.center(path[k][0], path[k][1]);
            this.pathMarkers.setMatrixAt(k, new THREE.Matrix4().makeTranslation(c.x, c.y + 0.06, c.z));
            this.pathMarkers.setColorAt(k, new THREE.Color(k < this.player.ap ? 0x58f06a : 0xff4b3a));
          }
          this.pathMarkers.count = n;
          this.pathMarkers.instanceMatrix.needsUpdate = true;
          this.pathMarkers.instanceColor!.needsUpdate = true;
          this.previewCost = path.length;
        }
      }
      if (this.previewCost > 0) {
        const enough = this.previewCost <= this.player.ap;
        tip = `<span class="${enough ? '' : 'bad'}">${this.previewCost} ОД</span>`;
        cost = this.previewCost;
      }
    } else {
      this.pathMarkers.count = 0;
      this.previewKey = '';
      this.previewCost = 0;
    }
    this.ui.tooltip(tip, this.mouseClient.x, this.mouseClient.y);
    this.ui.updateHud(this.combat?.isPlayerTurn ? cost : 0);
  }

  // ─── Игровой цикл ──────────────────────────────────────────────────────────

  private explorationAI(dt: number) {
    const p = this.player;
    for (const a of this.actors) {
      if (a === p || a.dead) continue;
      if (a.faction === 'hostile' && a.detectRadius && a.distanceTo(p) < a.detectRadius * this.detectFactor && this.mode === 'explore') {
        this.startCombat(false, a);
        return;
      }
      if (a.follow) {
        const d = a.distanceTo(a.follow);
        if (d > 40) a.place(a.follow.pos.x + 1, a.follow.pos.z + 1);
        else if (d > 3.2 && !a.moving) {
          const path = this.nav.findPathToRange(a.cell(this.nav), a.follow.cell(this.nav), 2);
          if (path && path.length) {
            a.speed = a.baseSpeed * (d > 8 ? 1.3 : 1);
            void a.moveAlong(this.nav.smooth(a.cell(this.nav), path).map(([i, j]) => this.nav.center(i, j)));
          }
        }
        continue;
      }
      if (a.wanderRadius > 0 && !a.moving && this.mode !== 'dialogue') {
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = 3 + Math.random() * 7;
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * a.wanderRadius;
          const tx = a.home.x + Math.cos(ang) * r;
          const tz = a.home.z + Math.sin(ang) * r;
          const path = this.nav.findPath(a.cell(this.nav), this.nav.cellOf(tx, tz), { maxCost: a.wanderRadius * 3 + 6 });
          if (path && path.length) {
            a.speed = a.baseSpeed * 0.42;
            void a.moveAlong(this.nav.smooth(a.cell(this.nav), path).map(([i, j]) => this.nav.center(i, j)));
          }
        }
      }
    }
    if (this.mode !== 'explore') return;
    if (this.location.id === 'arroyo' && !this.flags.has('dogFound') && this.actors.includes(this.dog) && this.dog.distanceTo(p) < 3.5) this.findDog();

    // Выход на карту мира: срабатывает, только если игрок сначала отошёл от зоны выхода.
    let inExit = false;
    let nearExit = false;
    for (const e of this.location.exits) {
      const d = Math.hypot(p.pos.x - e.x, p.pos.z - e.z);
      if (d < e.r) inExit = true;
      if (d < e.r + 1.5) nearExit = true;
    }
    if (!nearExit) this.exitArmed = true;
    else this.tip('exit');
    if (inExit && this.exitArmed) {
      p.stop();
      this.exitArmed = false;
      if (!this.location.onExit?.(this)) this.openWorldMap();
      return;
    }
    this.location.update?.(this, dt);
    this.chatter(dt);

    this.regenAcc += dt;
    if (this.regenAcc > (this.char.has('healer') ? 4 : 8)) {
      this.regenAcc = 0;
      if (this.char.hp < this.char.maxHp) {
        this.char.hp++;
        p.hp = this.char.hp;
      }
    }
  }

  // ─── Машина ────────────────────────────────────────────────────────────────

  carFuel = 0;
  trunk: Record<string, number> = {};

  /** Машина ждёт у въезда в любую локацию, куда на ней приехали. */
  private parkCar(def: LocationDef) {
    if (!this.flags.has('carOwned') || def.id === 'oilrig' || def.indoor) return;
    const [ex, ez] = def.entries.world ?? def.entries.default;
    // Ставим машину рядом с точкой въезда, на проходимой клетке.
    const cell = this.nav.nearestWalkable(...this.nav.cellOf(ex + 4, ez + 3));
    if (!cell) return;
    const p = this.nav.center(cell[0], cell[1]);
    const rot = Math.atan2(-ex, -ez);
    const car = highwayman(this.world);
    this.world.place(car, p.x, p.z, rot, 0);
    this.nav.blockRect(p.x, p.z, 1.2, 2.7, rot);
    this.world.interactable({ id: 'car', name: 'Хайвеймен', object: car, approach: new THREE.Vector3(p.x + 2, 0, p.z) });
  }

  refuelCar() {
    if (this.carFuel >= 100) {
      this.ui.log('Бак полон.');
      return;
    }
    if (!this.inv.remove('microcell')) {
      this.ui.log('Нужна микроядерная батарея.', 'warn');
      return;
    }
    this.carFuel = Math.min(100, this.carFuel + 20);
    this.ui.log(`Заряд машины: ${Math.round(this.carFuel)}%.`, 'good');
  }

  /** Ремонт машины: инжектор + Ремонт 50 (или механик за плату). */
  fixCar(byMechanic: boolean) {
    this.inv.remove('injector');
    this.flags.add('carOwned');
    this.carFuel = Math.max(this.carFuel, 40);
    this.addXp(byMechanic ? 300 : 500);
    this.ui.banner('МАШИНА НА ХОДУ', 2.5);
    this.ui.log('«Хайвеймен» снова на ходу! На карте мира он везёт в 2,5 раза быстрее. Заряд пополняется микроядерными батареями.', 'good');
    this.removeFromWorld('brokenCar');
    if (this.quests.car) this.quests.car.state = 'rewarded';
    this.parkCar(this.location);
  }

  /** Отключение охраны Сьерры: роботы и турели замирают. */
  private disableSierraGuards() {
    this.flags.add('sierraSecurityOff');
    this.addXp(400);
    for (const a of this.actors) {
      if (!SIERRA_GUARDS.includes(a.id) || a.dead) continue;
      a.dead = true;
      a.stop();
      a.rig.playDeath();
    }
  }

  private removeFromWorld(id: string) {
    const it = this.world.interactables.find((i) => i.id === id);
    if (!it) return;
    it.object.visible = false;
    this.removeInteractable(it);
  }

  // ─── Меню паузы, настройки, подсказки ──────────────────────────────────────

  settings: Settings = loadSettings();
  private pausedFrom: Mode = 'explore';

  applySettings() {
    audio.setVolumes(this.settings);
    this.r.applyQuality(this.settings.quality);
    saveSettings(this.settings);
  }

  /** Подсказка новичку — один раз за всё время, если подсказки включены. */
  tip(id: string) {
    if (!this.settings.tips || tipShown(id) || this.mode === 'menu') return;
    markTip(id);
    this.ui.showTip(TIPS[id]);
  }

  openPause() {
    if (this.mode !== 'explore' && this.mode !== 'combat') return;
    this.pausedFrom = this.mode;
    this.mode = 'pause';
    this.ui.closePanel();
    this.ui.tooltip(null);
    this.pauseMenu();
  }

  private pauseMenu() {
    this.ui.showPauseMenu({
      resume: () => this.resume(),
      save: () => this.ui.showSlots('save', (s) => {
        if (this.save(s)) this.resume();
      }, () => this.pauseMenu()),
      load: () => this.ui.showSlots('load', (s) => this.requestLoad(s), () => this.pauseMenu()),
      settings: () => this.ui.showSettings(this.settings, (st) => {
        this.settings = st;
        this.applySettings();
      }, () => this.pauseMenu()),
      quit: () => location.reload(),
      canSave: this.pausedFrom === 'explore' && this.countdown === null,
    });
  }

  resume() {
    if (this.mode !== 'pause') return;
    this.ui.hideScreen();
    this.mode = this.pausedFrom;
    this.lastTime = performance.now();
  }

  // ─── Живой мир: реплики жителей и спутников ───────────────────────────────

  private barkTimer = 6;
  private banterTimer = 40;

  private chatter(dt: number) {
    this.barkTimer -= dt;
    this.banterTimer -= dt;
    const p = this.player;
    if (this.barkTimer <= 0) {
      this.barkTimer = 7 + Math.random() * 9;
      const lines = LOCATION_BARKS[this.location.id];
      const near = this.actors.filter((a) => !a.dead && a !== p && a.faction === 'villager' && a.distanceTo(p) < 11 && !a.follow);
      if (lines && near.length) {
        const a = near[Math.floor(Math.random() * near.length)];
        this.ui.speech(a.pos, a.rig.height, lines[Math.floor(Math.random() * lines.length)]);
      }
    }
    if (this.banterTimer <= 0) {
      this.banterTimer = 50 + Math.random() * 60;
      const party = this.party.filter((a) => COMPANION_BANTER[a.id]);
      if (!party.length) return;
      const a = party[Math.floor(Math.random() * party.length)];
      const b = COMPANION_BANTER[a.id];
      const local = b.loc?.[this.location.id];
      const pool = local && Math.random() < 0.65 ? local : b.any;
      const line = pool[Math.floor(Math.random() * pool.length)];
      this.ui.speech(a.pos, a.rig.height, line, '#a8ffb4');
      this.ui.log(`${a.name}: «${line}»`);
    }
  }

  /** Спутники растут вместе с героем. */
  private levelCompanions(levels: number) {
    const all = new Set([...this.companionActors.values(), this.dog]);
    for (const a of all) {
      if (a.dead) continue;
      a.maxHp += 8 * levels;
      a.hp = Math.min(a.maxHp, a.hp + 8 * levels);
      a.skill = Math.min(95, a.skill + 4 * levels);
    }
    if (this.party.length) this.ui.log('Спутники тоже стали опытнее.', 'good');
  }

  // ─── Скрытность, кража, карма ──────────────────────────────────────────────

  sneaking = false;
  karma = 0;

  toggleSneak() {
    if (this.mode !== 'explore') return;
    this.tip('sneak');
    this.sneaking = !this.sneaking;
    this.player.speed = this.player.baseSpeed * (this.sneaking ? 0.55 : 1);
    this.ui.log(this.sneaking ? `Вы крадётесь. Скрытность: ${this.char.skill('sneak')}%.` : 'Вы идёте открыто.');
    this.ui.updateHud();
  }

  /** Во сколько раз сокращается дальность, на которой враги замечают героя. */
  get detectFactor() {
    const night = this.location.indoor ? 0 : this.r.night;
    let f = 1 - night * 0.2;
    if (this.sneaking) f *= Math.max(0.25, 1 - this.char.skill('sneak') / 130);
    return f;
  }

  /** Бросок на Скрытность (модификатор — сложность). */
  sneakCheck(mod: number) {
    if (!this.sneaking) return false;
    return Math.random() * 100 < this.char.skill('sneak') + mod;
  }

  addKarma(n: number) {
    this.karma += n;
    if (n >= 20) this.ui.log(`Карма растёт (+${n}).`, 'good');
    else if (n <= -10) this.ui.log(`Карма падает (${n}).`, 'bad');
  }

  get karmaTitle() {
    const k = this.karma;
    return k >= 300 ? 'Защитник пустоши' : k >= 100 ? 'Добрая душа' : k <= -300 ? 'Бич пустоши' : k <= -100 ? 'Негодяй' : 'Странник';
  }

  /** Карманная кража у мирного жителя. */
  attemptSteal(a: Actor) {
    if (this.flags.has(`robbed:${a.id}`)) {
      this.ui.log(`У ${a.name.toLowerCase()} больше нечего взять.`);
      return;
    }
    const chance = Math.max(5, Math.min(90, this.char.skill('steal') - 15 + (this.sneaking ? 15 : 0)));
    if (Math.random() * 100 < chance) {
      this.flags.add(`robbed:${a.id}`);
      const stock = TRADERS[a.dialogue ?? ''] ? this.traderStock(a.dialogue!) : null;
      const goods = stock ? Object.entries(stock).filter(([id, n]) => id !== 'caps' && n > 0) : [];
      if (goods.length && Math.random() < 0.6) {
        const [id] = goods[Math.floor(Math.random() * goods.length)];
        stock![id]--;
        if (stock![id] <= 0) delete stock![id];
        this.giveItem(id);
      } else this.giveItem('caps', randInt(5, 40));
      this.ui.log(`Ловко! ${a.name} ничего не заметил. [Кража ${chance}%]`, 'good');
      this.addKarma(-15);
      this.addXp(25);
    } else {
      this.ui.log(`${a.name} хватает вас за руку! «Вор!»`, 'bad');
      this.addKarma(-10);
      this.turnHostile([a.id]);
    }
  }

  private wasdMove(dt: number) {
    const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const s = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    if (!f && !s) return;
    const sy = Math.sin(this.camYaw);
    const cy = Math.cos(this.camYaw);
    const dir = new THREE.Vector3(-sy * f + cy * s, 0, -cy * f - sy * s).normalize();
    this.clickToken++;
    this.player.steer(dir, dt, this.nav);
  }

  private updateCamera(dt: number) {
    if (this.keys.has('KeyQ')) this.camYaw += dt * 1.6;
    if (this.keys.has('KeyE')) this.camYaw -= dt * 1.6;
    let target: THREE.Vector3;
    let dist = this.camDist;
    let pitch = this.camPitch;
    if (this.mode === 'menu') {
      this.camYaw += dt * 0.04;
      target = new THREE.Vector3(0, 1, -2);
      dist = 34;
      pitch = 0.42;
    } else if (this.mode === 'dialogue' && this.dialogueActor) {
      target = this.player.pos.clone().lerp(this.dialogueActor.pos, 0.5).add(new THREE.Vector3(0, 1.3, 0));
      dist = 6.5;
      pitch = 0.3;
    } else {
      target = this.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    }
    const k = 1 - Math.exp(-dt * 6);
    this.camTarget.lerp(target, k);
    this.camCur.dist += (dist - this.camCur.dist) * k;
    this.camCur.pitch += (pitch - this.camCur.pitch) * k;
    const d = this.camCur.dist;
    const cp = Math.cos(this.camCur.pitch);
    const cam = this.r.camera;
    cam.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * cp * d,
      this.camTarget.y + Math.sin(this.camCur.pitch) * d,
      this.camTarget.z + Math.cos(this.camYaw) * cp * d,
    );
    const floor = heightAt(cam.position.x, cam.position.z) + 1.2;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.camTarget);
  }

  private steps = new WeakMap<Actor, { x: number; z: number; acc: number }>();

  /** Шаги: звук через каждые полшага пройденного пути. */
  private footsteps() {
    for (const a of this.actors) {
      if (a.dead) continue;
      let st = this.steps.get(a);
      if (!st) {
        st = { x: a.pos.x, z: a.pos.z, acc: 0 };
        this.steps.set(a, st);
      }
      const d = Math.hypot(a.pos.x - st.x, a.pos.z - st.z);
      st.x = a.pos.x;
      st.z = a.pos.z;
      if (d > 2) continue;
      st.acc += d;
      const stride = Math.max(0.35, a.rig.height * 0.45);
      if (st.acc > stride) {
        st.acc = 0;
        audio.play('step', a.pos, a === this.player ? 0.6 : a.rig.height > 1.2 ? 0.35 : 0.18);
      }
    }
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.mode !== 'map' && this.mode !== 'pause') {
      this.time += dt;
      tickTimers(dt);
      if (this.mode !== 'menu') this.days += dt / 1440;
    }
    if (this.location.indoor) this.r.setIndoor();
    else this.r.setTime(this.hour, this.location.nightAmbient);
    this.radiation(dt);
    this.tickCountdown(dt);

    if (this.mode === 'explore') {
      this.wasdMove(dt);
      this.explorationAI(dt);
    } else if (this.mode === 'dialogue' || this.mode === 'menu') {
      this.explorationAI(dt);
    }
    if (this.mode === 'combat' && this.combat?.active === this.player && !this.combat.busy && this.pendingAttack) this.onPlayerTurn();

    for (const a of this.actors) a.update(dt);
    this.updateCamera(dt);
    this.updateHover();

    if (this.moveMarker.visible) {
      this.moveMarkerT += dt;
      this.moveMarker.scale.setScalar(1 + this.moveMarkerT * 1.5);
      (this.moveMarker.material as THREE.MeshBasicMaterial).opacity = 1 - this.moveMarkerT / 0.6;
      if (this.moveMarkerT > 0.6) this.moveMarker.visible = false;
    }

    this.footsteps();
    audio.listener.x = this.camTarget.x;
    audio.listener.z = this.camTarget.z;
    audio.updateAmbience(this.r.night, this.world.nearestFlame(this.camTarget), this.time);
    audio.setMusic(this.mode === 'combat' ? 'combat' : this.mode === 'dead' ? 'off' : 'explore');
    this.world.update(dt, this.time, this.camTarget, this.r.sunDir);
    this.effects.update(dt);
    this.ui.update(dt, this.r.camera);
    this.r.followShadow(this.camTarget);
    const danger = this.mode === 'combat' ? 1 : 0;
    this.r.danger += (danger - this.r.danger) * Math.min(1, dt * 3);
    this.r.render(this.time);
  }
}
