# M4 — 타이틀 진입 및 코기 환영

날짜: 2026-10-16

## Implemented

사용자 요청에 따라 첫 화면과 로비 진입 흐름을 추가했다.

Boot → Preload → Title → 터치/클릭/키보드 활성화 → Lobby → NOTICE → APPROACH → GREET → M3 일상 행동

- TitleScene: Paw Haven 제목, 코기 대기 모습, 화면을 터치해 시작하세요 문구
- 시작 입력은 실제 HTML button의 click으로 처리하여 터치·마우스 및 기본 키보드 활성화 지원
- 시작 입력 전에는 로비와 환영 시퀀스를 생성하지 않음
- 시작 버튼의 중복 입력 차단과 씬 종료 시 이벤트 제거
- NOTICE: 방문 발견 표시와 작은 기울임
- APPROACH: 포인터 대신 화면에 정해 둔 환영 지점으로 접근
- GREET: 인사 문구와 작은 들썩임, 기존 프레임 재생
- 환영 동안 자율 AI를 정지하고 종료 시 해당 위치에서 자동 생활 재개
- 로비 인스턴스당 한 번만 환영; 리사이즈 및 버튼 입력으로 재실행되지 않음
- 환영 도중 수동 생활 버튼은 잠시 비활성화, 종료 후 다시 활성화
- 새로고침하면 타이틀부터 다시 시작하고 새 로비에서 환영함

## Modified Files

- src/game/scenes/TitleScene.ts: 타이틀 화면 및 시작 입력
- src/game/Game.ts: Title → Lobby 진입 연결
- src/systems/WelcomeSequence.ts: 렌더러 독립 환영 단계·시간·이동 목표
- src/animals/Animal.ts: 환영과 일상 행동 우선순위
- src/animals/AnimalConfig.ts, AnimalState.ts, AnimalStateMachine.ts: 환영 설정 및 시각 상태 타입, 위치 인계
- src/animals/AnimalAnimationController.ts: 발견·접근·환영 표현
- src/game/scenes/LobbyScene.ts: 환영 최초 시작, 상태 안내, 조작 잠금
- src/style.css: 타이틀 반응형 UI 및 줄어든 모션 설정
- tests/animal.test.mjs: M4 및 씬 입력 수명주기 검증

## Verification

- npm run build: strict 타입 검사 및 프로덕션 빌드 통과
- npm test: 12개 통과
- 기존 M1/M3 테스트 8개 유지
- 환영 단계 순서, 한 번 실행, 정확한 환영 지점 도착 검증
- 접근 중 화면 축소 및 이동 가능한 폭이 없는 경우에도 시퀀스 종료
- 환영 중 일상 행동 정지, 종료 후 자동 모드 및 IDLE 복귀
- 10회 연속 시작 입력에도 로비 인스턴스 1개만 생성
- 반복 resize 후에도 환영을 다시 시작하지 않음
- 씬 제거 후 이전 시작/생활 버튼 이벤트가 재실행되지 않음
- DOM 연동 테스트는 Native EventTarget과 최소 DOM 표면으로 수행했으며 실제 브라우저 렌더링 검증을 대체하지 않음
- 브라우저 자동화는 Windows sandbox 초기화 오류로 실행 불가; 이번 타이틀과 환영의 실제 시각 검증은 남아 있음

## Known Issues

현재 발견·환영은 기존 idle/walk 프레임과 기울임·들썩임·문구를 활용한 프로토타입 표현이다. 전용 notice/greet 최종 스프라이트 및 사운드는 아직 없다.
고양이는 M2 보류 상태이므로 코기만 환영한다. 쓰다듬기는 M5에서 별도로 구현한다.

## 로비 확장 계획

사용자가 향후 추가하려는 샵과 환경 설정은 로비의 메뉴로 배치한다.
이번 작업에서는 메뉴와 기능을 선행 구현하지 않았다.
샵 상품·재화·과금, 설정 항목·저장 방식 등은 실제 구현 시 요구사항을 정한다.

## 웹 반영

기존 GitHub Pages 자동 배포를 사용한다.
주소: https://genjiboy0312.github.io/PawHaven/
최신 배포 상태: https://github.com/genjiboy0312/PawHaven/actions/workflows/deploy.yml
