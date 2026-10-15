import { Application, Graphics, Text } from 'pixi.js';
import './style.css';

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#app');
  const status = document.querySelector<HTMLElement>('#status');
  if (!host) throw new Error('게임 컨테이너를 찾을 수 없습니다.');

  const app = new Application();
  try {
    await app.init({
      resizeTo: window,
      background: '#dce8ce',
      preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: false,
    });
  } catch (error) {
    if (status) status.textContent = '게임 화면을 시작하지 못했어요. WebGL 지원을 확인해 주세요.';
    throw error;
  }

  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-label', 'Paw Haven 기본 로비 캔버스');
  status?.remove();

  const ground = new Graphics();
  const title = new Text({
    text: 'Paw Haven',
    style: { fontFamily: 'Georgia, serif', fontSize: 38, fill: '#344b38' },
  });
  title.anchor.set(0.5);
  const subtitle = new Text({
    text: 'Welcome Home',
    style: { fontFamily: 'Georgia, serif', fontSize: 18, fill: '#52664b' },
  });
  subtitle.anchor.set(0.5);
  app.stage.addChild(ground, title, subtitle);

  const layout = (): void => {
    const { width, height } = app.screen;
    ground.clear().rect(0, height * 0.65, width, height * 0.35).fill('#b7ce9c');
    title.position.set(width / 2, height * 0.42);
    title.scale.set(Math.min(1, (width - 32) / 260));
    subtitle.position.set(width / 2, height * 0.42 + 42);
  };
  app.renderer.on('resize', layout);
  layout();

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.renderer.off('resize', layout);
      app.destroy(true, { children: true });
    });
  }
}

void bootstrap().catch(console.error);

