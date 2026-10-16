# Home 로비 꾸미기 프로토타입

- 로비 좌측 상단 Character 오른쪽에 Home 원형 버튼. 별도 HomeScene으로 전환하며 Close로 로비에 복귀한다.
- Home에는 Animal/NPC/캐릭터 미리보기가 없다. 로비와 동일한 LobbyMap만 보여준다. 오른쪽의 작은 목록 패널에서 맵을 꾸민다.
- 탭: Background / Floor / Furniture / Etc. 한영 전환 지원.
- 배경 4가지, 바닥 4가지, 가구 None+4가지(벤치·화분·테이블·쿠션), 소품 None+4가지(꽃·돌·조명·울타리).
- 선택 즉시 반영·자동 저장. 가구/소품은 정해진 위치에 한 종류씩 표시한다. 드래그·자유 배치·여러 개 배치·충돌 판정·구매는 미구현이다.
- 새 이미지 생성 없이 기존 UI·SVG 아이콘 방식과 Pixi Graphics의 단순 도형을 사용한다. 최종 픽셀 아트 디자인은 아니다.
- HomeState는 pawhaven.home.v1에 기기별 저장한다. 로비와 Home이 같은 상태/렌더러를 사용하며 재접속 시 복원한다. 저장소 차단 시 세션 내 변경을 유지한다.
- 로비 복귀 시 기존 동물이 다시 자율 생활하며 첫 환영 연출은 반복하지 않는다. 플레이 코스의 배경은 변경하지 않는다.
- 구현: src/home/HomeState.ts, LobbyMap.ts, src/game/scenes/HomeScene.ts.
- 테스트 39개 및 타입 검사/빌드 통과. Home 버튼 위치·진입·캐릭터 없는 구조·탭 선택·로비 반영·재진입·None 해제·씬 정리, 저장 검증·손상 데이터/저장소 차단을 확인했다.
- 브라우저/모바일 실기기의 최종 시각·터치 확인은 별도 필요하다.
- 큰 타원형 바닥 패치를 제거했다. Background는 배경, Floor는 전체 바닥 색상만 변경하며 아이템 목록 아래의 작은 그림자는 유지한다.
- 후속 개발 순서: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).
- Background에 포함되어 있던 지평선 타원도 제거했다. 관련 안정화·교감 검증: [STABILIZATION_M5.md](STABILIZATION_M5.md).
