import { bindText } from './settings/i18n';
import { Game } from './game/Game';
import './style.css';

const host = document.querySelector<HTMLElement>('#app');
if (!host) throw new Error('게임 컨테이너를 찾을 수 없습니다.');
const status = document.querySelector<HTMLElement>('#status');
if (status) bindText(status, 'loading');
const game = new Game();
void game.start(host).catch((error: unknown) => {
  game.destroy();
  let status = document.querySelector<HTMLElement>('#status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'status';
    status.setAttribute('role', 'alert');
    host.appendChild(status);
  }
  bindText(status, 'loadError');
  console.error(error);
});
const leave = (event: PageTransitionEvent): void => { if (!event.persisted) game.destroy(); };
window.addEventListener('pagehide', leave);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('pagehide', leave);
  game.destroy();
});


