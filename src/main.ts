import './style.css';
import { Game } from './game/game';

const game = new Game(document.getElementById('app')!);

if (Game.consumeLoadFlag() && game.loadFromStorage()) {
  // Загрузка сохранения после перезапуска страницы.
} else {
  const showMenu = () =>
    game.ui.showMainMenu(
      Game.hasSave(),
      () => game.ui.showCreation((c) => game.beginNewGame(c)),
      () => game.requestLoad(),
    );
  showMenu();
}

// Доступ из консоли для отладки.
(window as unknown as { game: Game }).game = game;
