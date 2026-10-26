# Paw Haven 웹 배포

## 게시 복구 완료 (2026-10-27)
- acd2aac의 GitHub Actions 실행 40419705942에서 전체 Test·타입 검사/빌드·Pages 게시가 성공했다. 테스트 로더 정리 후 첫 배포 통과이며 이전 실행의 세부 로그가 없어 개별 정체 위치는 단정하지 않는다.
- 공개 HTML이 참조한 index-DOacQ3MA.js에서 wooden-box.png·box-target·room_chat_command·home-background-name을 확인했다. 공개 상자 PNG의 SHA256은 Resources 원본/배포 사본과 동일했다. 상자 미반영 신고는 코드 연결 누락이 아니라 공개 버전이 이전 빌드에 머문 상태였음을 확인했다.
- 공개 주소: https://genjiboy0312.github.io/PawHaven/

## 테스트 로더와 상자 배포 확인 (2026-10-27)
- 최근 Pages 실행은 Test 단계에서 15분 제한으로 취소되었고 공개 JS에는 wooden-box.png가 없었다. 상자 코드 연결/원본과 배포 PNG의 SHA256 일치는 확인했다. CI 작업 상세 로그는 저장소 API의 다운로드 대상에서 404로 반환되어 정확한 정체 위치는 확인하지 못했다.
- tests/load-typescript.mjs는 변환한 모듈을 임시 디렉터리에 한 번씩 저장하고 파일 URL로 참조하도록 변경했다. 중첩 data URL이 의존성 전체를 부모마다 복제하던 비용을 제거한다. 테스트 내용·범위·게시 전 검사 순서는 유지하고, 종료 후 직접 생성한 임시 디렉터리만 정리한다. 배포 성공 여부와 원인 확정은 실제 실행 결과로 구분한다.

## 배포 환경 고정 (2026-10-26)
- ubuntu-latest의 Ubuntu 26 전환 알림이 표시되는 시기에 CI 테스트 단계가 장시간 종료되지 않았다. 실행 환경 차이를 줄이기 위해 build/deploy를 ubuntu-24.04로 고정한다. npm ci → 전체 테스트 → 타입 검사/빌드 → Pages 업로드/게시는 유지한다.
- Ubuntu 고정만으로 정체가 해소되지 않아 Node는 로컬 검증과 같은 20.20.2로 고정하고, CI의 테스트 파일은 한 번에 하나씩 실행한다. tests/*.test.mjs 전체가 대상이며 테스트를 생략하지 않는다. 파일별 실행 시작을 기록하고 120초 뒤 종료를 요청하며 10초 안에 종료되지 않으면 강제 종료한다. 실패 로그는 test-diagnostics 아티팩트로 보관한다. 로컬 npm test의 병렬 실행 설정은 유지한다.
- 대기열 그룹은 pages-${{ github.ref }}로 브랜치별로 분리하고 이전 고정 pages 그룹에 멈춘 실행과 분리한다. 같은 브랜치의 새 push가 이전 실행을 취소하는 정책은 유지한다.
- 무기한 대기를 방지하도록 build 15분, deploy 10분 제한을 둔다. 로컬 전체 302개 테스트/빌드 통과 상태이며 실제 배포 실행 결과는 GitHub Actions에서 확인한다. 환경 전환이 정체의 확정 원인이라고 단정하지 않는다.

## 구성

- GitHub Pages, GitHub Actions 자동 배포
- 배포 주소: https://genjiboy0312.github.io/PawHaven/
- main에 push하면 의존성 설치 → 테스트 → 타입 검사·빌드 → dist 배포
- 설정 파일: .github/workflows/deploy.yml, vite.config.ts
- 상대 에셋 경로로 /PawHaven/ 하위 경로를 지원
- CI Node.js 20.20.2 사용; 로컬 실행 명령은 그대로 유지
- 별도 서버, Supabase, 비밀 환경변수 없이 실행

## 확인 방법

- [배포 작업](https://github.com/genjiboy0312/PawHaven/actions/workflows/deploy.yml)에서 성공 여부 확인
- 배포 주소에서 코기 로딩 및 자유롭게/쉬기/걷기 확인
- main에 변경 사항을 push하면 같은 URL에 자동 갱신
- 각 브라우저의 동물 행동은 독립적이며 기기 간 세션 동기화는 제공하지 않음

## 배포 전 검증

npm test, npm run build 및 dist 에셋 경로를 확인한다.
## 배포 결과 (2026-10-16)

- 첫 배포 커밋: afe009f
- GitHub Pages 활성화 및 첫 자동 배포 성공
- 실행: https://github.com/genjiboy0312/PawHaven/actions/runs/38829502315
- GitHub Linux / Node.js 22 환경에서 npm ci, 테스트 8개, 타입 검사, 빌드 및 게시 모두 성공
- 공개 페이지 HTTP 200, 제목 Paw Haven 확인
- HTML에서 참조한 JavaScript/CSS 11개 모두 HTTP 200
- 코기 PNG HTTP 200 및 image/png 응답 확인
- 공개 프레임 JSON에서 idle 8개·walk 8개 확인
- 브라우저 자동화 도구 초기화 오류로 배포 후 시각 검증은 미실행. HTTP 응답과 CI 결과를 근거로 게시 상태를 확인함
- Supabase 및 별도 서버는 사용하지 않음

## M4 반영

타이틀에서 화면을 터치해 로비에 들어가며, 코기가 환영 후 자동 생활로 돌아간다. 로컬 테스트 12개·타입 검사·빌드를 통과한 변경을 동일 자동 배포에 반영한다. 상세: [M4_PROGRESS.md](M4_PROGRESS.md).

## 16:9 로비 개편

코기 없는 타이틀, 로비 제목/수동 조작 제거, 원형 메뉴 UI와 자율 점프·이모션을 반영한다. 상세: [LOBBY_LAYOUT.md](LOBBY_LAYOUT.md).

## 모바일 브라우저 자동 다크모드 대응

- HTML에 color-scheme: only light 메타 선언을 추가해 첫 렌더링부터 라이트 전용임을 알린다.
- CSS :root에도 color-scheme: light 및 only light 선언을 적용한다. only 미지원 브라우저에는 light가 남는다.
- 게임의 배경, 캐릭터 텍스처와 원래 색상은 변경하지 않는다.
- 삼성 인터넷은 사용자 설정/버전에 따라 강제 다크모드가 이 선언을 무시할 수 있으므로 모든 환경에서 차단을 보장하지 않는다.
- 확인: 삼성 인터넷의 다크모드를 켠 상태에서 새로고침하고 크롬과 같은 장면의 색상을 비교한다. 실기기 확인은 별도로 필요하다.
- 근거: https://developer.chrome.com/blog/auto-dark-theme 및 https://developer.samsung.com/browser/blog/en/2020/12/15/dark-mode-in-samsung-internet
