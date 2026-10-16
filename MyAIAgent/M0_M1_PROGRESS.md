# M0 · M1 완료 기록

날짜: 2026-10-16

## Implemented

- M0: PixiJS Application과 Boot → Preload → Lobby 씬 흐름, 로딩 진행률, 초기화 실패 안내
- 씬 교체 시 이전 컨테이너와 자식 제거, 버튼 이벤트 및 ticker/resize/visibility 이벤트 정리
- 비활성 탭에서 ticker 정지, 복귀 시 재개
- M1: 코기 원본 분석, 투명 프로토타입 프레임 준비, idle 8프레임·walk 8프레임 재생
- 공통 Animal 및 AnimalConfig로 외형 데이터와 이동 코드 분리
- 좌우 방향 전환, 고정 지면 정렬, 화면 경계 제한 및 리사이즈 후 위치 보정
- 쉬기/걷기 버튼으로 대기와 왕복 이동 확인 (M3 자율 행동 AI는 미구현)
- 요청에 따라 16종 전체 행동 마스터 아트 시트 추가: Idle, Walk, Run, Jump, Fall, Land, Double Jump, Attack, Hit, Die, Skill, Emote, Direction, Climb, Push, Hurt Loop

## Modified Files

- src/game/Game.ts, SceneManager.ts, scenes/*: 씬과 생명주기
- src/animals/AnimalConfig.ts, Animal.ts, loadCorgi.ts: 동물 데이터, 애니메이션, 이동 및 프레임 로더
- src/main.ts, src/style.css, index.html: 게임 진입점과 반응형 조작 UI
- public/assets/characters/corgi/corgi-idle-walk.png, frames.json: 게임용 프로토타입 텍스처 및 실제 좌표
- Resources/Corgi_Action_Art_Sheet.png: 전체 행동 참고용 마스터
- Resources/corgi-actions.json: 행동별 준비 상태
- tests/animal.test.mjs, package.json: 검증 및 테스트 명령
- MyAIAgent/*: 관련 요구사항 및 진행 기록

## Verification

- npm test: 3개 통과
  - 120초에 해당하는 이동 시뮬레이션으로 경계 유지, 양방향 반전, 리사이즈, 대기 시 위치 고정
  - 두 애니메이션의 8개 프레임 좌표가 이미지 범위 안에 있고 서로 분리되는지 확인
  - 씬 교체/종료 시 이전 자식 제거, 리사이즈 전달, 중복 destroy 안전성
- npm run build: strict 타입 검사와 프로덕션 빌드 통과
- 브라우저: 코기 렌더링, 대기/걷기 프레임 변화, 좌우 반전, 버튼 동작 확인
- 1280×720, 390×844, 844×390, 320×568 화면 크기에서 캔버스·코기·버튼 표시 확인
- 수집된 브라우저 오류·경고 없음
- 실제 모바일 기기 터치 및 성능은 미검증

## Known Issues

- 코기 게임용 이미지는 원본을 참고해 내장 image_gen으로 준비한 프로토타입 아트다. 최종 아트 확정은 아니다.
- 런타임 텍스처는 알파 경계를 분석해 1983×793 이미지에서 16개 프레임 좌표를 추출했다. 각 프레임을 256×240 논리 캔버스 안에 중앙/바닥 정렬해 재생한다.
- 전체 16종은 마스터 아트에 포함되어 있다. Jump 등 나머지 14종의 투명 프레임 분리·타이밍·게임 동작 연결은 미완료이며, 시트 제목의 숫자와 실제 포즈 수도 추가 검증이 필요하다.
- 고양이, 자율 행동 AI, 환영 시퀀스, 쓰다듬기, 사운드 재생은 미구현이다.

## Next Step

M2: 공통 Animal 구조로 턱시도 고양이 추가. 이후 M3 행동 AI 진행.
전체 행동 아트의 존재와 해당 게임 기능의 구현 완료는 구분해 관리한다.

## 이미지 생성 기록

- 도구: built-in image_gen
- 원본: Resources/Corgi_Art_Sheet.png (변경하지 않음)
- 선택 결과: public/assets/characters/corgi/corgi-idle-walk.png, Resources/Corgi_Action_Art_Sheet.png
- 전체 시트 투명화 후속 결과는 배경 제거 품질이 충족되지 않아 채택하지 않았다.

### 대기·걷기 준비 프롬프트

Edit the supplied Corgi_Art_Sheet into a clean usable prototype sprite sheet. Preserve the exact adorable orange-and-white corgi identity, chubby body, huge head, short legs, warm soft detailed pixel style. Only idle and walk are needed. Transparent alpha background, no ground shadows, no background glow, no text, no labels, no panels. Landscape canvas, exactly 2 horizontal rows of 8 equally spaced cells each (16 full-body corgis total). Top row: 8 sitting idle breathing/blinking subtle poses, always looking right three-quarter, same size. Bottom row: 8 distinct chronological WALK cycle frames facing right: contact, down, passing, up, opposite contact, down, passing, up; walking, not running. Each corgi fully isolated in its own equal grid cell with ample empty transparent margins. Same anatomical scale in every frame; paws on same baseline within each row; ears same height except subtle breathing. Every cell centered. Never crop any ear, tail, paw. No extra rows, no extra animals. Remove every part of the source except the character style and identity. This image will be sampled as two rows of eight rectangular textures in a PixiJS prototype.

### 대기·걷기 경계 정리 프롬프트

Clean this sprite atlas for use in game. Keep the exact same 16 corgi poses, 8 columns and 2 rows. Remove colored edge halos and background remnants outside the animals. Preserve character identity, orange/white fur, pink inner ears and black nose. True transparent alpha, ample separation and aligned paw bottoms. No text, shadows or glow.

### 전체 행동 마스터 프롬프트

Create a COMPLETE expanded action reference sheet of the SAME corgi character in the supplied Corgi_Art_Sheet.png. The user requires ALL actions prepared together, not only idle and walk. Preserve its approved orange-and-white corgi identity, big expressive head, short legs, large upright ears, tiny tail, chubby body, warm richly shaded pixel-art game style. Landscape sheet on dark charcoal background with thin dividers and clearly readable white uppercase pixel-font action titles. Make sixteen action panels, exactly this layout:
Row 1 IDLE (6) left, WALK (8) right.
Row 2 RUN (8) left, JUMP (8) right.
Row 3 FALL (4), LAND (4), DOUBLE JUMP (6).
Row 4 ATTACK (6), HIT (4), DIE (6).
Row 5 SKILL (6) left, EMOTE (6) right.
Row 6 DIRECTION (4), CLIMB (6), PUSH (4), HURT LOOP (4).
Render actual distinct chronological frames per action, with consistent character dimensions and facial identity. Idle breathing/blinking, walk alternating grounded footfalls, run stretched bounding stride, jump crouch-launch-rise-apex-fall, fall legs out, land contact-squash-recovery, double jump a distinct tucked midair second leap, attack playful paw swipe, hit cute startled recoil, die pretend faint non-graphic, skill quick dash, emote joyful/heart/curious/grooming/surprised/content expressions, direction front-back-left-right, climb alternating paws on a neutral post, push a small wooden crate, hurt loop gentle dizzy wobble. Distinguish walk from run. Complete non-overlapping silhouettes and consistent ground baseline; no cropped ears or paws. Match the original sheet's coherent organization and drawing quality. Labels must be correctly spelled; do NOT omit the jump, landing, double jump, attack, and emote sections. This is a comprehensive master art reference; no UI, no watermark.
