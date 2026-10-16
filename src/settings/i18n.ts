export type Language = 'en' | 'ko';
const en = {
  Pets: 'Pets', preset: 'Preset', save: 'Save', corgi: 'Corgi', presetUnsaved: 'Unsaved changes', presetSaved: 'Saved', presetLoaded: 'Loaded', presetEmpty: 'Empty slot — press Save to store this look.', petUnavailable: 'This pet is not available yet.',
  settings: 'Settings', Sound: 'Sound', Controls: 'Controls', Display: 'Display', Language: 'Language', Account: 'Account', About: 'About',
  master: 'Master', bgm: 'BGM', sfx: 'SFX', mute: 'Mute all', previewBgm: 'Preview BGM', previewSfx: 'Preview SFX',
  closeSettings: 'Close settings', settingsCategories: 'Settings categories', guest: 'Playing as Guest', accountSoon: 'Account login and cloud saves are coming soon.', login: 'Login',
  controlSize: 'Control size', leftHanded: 'Left-handed layout', vibration: 'Vibration', keyboardHelp: 'Move: A/D or arrows · Jump: Space · Dash: Shift · Attack: J',
  effects: 'Visual effects', camera: 'Smooth camera', languageHint: 'Changes apply immediately and are saved on this device.',
  aboutText: 'A cozy home for little companions.', version: 'Version 0.1.0 · Prototype',
  character: 'Character', friends: 'Friends', shop: 'Shop', play: 'Play', attack: 'Attack', dash: 'Dash', jump: 'Jump', victory: 'Victory!', start: 'START', finish: 'FINISH',
  joystick: 'Movement joystick', gameControls: 'Game controls', close: 'Close', Hat: 'Hat', Body: 'Body', Acc: 'Acc', Etc: 'Etc', none: 'None',
  customize: 'Character customization', categories: 'Item categories', items: 'Items', welcomeHome: 'Welcome Home', touchStart: 'Tap to start', greet: 'Welcome! ♡',
  loading: 'Getting the game ready…', loadError: 'Could not open the garden. Check your connection and WebGL support, then refresh.',
  'state.NOTICE': 'Your corgi noticed you', 'state.APPROACH': 'Your corgi is coming closer', 'state.GREET': 'A happy greeting',
  'state.IDLE': 'Relaxing', 'state.WANDER': 'Exploring the garden', 'state.REST': 'Taking a rest', 'state.SLEEP': 'Sleeping peacefully',
  'state.OBSERVE': 'Looking around', 'state.JUMP': 'Jumping', 'state.LAND': 'Landing softly', 'state.EMOTE': 'Feeling happy',
} as const;
export type TextKey = keyof typeof en;
const ko: Record<TextKey, string> = {
  Pets: '동물', preset: '프리셋', save: '저장', corgi: '코기', presetUnsaved: '저장하지 않은 변경사항', presetSaved: '저장했어요', presetLoaded: '불러왔어요', presetEmpty: '빈 슬롯이에요. 저장을 눌러 조합을 보관하세요.', petUnavailable: '아직 사용할 수 없는 동물이에요.',
  settings: '설정', Sound: '사운드', Controls: '조작', Display: '화면', Language: '언어', Account: '계정', About: '정보',
  master: '전체', bgm: '배경음', sfx: '효과음', mute: '전체 음소거', previewBgm: '배경음 미리듣기', previewSfx: '효과음 미리듣기',
  closeSettings: '설정 닫기', settingsCategories: '설정 항목', guest: '게스트로 플레이 중', accountSoon: '로그인과 클라우드 저장은 추후 지원됩니다.', login: '로그인',
  controlSize: '버튼 크기', leftHanded: '왼손잡이 배치', vibration: '진동', keyboardHelp: '이동: A/D 또는 방향키 · 점프: Space · 대시: Shift · 공격: J',
  effects: '화면 효과', camera: '부드러운 카메라', languageHint: '변경 즉시 적용되며 이 기기에 저장됩니다.',
  aboutText: '작은 친구들을 위한 포근한 공간.', version: '버전 0.1.0 · 프로토타입',
  character: '캐릭터', friends: '친구', shop: '상점', play: '플레이', attack: '공격', dash: '대시', jump: '점프', victory: '완주!', start: '출발', finish: '도착',
  joystick: '이동 조이스틱', gameControls: '게임 조작', close: '닫기', Hat: '모자', Body: '상의', Acc: '장식', Etc: '기타', none: '없음',
  customize: '캐릭터 꾸미기', categories: '아이템 분류', items: '아이템', welcomeHome: '집에 온 걸 환영해요', touchStart: '화면을 터치해 시작하세요', greet: '반가워! ♡',
  loading: '게임을 준비하고 있어요…', loadError: '정원을 열지 못했어요. 네트워크와 WebGL 지원을 확인한 뒤 새로고침해 주세요.',
  'state.NOTICE': '코기가 당신을 알아봤어요', 'state.APPROACH': '코기가 다가와요', 'state.GREET': '반갑게 인사해요',
  'state.IDLE': '느긋하게 쉬고 있어요', 'state.WANDER': '정원을 산책해요', 'state.REST': '잠시 쉬고 있어요', 'state.SLEEP': '새근새근 자고 있어요',
  'state.OBSERVE': '주변을 둘러봐요', 'state.JUMP': '폴짝 뛰어올라요', 'state.LAND': '사뿐히 내려앉아요', 'state.EMOTE': '기분을 표현해요',
};
let language: Language = 'en';
const listeners = new Set<() => void>();
export const getLanguage = (): Language => language;
export const t = (key: TextKey): string => (language === 'ko' ? ko : en)[key];
export function bindText(element: HTMLElement, key: TextKey): void { element.setAttribute('data-i18n', key); element.textContent = t(key); }
export function bindAria(element: HTMLElement, key: TextKey): void { element.setAttribute('data-i18n-aria', key); element.setAttribute('aria-label', t(key)); }
export function onLanguageChange(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setLanguage(next: Language): void {
  language = next;
  if (typeof document !== 'undefined') {
    if (document.documentElement) document.documentElement.lang = next;
    document.querySelectorAll?.<HTMLElement>('[data-i18n]').forEach(element => { element.textContent = t(element.getAttribute('data-i18n') as TextKey); });
    document.querySelectorAll?.<HTMLElement>('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria') as TextKey)); });
  }
  listeners.forEach(listener => listener());
}