# Cherry Blossom Sky and Course (2026-10-29)

## 적용 범위
- 싱글 맵 `cherry` / **벚꽃 산책길** 추가. 검증된 garden 경로·물리·코인 10개·상자 2개·뱀을 재사용한다. 20–30초 프로토타입이며 기존 맵은 변경하지 않는다. 멀티 맵 목록에는 추가하지 않는다.
- 새 분홍빛 하늘 + 기존 벚꽃나무·울타리·상자 + 밝은 베이지 흙/연두 잔디 타일을 사용한다. 캐릭터·아이템·UI에는 분홍 tint를 적용하지 않는다.
- 게임 맵의 배경과 로비 장식 소유권은 별개다. 새 싱글 맵은 로비 배경을 구매하지 않아도 플레이할 수 있다.

## 하늘 구매 규칙
- 기본 아침 하늘(index 0)만 무료. 오후(1), 노을(2), 밤(3), 벚꽃 하늘(4)은 각각 **200 Coins** 구매 후 홈에서 선택한다.
- 기존 정상 구매 내역은 보존한다. 저장된 선택값만으로 미구매 하늘을 보유 처리하지 않는다. 미구매 선택은 기본 하늘로 대체한다. 구매 시 자동 적용하지 않는다.
- HomeCatalog / HomeState / ShopState와 서버 경제 RPC·공통 구매 확인창·상점 미리보기를 재사용한다. 인벤토리는 소유한 배경만 표시한다.
- 소유권 로딩 중에는 기본 하늘을 표시하고 로딩 완료 시 observer에서 reconcileOwnership을 호출한다. 미구매 선택은 제거하되, 서버 응답 전 정상 구매 선택값을 영구 삭제하지 않는다.
- 서버 owned_background는 직접 저장·친구 홈 방문에서도 소유권을 검사한다. cherrySkyReady가 없는 이전 서버에서는 새 하늘 구매를 차단한다.

## SQL
쿼리 이름: **Cherry Blossom Sky and Course**
파일: `supabase/migrations/202610290031_cherry_sky.sql`. 030 이후 적용한다. 사용자 실행 완료 확인은 대기 중이다.
- Background 허용 인덱스 0–4, 일회 구매, 계정별 소유권·서버 가격 200·중복 요청 보호를 유지한다.
- cherry 싱글 완주 보상 수집 상한 12, 완주 보너스 10, 기존 토큰·시간·계정·중복 검증을 재사용한다. 멀티의 허용 맵·권한은 변경하지 않는다.
- 기존 펫 구매·가구·패스·일일 퀘스트·우편 지급 흐름을 보존한다.

## 최종 PNG (원본과 배포 파일은 동일 바이트)
| Resources | 배포 경로 |
|---|---|
| Park_Background_morning.png | public/assets/backgrounds/morning.png |
| Park_Background_noon.png | public/assets/backgrounds/noon.png |
| Park_Background_sunset.png | public/assets/backgrounds/sunset.png |
| Park_Background_night.png | public/assets/backgrounds/night.png |
| Park_Background_cherry.png | public/assets/backgrounds/cherry.png |
| Cherry_Terrain_grass.png | public/assets/course/cherry-grass.png |
| Cherry_Terrain_soil.png | public/assets/course/cherry-soil.png |

기존 하늘 4장도 모두 Resources에 보관되어 있다. 새 하늘은 2172×724. 생성 도구는 imagegen 스킬의 내장 image_gen이다. 원본 PNG를 재가공하지 않고 복사했다. 잔디 가장자리 상위 20%만 런타임 Texture frame으로 사용해 흙 위에 두꺼운 색 띠가 생기지 않게 한다. 코스 물리/충돌과 렌더 타일을 분리한다.

## 생성 프롬프트
### 하늘
Create one production background asset for PawHaven, a cozy side scrolling 2D pixel animal game. Reference image is the existing morning sky: preserve its wide panoramic 3:1 composition, fine restrained pixel clusters, sparse cream puffy clouds, large open upper sky, layered distant treeline occupying bottom quarter, no ground or foreground objects. Make a CHERRY BLOSSOM spring version: soft pale sky blue blending into very gentle blush pink near horizon; clouds ivory white with subtle pink shadows; distant trees primarily dusty blush pink cherry canopies, a few muted sage green trees. Calm daylight, readable, not saturated purple or dramatic sunset. Match original pixel density and simple 2-3-tone clustered tree shading, no smooth vector art or 3D, no extra detail/noise. Landscape panoramic 2172x724 or 3:1 aspect. Sky and distant scenery only. No characters, props, UI, text, watermark, giant close-up branches, falling petal overlay, sun/moon. Opaque full background, edge-to-edge.

### 잔디
Production 2D pixel terrain tile for PawHaven. Use reference as exact composition/pixel-density guide, a flat side-view square grass-over-soil tile. Make cherry blossom spring palette: top 15 percent pale fresh sage/lime grass edge with irregular short pixel roots, lower 85 percent light warm beige sandy soil with restrained slightly darker beige pixel clusters. A FEW tiny muted pink petal pixels along grass lip only, not large flowers. Keep fine simple flat pixel clusters, no outlines or 3D, no photoreal texture, no giant mosaic, no extra decorations. Entire square opaque edge-to-edge. Top edge flat and continuous, left/right matching repeating edges. No sky, trees, characters, UI, text, border. Square tile. Match reference density and low contrast; lighten original brown soil substantially.

### 흙
One production seamless SOIL FILL texture tile for PawHaven 2D pixel platform game, companion to pale spring grass tile. Reference only for simple flat square pixel cluster density. Fill ENTIRE square edge-to-edge with light warm beige sandy soil (#d5bd94 approximate), restrained darker warm beige small pixel clusters, few lighter clusters. Uniform soil only, NO GRASS strip, no top surface, no roots, no sky, objects, borders, text, shadows, 3D or photoreal noise. Low contrast, simple 2-3 tonal family, match cozy reference pixel-art style. Seamlessly repeat on all edges, square opaque tile, no transparency.

## 검증
전체 테스트 347개, 타입 검사·프로덕션 빌드 통과. 새 DB 테스트는 소유권·중복 구매·계정 격리·직접 저장·친구 방문·기존 서버 구매 차단·벚꽃 맵 보상·PNG 원본 일치를 확인한다. Chrome/Pixi 960×540 및 640×360에서 1000→800코인 구매, 홈 반영, 벚꽃 맵 배경/지형 일치와 런타임 오류 없음을 확인했다.
