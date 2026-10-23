# 로비 간식 (2026-10-24)

- 승인 범위: 비스킷 한 종류, 강아지 터치 후 말풍선 옆 간식 버튼, 기존 EMOTE·하트·감사 대사 재사용, 일일 퀘스트 보상. 배고픔·접속 강요·광고·결제는 추가하지 않는다.
- Resources/Pet_Treat_Biscuit.png 원본과 public/assets/items/pet-treat.png 배포 사본을 함께 보관한다. 승인된 검정·흰색 펫 소파를 스타일 참조로 생성했다. 꿀색 뼈 모양, 적은 명암, 촘촘한 윤곽, 투명 배경. 기존 동물 시트는 다시 생성하지 않았다.
- 제작 프롬프트: small golden-brown rounded bone biscuit, head-on flat 2D pixel art, fine pixel contours matching approved pet sofa, limited warm shades, tiny baked dimples, transparent background, no face/text/frame/gloss/3D/coarse enlarged mosaic. 이미지 원본의 투명 여백은 CSS 표시 영역에서만 조정한다.
- 버튼은 기존 로비 바탕 SVG를 재사용해 가로로 맞춘 Snack_Button_Face.svg다. 원본 Resources, 사본 public/assets/icons/snack-button-face.svg. 별도 디자인 라이브러리는 없다.

## 수량과 서버

- 일일 퀘스트 각각의 첫 보상 수령 시 비스킷 1개를 지급한다. 기존 코인 보상은 유지한다. 시작 수량 0, 최대 99, 날짜가 바뀌어도 남은 수량은 유지한다. 이미 받은 과거 보상에 소급 지급하지 않는다.
- 로그인 계정은 `supabase/migrations/202610240011_snacks.sql`이 필요하다. 기존 008 가구 상점 SQL 이후 적용한다. wallets의 snacks/last_snack과 기존 economy_command를 확장하며 RLS와 직접 쓰기 금지를 유지한다.
- feed는 인증 사용자 지갑 잠금 후 1개 차감, 펫 ID 검증, 4초 간격 제한을 적용한다. 기존 요청 ID/원장으로 중복 차감을 막는다. 응답 유실 시 같은 요청을 재시도한다. 로컬 수량을 로그인 계정에 가져오지 않는다.
- 게스트는 기존 ShopState 저장에 수량·사용 시간을 함께 저장한다. 서버 기능이 없는 계정에는 준비 중으로 표시하고 지급·사용을 약속하지 않는다.

## 컴포넌트와 생명주기

- ShopState/ServerShopState가 수량을 소유하고 SnackButton은 표시·입력만 담당한다. 기존 경제 구독 구조를 사용하며 새 전역 상태를 만들지 않는다.
- 서버가 확정한 feedSerial 변경을 LobbyScene이 받아 Animal.feed를 호출한다. EMOTE·말풍선·하트를 재사용하며 일반 터치 퀘스트 진행도는 올리지 않는다. 간식이 없으면 기존 퀘스트 팝업을 연다.
- 연타·처리 중 입력을 막고 씬 종료 시 이벤트와 DOM을 제거한다. 다른 펫/계정으로 바뀐 뒤 늦은 응답이 이전 캐릭터를 조작하지 않는다. 팝업 중에는 씬 반응을 정지한다.
- 한영 대사는 의미 단위로 두 줄을 사용한다. 일반 터치를 하면 기존 랜덤 힐링 대사로 돌아온다.

## 검증

- 실제 migration을 PGlite에서 실행해 수량 제한·첫 보상·날짜 변경·RLS·중복 요청·서버 차감 후 응답 유실 재시도를 검증한다. 게스트 저장·버튼 연타·정리와 기존 동물 반응도 확인한다.
- Chrome headless에서 실제 LobbyScene/버튼/말풍선 컴포넌트를 단색 테스트 텍스처로 표시해 화면 경계와 퀘스트 보상 표시를 확인했다. 실제 동물 텍스처 로드는 headless 가상 시간에서 끝나지 않아 이 확인에서는 대체 텍스처를 사용했다. 삼성 인터넷 강제 다크모드는 실기기 확인 대상이다.

- 최종 검증: 전체 229개 자동 테스트·타입 검사·프로덕션 빌드 통과. 운영 계정의 인증·실제 차감 테스트는 별도 확인 대상이다.
