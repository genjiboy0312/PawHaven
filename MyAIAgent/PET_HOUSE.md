# Small Pet House (2026-10-29)

로비 행동 연결(2026-10-29): 집 앞에서 기존 REST/SLEEP 표현으로 쉬고, EMOTE 후 산책한다. 문 앞 목표·터치/이동/회수 중단·가용 영역·검증은 [LOBBY_LIFE.md](LOBBY_LIFE.md)를 참조한다. 게임 맵의 펫하우스는 계속 장식으로만 사용한다.

## 연결
- 상점 → 로비 → 가구의 Furniture:6, **펫하우스 / Pet House**, 250 Coins. 초기 수량 0, 구매 전 홈 인벤토리에서 숨긴다. 기존 구매 확인창·ShopState/ServerShopState 구독·다중 배치·소진 흐림·드래그 자동 저장·회수를 재사용한다.
- 원본 `Resources/Small_Pet_House.png`, 동일 배포 파일 `public/assets/home/small-pet-house.png`. 내장 image_gen으로 생성했다. 상자/검정·흰색 펫 소파를 스타일 참고로 사용했으며 원본 PNG를 재가공하지 않고 복사했다.
- 실제 RGBA 1254×1254, alpha 0–255, alpha>8 bbox (210,348)–(1050,952). 런타임 crop [208,346,844,608]로 2px 여백을 둔다. Pillow는 메타데이터를 읽는 데만 사용했다.
- GardenProps 한 곳에서 tab=Furniture, option=6, 파일·frame·표시 폭 170·코스 높이 105를 정의한다. 기존 소품은 Etc로 유지하며 동일 index의 벚꽃나무(Etc:6)와 구분한다. 상점 썸네일·홈·친구 방문·코스 장식이 같은 Texture를 공유한다.
- 모든 게임 맵 결승점의 100 world units 왼쪽, 기존 평지에 한 개를 배치한다. 결승 깃발과 우측 조작 버튼을 가리지 않도록 위치를 잡았다. 충돌·출입·휴식·보상·네트워크 상태는 추가하지 않는다. 맵 장식은 플레이어 가구 소유권과 별개다.

## SQL
쿼리 이름: **Pet House Shop**
파일: `supabase/migrations/202610290033_pet_house_shop.sql`. 032 이후 적용하며 사용자가 2026-10-29 실행 완료를 확인했다.
- 가구 최대 index 6, 새 슬롯 초기 수량 0, 서버 가격 250, 최대 보유 20을 기존 buy_home에서 처리한다.
- 동일 요청 중복 지급·다른 계정 접근·잔액 부족·수량 상한을 기존 트랜잭션으로 검증한다. 기존 구매·펫·하늘·바닥·플레이 보상·우편을 보존한다.
- petHouseShopReady가 없는 이전 서버에서는 구매를 막는다. 기존 우편 검증/지급·친구 홈 방문은 공통 가구 규칙을 참조하여 새 슬롯 수량을 지원한다.

## 최종 생성 프롬프트
Create ONE small wooden DOG HOUSE sprite for PawHaven cozy 2D pixel-art animal game. References are STYLE guides only: plain front-facing wooden crate for muted brown palette, modest wood planks and low complexity; black-white dog sofa for matching softly stepped fine pixel clusters and restrained 2-3-tone shading. A squat, cute single-dog kennel, nearly straight-on front view, shallow simple gabled roof in muted terracotta reddish-brown, light honey-brown wood walls, wide low rounded arched doorway with dark warm-brown interior, small cream-beige doorway trim. Compact silhouette roughly 1.25 width to 1 height, deliberately pet-sized not a human house. Simple few broad wooden panels, no realistic woodgrain/nails/no extra ornament, no text/nameplate/paw logo. Flat restrained shading, minimal visible side, no deep 3D/isometric perspective, no glossy highlights, no high detail, no giant mosaic pixel blocks. No dog, cushion, bowl, bones, plants, ground, floor oval, grass, cast shadow, glow, background or checkerboard. Full centered complete dog house with generous truly transparent padding on all sides; single sprite only. Real alpha transparency outside the house. Square canvas, aligned flat baseline.

## 검증
- 전체 테스트 356개, 타입 검사·프로덕션 빌드 통과. 추가 4개 테스트는 구매/재시도/상한/격리/SQL 재실행, 배치/회수/저장, 우편/친구 방문, PNG 원본 일치/전 맵 평지 배치/공유 Texture 생존을 확인한다.
- 실제 Chrome 960×540·640×360: 1000→750코인 구매, 구매만으로 자동 배치 없음, 배치 후 잔여 0/슬롯 흐림·비활성, 포인터 드래그와 저장 좌표 일치, 정원/숲길 결승 장식, 런타임 오류 없음.
