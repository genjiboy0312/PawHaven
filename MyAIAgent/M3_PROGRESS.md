# M3 — 코기 자율 생활 AI

날짜: 2026-10-16

## Implemented

사용자 지시에 따라 M2 고양이는 보류하고 코기 한 마리로 M3를 구현했다. 기존 명세의 두 동물 동시 검증은 M2 재개 이후 진행한다.

- 렌더러와 분리된 AnimalStateMachine: IDLE, WANDER, REST, SLEEP, OBSERVE
- 로비 진입 시 자동 모드: 대기 → 가중치 기반 행동 선택 → 대기로 복귀
- 코기 기본 성향: 산책 50%, 휴식 20%, 수면 10%, 관찰 20% (대기 종료 후 선택 확률)
- 대기 2~4초, 휴식 4~7초, 수면 8~14초, 관찰 2.5~4.5초
- 산책은 영역 안의 목표를 선택하고 도착 시 정지; 가장자리에서는 반대편으로 목표 보정
- 화면 크기 변경 시 현재 위치 및 목표를 범위 안으로 보정
- 각 동물이 독립적인 상태, 시간, 위치, 목표, 난수원을 보유
- AnimalAnimationController가 행동과 프레임 표현 연결
- 기본 자동 모드와 자유롭게/쉬기/걷기 버튼; 수동 입력은 자동 행동을 중단하고 자유롭게로 복귀 가능
- 수면 중 z z 표시와 약한 숨쉬기 표현, 주변 관찰 중 좌우 바라보기
- 별도 타이머나 ticker를 만들지 않고 기존 씬 업데이트를 사용

## Modified Files

- src/animals/AnimalState.ts: 행동 타입과 코기 성향
- src/animals/AnimalStateMachine.ts: 행동 전환 및 이동
- src/animals/AnimalAnimationController.ts: 상태별 시각 표현
- src/animals/Animal.ts, AnimalConfig.ts: AI 연결 및 설정 분리
- src/game/scenes/LobbyScene.ts: 자동 시작, 행동 안내, 모드 전환 및 버튼 정리
- tests/animal.test.mjs, tests/load-typescript.mjs: 검증
- MyAIAgent/PAW_HAVEN_PROJECT.md, SETUP.md: 현재 단계 반영

## Verification

- npm test: 8개 통과
- 서로 다른 난수 seed 3개에서 각 20분씩, 총 60분 분량의 시뮬레이션
- IDLE/WANDER/REST/SLEEP/OBSERVE 모두 방문, 이동 영역 유지, 비이동 상태에서 위치 유지
- 각 상태 종료, 산책 중 화면 축소와 목표 보정, 폭이 0인 이동 영역에서도 정지 상태로 복귀
- 수동 모드가 자동 행동을 중단하고 복귀 시 새 행동 시작
- 동물 두 인스턴스의 타이머와 위치 독립성 (고양이 에셋을 추가한 것은 아님)
- 수면 표현 활성/해제와 수면 중 위치 고정
- 기존 M1 프레임, 이동 및 씬 정리 테스트 유지
- npm run build: strict 타입 검사·프로덕션 빌드 성공
- 개발 서버 http://127.0.0.1:5173/ HTTP 200 확인
- 이번 M3 브라우저 시각 검증은 실행하지 못함: 자동화 도구의 Windows sandbox 초기화 오류로 연결 실패. 코드 실행 실패로 판정한 것은 아님
- 실제 모바일 기기 터치·성능은 미검증

## Known Issues

휴식·수면·관찰의 전용 스프라이트는 아직 준비되지 않았다. 기존 idle의 눈 감은 프레임과 정지/숨쉬기/z z/좌우 반전을 이용한 명시적 임시 표현이다. 최종 휴식·수면 아트 완성으로 보고하지 않는다.

걷기는 현재 지면에서 수평 이동한다. 경로 탐색과 장애물 회피는 추가하지 않았다.
M2(고양이)는 사용자 요청으로 보류. M4 환영과 M5 쓰다듬기는 미구현이다.

## Next Step — 외부 확인

현재 목적은 외부 휴대폰에서도 같은 게임 빌드를 열어 보는 것이다. 정적 웹 배포만으로 가능하며 Supabase나 별도 게임 서버는 필요하지 않다.

권장 순서:

1. GitHub Pages 등 정적 호스팅에 Vite dist 배포
2. 휴대폰에서 접속·애니메이션·성능 확인
3. 여러 기기에서 같은 계정/설정/동물 데이터를 공유해야 할 때 Supabase Auth·Database·Storage 검토
4. 동물 위치를 기기 간 실시간 공유하려면 상태 동기화 설계를 별도로 정의

웹 배포만 하면 각 브라우저에서 코기가 독립적으로 생활한다. 집 PC에서 진행 중인 동일 세션을 원격으로 보는 기능과는 다르다. LocalStorage도 브라우저별로 분리된다.

현재 서버·Supabase 연결이나 외부 배포는 수행하지 않았다.

공식 자료:
- [Vite 정적 배포](https://vite.dev/guide/static-deploy): dist 출력물 배포, GitHub Pages의 base 경로 설정 안내
- [Supabase 시작하기](https://supabase.com/docs/guides/getting-started): Auth, Database, Storage 등의 기능 안내
