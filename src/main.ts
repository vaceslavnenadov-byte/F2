import './style.css';
import { Game } from './game/game';
import { LOCATIONS } from './world/locations';
import { makeEncounter } from './world/locations/encounter';

const game = new Game(document.getElementById('app')!);

const showMenu = (): void =>
  game.ui.showMainMenu(
    Game.hasSave(),
    () => game.ui.showCreation((c) => game.beginNewGame(c)),
    () => game.ui.showSlots('load', (slot) => game.requestLoad(slot), showMenu),
    () => game.ui.showSettings(game.settings, (s) => {
      game.settings = s;
      game.applySettings();
    }, showMenu),
  );

const slot = Game.consumeLoadFlag();
if (!(slot && game.loadFromStorage(slot))) showMenu();

// Доступ из консоли для отладки.
(window as unknown as { game: Game }).game = game;
(window as unknown as { LOCS: typeof LOCATIONS }).LOCS = LOCATIONS;
(window as unknown as { makeEnc: typeof makeEncounter }).makeEnc = makeEncounter;
