# 구매 확인 및 명랑이 아이콘 (2026-10-22)

## 구매 확인
- `src/ui/PurchasePopup.ts`는 꾸미기/가구 구매에 공용으로 사용하는 확인 패널이다. 기존 Settings 패널 스타일, itemIcon/homeIcon, CoinAmount, CommerceStatus를 재사용한다.
- 구매 버튼은 확인 패널만 연다. 상품 이미지·이름·수량 1·가격·구매 후 잔액을 표시하며 Cancel/취소 또는 Escape/배경 탭은 차감 없이 닫는다. 초기 포커스는 취소 버튼이다.
- 실제 구매는 확인 버튼에서 기존 CommerceState.buy/buyHome을 호출한다. 지갑/가용성/보관 한도를 재검사하고 처리 중 중복 확인과 취소를 막는다. 상품/가격은 팝업을 열 때 고정하고 잔액·연결 상태는 기존 구독으로 갱신한다.
- 서버 응답 유실은 기존 요청 ID 재시도로 처리한다. 보유량 증가가 확인되면 같은 구매를 다시 보내지 않고 닫는다. 씬 종료 시 구독·이벤트·입력 잠금을 해제하며, 확인 직후 팝업이 파괴되면 아직 전송하지 않은 마이크로태스크는 구매를 실행하지 않는다. 이전 요청 결과가 새 팝업을 닫지 않도록 인스턴스별 overlay를 비교한다.
- 하위 상점은 inert로 잠그고 닫을 때 이전 상태·버튼 포커스를 복구한다. 한영 전환과 Tab 순환을 지원한다. Pass의 무료 테스트 해금은 코인 구매가 아니므로 기존 흐름을 유지한다. 새 SQL/구매 가격/재화 규칙 변경은 없다.

## 아이콘 리소스
- 도구: built-in image_gen. 기존 `Resources/Myeongrang_Idle_Prototype.png` 첫 번째 눈 뜬 프레임을 캐릭터/스타일 참고로 사용했다. 명랑이의 귀·갈색 털·흰 얼굴 무늬를 유지한 얼굴 중심 아이콘을 한 번 생성했다.
- 생성 원본: `C:/Users/zxo99/.codex/generated_images/01a141eb-5f3e-78b3-b731-c48c014baa1c/exec-de6cf706-832b-4848-8c07-4323707e7279.png`.
- 프로젝트 보관: `Resources/PawHaven_Myeongrang_Icon.png`.
- 배포 복사: `public/assets/icons/myeongrang.png`. 같은 PNG를 그대로 복사하며 별도 픽셀 편집/재생성/리사이즈를 하지 않았다.
- `index.html`의 PNG favicon과 apple-touch-icon은 원본을 참조하며, `public/manifest.webmanifest`에는 동일 원본에서 축소한 192/512 규격을 사용한다. 하위 경로에서도 시작 URL/아이콘이 유지되도록 상대 경로를 사용한다. 설치 버튼·규격 파일·검증은 [PWA_INSTALL.md](PWA_INSTALL.md)를 참고한다. 브라우저 캐시 또는 기존 홈 화면 바로가기에 이전 아이콘이 남으면 다시 추가해야 할 수 있다.

## 검증
전체 174개 테스트, 타입 검사·빌드 통과. 확인 전/취소 후 잔액·수량 불변, 서버 확인 1회 지급, 한영·실시간 잔액 갱신/잔액 부족, 유실 응답 재시도와 중복 차감 방지, 파괴된 팝업의 지연 요청 방지, 입력 잠금 해제, 기존 홈 배치/로비 표시 회귀를 검증했다. 아이콘 보관/배포 PNG 동일성과 정사각형 및 HTML 아이콘 링크도 확인했다. 실제 모바일 팝업 배치·OS 홈 화면 아이콘 외형은 별도 확인 대상이다.

## 아이콘 최종 프롬프트
Create one square app icon for PawHaven using the attached Myeongrang sprite sheet as an exact character reference. Use the FIRST open-eyed dog at the upper-left as the identity and pixel-art style reference. This is the owner's beloved real dog: preserve that dog's large upright triangular ears, ginger/chestnut fur, cream-white eye mask and muzzle, narrow white forehead blaze, big gentle dark eyes, small black nose and slightly right-facing three-quarter head angle. Show ONLY the head and a tiny hint of fluffy white neck, no body, paws or tail. Both ears completely visible. Bring the face large into the center, occupying roughly 78% of the square with safe breathing room around ear tips for rounded OS crops. Keep the reference's soft modest pixel clusters and restrained shading; do not turn it into a 3D render, smooth vector logo or different dog/corgi. Clean edges, remove the sheet's colored alpha fringes. ONE flat solid pale buttercream background #F8E4AE extending to every edge, fully opaque square. No rounded-square frame baked in, no border, no gradients, shadows, sparkles, symbols, text or letters. Friendly, recognizable at tiny browser-tab sizes. One icon only, not an icon sheet, no presentation mockup.
