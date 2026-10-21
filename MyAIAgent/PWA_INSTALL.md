# 웹앱 설치 (2026-10-22)

- 설정 → Display/화면에 Install app/앱 설치 버튼을 연결했다. 기존 설정 버튼 스타일을 사용하며 설치 기능을 지원하지 않거나 이미 앱으로 실행 중인 환경에서는 섹션 전체를 숨긴다.
- `AppInstall`은 게임 생성 시점부터 `beforeinstallprompt`/`appinstalled`와 standalone 모드 변화를 관찰한다. 설치 가능한 이벤트가 있어야 버튼을 표시한다. 실제 `prompt()`는 사용자 클릭 안에서 호출하고 최종 설치 승인은 Chrome이 받는다. 앱 진입만으로 강제 설치하지 않는다.
- Chrome의 설치 이벤트는 한 번만 사용한다. 처리 중 중복 실행을 막고, 취소하면 새 이벤트가 제공될 때까지 버튼을 숨긴다. 승인/설치 완료/standalone 전환 시 숨기며 설치창 호출 실패만 짧은 재시도 안내로 표시한다.
- `InstallAppButton`은 Display에서만 상태를 구독하는 작은 UI 컴포넌트다. 가용성 변경 시 기존 화면 효과·카메라 토글을 다시 만들지 않는다. 탭 전환/설정 종료 시 구독을 해제하고, 게임 종료 시 설치 이벤트도 해제한다. 상점/퀘스트/멀티 데이터와 SQL은 변경하지 않는다.

## 아이콘 재사용
- `Resources/PawHaven_Myeongrang_Icon.png` 원본을 유지했다. 기존 이미지의 크기만 Pillow LANCZOS로 축소해 아래 파일을 만들었다. 새 이미지 생성/캐릭터 재디자인은 하지 않았다.
- 보관: `Resources/PawHaven_Myeongrang_Icon_192.png`, `Resources/PawHaven_Myeongrang_Icon_512.png`.
- 배포: `public/assets/icons/myeongrang-192.png`, `public/assets/icons/myeongrang-512.png`.
- `public/manifest.webmanifest`에 두 실제 PNG 규격(192×192 / 512×512, purpose:any)을 등록했다. 기존 id/start_url/scope의 상대 경로, standalone 표시와 가로 방향을 유지했다. 일반 favicon/apple-touch-icon은 기존 원본 참조를 유지한다.

## 검증과 범위
- 전체 175개 테스트 및 타입 검사·빌드 통과. 모의 Chrome 이벤트로 설치 요청 1회 소비/중복 클릭/취소/승인/실패/앱 설치 이벤트/standalone 변경/종료 정리를 검증했다. 실제 Settings Display에서도 설치 가능 이벤트 수신 시에만 표시되고 클릭 후 취소하면 숨겨지며, 화면 토글은 유지되는 것을 확인했다. PNG 크기와 Resources/배포 복사 동일성도 검사했다.
- 실제 Android Chrome 설치 이벤트 발생과 OS 홈 화면 동작은 실기기 확인이 필요하다. 브라우저의 HTTPS/사용자 참여/이미 설치 여부 판단에 따라 이벤트 발생 시점이 달라진다. 설치하지 않은 모든 방문자에게 즉시 버튼이 뜨는 기능은 아니다.
- 서비스 워커/오프라인 캐시/앱스토어 패키징은 이번 작업에 포함하지 않는다. 설치 후에도 기존 온라인 게임 연결 방식을 사용한다.
- 근거: [Chrome 설치 조건](https://web.dev/articles/install-criteria), [설치 요청 이벤트](https://web.dev/learn/pwa/installation-prompt).
