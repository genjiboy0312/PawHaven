# 16:9 로비 UI 및 자율 생활 개편

날짜: 2026-10-16

## Implemented

- 타이틀의 코기 제거. 현재는 제목·터치 안내와 단색 배경만 표시하며 추후 타이틀 이미지로 확장 가능
- 로비 상단 게임 제목·Welcome Home 텍스트 제거
- 로비 하단 자유롭게/쉬기/걷기 조작 버튼 제거
- 코기는 입력 없이 자동 생활하며 환영 후 대기·산책·휴식·수면·주변 관찰·점프·착지·이모션 선택
- 점프 8포즈와 이모션 8포즈의 투명 프로토타입 시트를 추가
- 점프 시 높이 48 논리 픽셀의 포물선, 착지 시 지면 복귀와 작은 눌림 표현
- 점프 시트 앞 6프레임은 점프, 뒤 2프레임은 착지에 사용
- 이모션 전용 프레임과 하트·음표·물음표 표현
- UI 버튼은 동작이나 이벤트 연결 없이 배치 확인용 disabled 상태로 표시

## 메뉴 배치

각 메뉴는 원형 이미지와 그 아래의 이름으로 표시한다. 아이콘은 교체 가능한 인라인 SVG 이미지다.

| 위치 | 메뉴 |
|---|---|
| 좌측 상단 | Character |
| 우측 상단 | Friends · Shop · Settings |
| 우측 하단 | Play |

캐릭터 메뉴는 향후 꾸미기 진입점으로 사용할 수 있다. 실제 기능은 미구현이다.
현재 상태 안내는 화면에서 제거하고 접근성용으로만 유지했다.

## 화면 비율

- 논리 해상도: 960×540 (16:9)
- 전체 화면을 비율 유지하여 맞추고 남는 영역에는 여백을 표시
- UI와 게임 캔버스 모두 같은 16:9 영역 안에 배치
- 모바일 노치 safe area 반영, 가로 사용에 적합
- 터치 기기의 세로 뷰포트에서는 게임 영역 전체를 CSS로 90도 회전해 가로형으로 즉시 표시. 회전 안내 없음
- 가로 뷰포트에서는 회전을 해제하고 기존 16:9 표시. 브라우저/OS 방향 잠금은 변경하지 않음
- 회전 후의 가용 너비·높이와 safe area를 기준으로 크기를 계산하며 캔버스와 HTML 버튼을 함께 회전
- 데스크톱의 터치 없는 세로 창에는 회전을 적용하지 않음. 실기기 회전 및 터치 확인은 별도 필요

## Modified Files

- src/game/viewport.ts, SceneManager.ts: 공통 논리 화면 및 비율 유지 확대/축소
- src/game/scenes/TitleScene.ts, Game.ts: 코기 없는 타이틀
- src/game/scenes/LobbyScene.ts, src/ui/LobbyHud.ts: 로비 정리와 메뉴 배치
- src/style.css, index.html: 게임 영역과 아이콘/라벨 UI
- src/animals/AnimalState.ts, AnimalStateMachine.ts: 자율 점프·착지·이모션
- src/animals/AnimalAnimationController.ts, Animal.ts, AnimalConfig.ts, loadCorgi.ts: 신규 프레임·동작 연결
- public/assets/characters/corgi/corgi-jump-emote.png, playful-frames.json: 투명 에셋과 실제 프레임 좌표
- tests/animal.test.mjs: 회귀 및 신규 행동 검증
- Resources/corgi-actions.json: 행동별 런타임 준비 상태 갱신

## Verification

- npm test: 16개 통과
- npm run build: strict 타입 검사·프로덕션 빌드 통과
- 타이틀에 캐릭터 스프라이트가 없으며 연속 시작 입력이 중복 로비를 생성하지 않음
- 원형 이미지 메뉴 5개의 이름·그룹·비활성 상태 확인; 클릭해도 코기 행동에 영향 없음
- 제거한 로비 제목과 조작 UI가 다시 나타나지 않도록 회귀 검증
- 1920×1080, 1280×720, 844×390, 390×844, 320×568에 대한 논리 화면 비율·잘림 방지 계산 검증
- 실제 점프 높이·프레임·착지 후 지면 복귀 검증
- 이모션 자동 전환 및 종료 후 표시 제거 검증
- 생성된 PNG 실제 크기 1774×887과 JSON 좌표 일치; jump/emote 각 8프레임 분리 및 범위 확인
- 기존 환영·자율 행동·경계·씬 정리 테스트 유지
- 실제 브라우저 시각 검증은 자동화 도구의 Windows sandbox 초기화 오류로 미실행
- 실제 모바일 기기 성능·터치 검증은 남아 있음

## Known Issues

점프·이모션 신규 에셋은 생성형 프로토타입 아트다. 최종 프레임 일관성과 루프 자연스러움은 실제 플레이로 추가 확인이 필요하다.
휴식·수면·환영은 이전 임시 표현을 유지했다.
Character/Friends/Shop/Settings/Play는 이미지와 이름 배치만 있으며 아직 기능이 없다.

## 이미지 생성 기록

- 도구: built-in image_gen
- 참고: Resources/Corgi_Action_Art_Sheet.png
- 선택 에셋: public/assets/characters/corgi/corgi-jump-emote.png
- 원본을 수정하지 않고 신규 시트 생성; 스크립트는 PNG를 변경하지 않고 알파 경계만 분석하여 좌표를 기록
- 메뉴는 코드 기반 SVG로 제작

### 최종 생성 프롬프트

Create a clean prototype sprite atlas matching the exact approved orange-and-white corgi in the supplied reference. Preserve the big head, upright ears, tiny tail, short legs, chubby body, richly shaded cozy pixel game illustration. ONLY 2 horizontal rows with 8 corgis per row, total sixteen separate full-body characters in a regular eight-column grid, landscape canvas. Row 1: 8 distinct chronological JUMP AND LAND poses: crouch, push-off, rising legs tucked, airborne ascent, airborne apex smiling, descending, feet contacting, settling. Keep the character centered in its cell; the game applies the vertical jump trajectory, so keep the bottom of the feet consistently near each cell's baseline rather than drawing a giant parabolic jump path across the row. Row 2: 8 EMOTE poses: friendly sitting, happy mouth open, delighted eyes closed, happy tilted head, curious face, cute cheerful front paws lifted, contented face, friendly sitting. SAME animal dimensions and same orientation predominantly three-quarter facing right throughout, consistent markings and lighting. Keep all ears/paws/tails fully inside their own cells. Leave generous transparent gaps between every pose. True transparent alpha background, no shadows, no ground, no checkerboard painted into the image, no text, no labels, no symbols or floating hearts (the game renders those separately), no panels. Actual orange/white corgi fur only; no colored edge debris. This will be sampled as a two-row eight-column PNG in PixiJS.
