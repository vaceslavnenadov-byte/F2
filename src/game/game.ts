import * as THREE from 'three';
import { clamp, randInt } from '../core/math';
import { tickTimers } from '../core/clock';
import { Renderer } from '../engine/renderer';
import { Effects } from '../engine/effects';
import { World, type Interactable } from '../world/world';
import type { Cell } from '../world/nav';
import { heightAt } from '../world/terrain';
import { LOCATIONS, WORLD_MAP } from '../world/locations';
import { ARROYO, NAGOR_HOME } from '../world/locations/arroyo';
import { makeEncounter, ENCOUNTER_NAMES, type EncounterKind } from '../world/locations/encounter';
import type { LocationDef } from '../world/locations/types';
import { Actor } from '../entities/actor';
import { HumanoidRig, LizardRig, QuadrupedRig } from '../entities/rigs';
import { Character, type SkillId } from './character';
import { Inventory, ITEMS, TRADERS, priceMult, itemPrice } from './items';
import { Combat } from './combat';
import { DIALOGUES, resolveText, type DialogueDef, type DialogueOption } from './dialogues';
import { QUESTS, QUEST_GOALS, type QuestState } from './quests';
import { dog as makeDog, sulik as makeSulik } from './bestiary';
import { UI } from '../ui/ui';
import { showWorldMap } from '../ui/worldmap';

type Mode = 'menu' | 'explore' | 'combat' | 'dialogue' | 'dead' | 'map';

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
      rig: new HumanoidRig({ skin: '#c48a60', cloth: '#6e5038', hair: '#3a2516', build: 1.05 }),
      hp: 30,
      ap: 8,
      ac: 5,
      speed: 4,
    });
    this.dog = makeDog();

    this.enterLocation(ARROYO, 'default');
    this.bindInput();
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
    const party = this.actors.filter((a) => this.isInParty(a));
    for (const a of this.actors) {
      a.stop();
      this.r.scene.remove(a.object);
      // Персистентные актёры (игрок, отряд, пёс) живут между локациями.
      if (a !== this.player && a !== this.dog && !party.includes(a)) {
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
    if (def.id === 'encounter') this.locState.encounter = { dead: [] };
    this.locState[def.id] ??= { dead: [] };
    this.world = new World(def);
    this.r.scene.add(this.world.group);

    const [x, z] = at ?? def.entries[entry] ?? def.entries.default;
    this.addActor(this.player, x, z);
    party.forEach((a, i) => this.addActor(a, x + Math.cos(i * 2 + 1) * 1.8, z + Math.sin(i * 2 + 1) * 1.8));
    def.spawn(this);
    this.camTarget.copy(this.player.pos);
    this.exitArmed = false;
  }

  discover(id: string) {
    if (this.discovered.has(id)) return;
    this.discovered.add(id);
    this.ui.log(`На карте отмечено: ${WORLD_MAP[id].label}.`, 'warn');
  }

  dateText(days = this.days) {
    const d = new Date(2241, 6, 25 + Math.floor(days));
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  private openWorldMap() {
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
      dateText: (d) => this.dateText(d),
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
    this.ui.banner('АРРОЙО', 2.5);
  }

  private startPlaying() {
    this.mode = 'explore';
    this.player.hp = this.char.hp;
    this.player.maxHp = this.char.maxHp;
    this.player.ap = this.player.maxAp = this.char.maxAp;
    this.updatePlayerWeapon();
    this.camTarget.copy(this.player.pos);
    this.ui.showHud(true);
    this.ui.updateHud();
  }

  save() {
    if (this.mode !== 'explore') {
      this.ui.log('Сохраниться можно только вне боя и диалога.', 'warn');
      return;
    }
    const data: SaveData = {
      v: 2,
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
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.ui.log('Игра сохранена.', 'good');
    } catch {
      this.ui.log('Не удалось сохранить игру.', 'bad');
    }
  }

  static hasSave(): boolean {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      return d?.v === 2;
    } catch {
      return false;
    }
  }

  /** Загрузка через перезапуск страницы — мир гарантированно возвращается в исходное состояние. */
  requestLoad() {
    if (!Game.hasSave()) {
      this.ui.log('Сохранений нет.', 'warn');
      return;
    }
    try {
      sessionStorage.setItem(LOAD_FLAG, '1');
    } catch {
      /* без sessionStorage просто откроется меню */
    }
    location.reload();
  }

  static consumeLoadFlag(): boolean {
    try {
      const v = sessionStorage.getItem(LOAD_FLAG);
      sessionStorage.removeItem(LOAD_FLAG);
      return v === '1';
    } catch {
      return false;
    }
  }

  loadFromStorage(): boolean {
    let d: SaveData | null;
    try {
      d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
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
    // Восстанавливаем отряд до входа в локацию, чтобы он появился рядом с игроком.
    const restored: Actor[] = [];
    if (this.flags.has('dogFound') && this.quests.dog?.state !== 'rewarded' && !this.flags.has('dogDead')) restored.push(this.dog);
    if (this.flags.has('sulikJoined') && !this.flags.has('sulikDead')) restored.push(makeSulik());
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
      this.ui.log(`Уровень ${this.char.level}! Очки навыков: +${this.char.skillPointsPerLevel}. Распредели их в окне персонажа (C).`, 'warn');
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
      }
    }
  }

  completeDogQuest() {
    if (!this.quests.dog) this.quests.dog = { state: 'done', progress: 0 };
    this.quests.dog.state = 'rewarded';
    this.giveItem('powder', 2);
    this.addXp(250);
    this.dog.follow = null;
    this.dog.faction = 'animal';
    this.dog.home.set(NAGOR_HOME.x - 1, heightAt(NAGOR_HOME.x - 1, NAGOR_HOME.z + 1), NAGOR_HOME.z + 1);
    this.dog.wanderRadius = 3;
    (this.dog.rig as QuadrupedRig).wag = 0.3;
  }

  recruitSulik() {
    const s = this.actors.find((a) => a.id === 'sulik');
    if (!s) return;
    this.flags.add('sulikJoined');
    this.joinParty(s);
    this.ui.log('Сулик присоединяется к отряду.', 'good');
    this.ui.banner('СУЛИК В ОТРЯДЕ', 2);
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
    this.updatePlayerWeapon();
    this.ui.log(`Сделка с торговцем ${TRADERS[id].name} заключена.`, 'good');
    this.ui.updateHud();
    return true;
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
    if (!def.heal || !this.inv.count(id)) return;
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
    const amount = randInt(def.heal[0], def.heal[1]);
    const healed = Math.min(amount, this.char.maxHp - this.char.hp);
    this.char.hp += healed;
    this.player.hp = this.char.hp;
    this.inv.remove(id);
    this.ui.floatText(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${healed}`, '#7dff8a');
    this.ui.log(`${def.name}: восстановлено ${healed} ОЗ.`, 'good');
    this.ui.updateHud();
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
    } else target.hp -= dmg;
    const isLizard = target.rig instanceof LizardRig;
    this.effects.hit(target, attacker.pos, isLizard ? new THREE.Color(0.25, 0.3, 0.05) : undefined);
    this.ui.floatText(target.pos.clone().setY(target.pos.y + target.rig.height + 0.3), `−${dmg}`, target === this.player ? '#ff5a4a' : target.faction === 'companion' ? '#ff9a6a' : '#ffd060');
    target.rig.playHit();
    if (target.hp <= 0) this.kill(target);
    this.ui.updateHud();
  }

  private kill(target: Actor) {
    target.dead = true;
    target.stop();
    target.rig.playDeath();
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
    if (target.tag) {
      this.questKills[target.tag] = (this.questKills[target.tag] ?? 0) + 1;
      this.updateKillQuests();
    }
  }

  private gameOver() {
    this.mode = 'dead';
    this.ui.log('Вы погибли.', 'bad');
    this.combat?.abort();
    setTimeout(() => {
      this.ui.showHud(false);
      this.ui.showGameOver(Game.hasSave() ? () => this.requestLoad() : null, () => location.reload());
    }, 1800);
  }

  // ─── Диалоги ───────────────────────────────────────────────────────────────

  private openDialogue(a: Actor) {
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
    if (it.id === 'temple') {
      this.ui.log('Храм Испытаний. Ты уже прошёл его — каменная дверь запечатана до следующего Избранного.');
    }
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
    if (this.mode === 'menu' || this.mode === 'dialogue' || this.mode === 'dead' || this.mode === 'map') return;
    if (this.ui.panel) {
      this.ui.closePanel();
      return;
    }
    const h = this.hover;
    if (this.mode === 'combat') {
      if (!this.combat || !this.combat.isPlayerTurn) return;
      if (h.actor && h.actor.faction === 'hostile' && !h.actor.dead) void this.combat.playerAttack(h.actor);
      else if (h.cell) void this.combat.playerMove(h.cell);
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
      if (await this.walkTo(a.pos, 2.6, token)) this.interactActor(a);
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
    if (this.mode === 'dialogue') {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.pickOption(n - 1);
      return;
    }
    switch (e.code) {
      case 'KeyI': this.ui.togglePanel('inv'); break;
      case 'KeyC': this.ui.togglePanel('cha'); break;
      case 'KeyP': this.ui.togglePanel('pip'); break;
      case 'Escape': this.ui.closePanel(); break;
      case 'Space': e.preventDefault(); this.endTurn(); break;
      case 'KeyF': this.requestCombat(); break;
      case 'KeyH':
        this.helpHidden = !this.helpHidden;
        this.ui.showHud(this.mode !== 'dead');
        break;
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
        if (a.faction === 'hostile' || a.faction === 'companion') tip += ` — ${this.healthWord(a)}`;
        if (a.faction === 'hostile' && this.combat?.isPlayerTurn) {
          const w = this.inv.weapon;
          const plan = this.combat.planPlayerAttack(a);
          if (plan) {
            const chance = this.combat.hitChance(this.player, a, w);
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
      if (a.faction === 'hostile' && a.detectRadius && a.distanceTo(p) < a.detectRadius && this.mode === 'explore') {
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
    if (inExit && this.exitArmed) {
      p.stop();
      this.openWorldMap();
      return;
    }

    this.regenAcc += dt;
    if (this.regenAcc > 8) {
      this.regenAcc = 0;
      if (this.char.hp < this.char.maxHp) {
        this.char.hp++;
        p.hp = this.char.hp;
      }
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

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.mode !== 'map') {
      this.time += dt;
      tickTimers(dt);
    }

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

    this.world.update(dt, this.time, this.camTarget);
    this.effects.update(dt);
    this.ui.update(dt, this.r.camera);
    this.r.followShadow(this.camTarget);
    const danger = this.mode === 'combat' ? 1 : 0;
    this.r.danger += (danger - this.r.danger) * Math.min(1, dt * 3);
    this.r.render(this.time);
  }
}
