# 박스·코인·펫 소파 리소스

2026-10-21 사용자가 선택한 시안을 Resources에 복사했다. 생성 도구는 built-in image_gen이다. 복사 전후 SHA-256 일치를 확인했으며 이미지 편집·배경 재처리는 하지 않았다. 펫 소파는 이후 상점·홈·로비에 연결했다. 적용 방식과 구매 흐름은 [HOME_SHOP.md](HOME_SHOP.md)를 참고한다. 코인은 2026-10-22 재화 UI에 연결했다. 박스 프로토타입은 아직 게임에 적용하지 않았다.

| 리소스 | 프로젝트 경로 | 채택 시안 |
|---|---|---|
| 박스 | `Resources/Wooden_Box_Prototype.png` | 옆면을 제거하고 원본 시트의 정면 박스 형태로 수정한 버전 |
| 코인 | `Resources/Gold_Coin_Prototype.png` | 문양 없는 금색 픽셀 코인 |
| 펫 소파 | `Resources/Pet_Sofa_Black_White_Prototype.png` | 강아지 한 마리용 낮은 검정 외곽·화이트 쿠션 버전 |

## 스타일 기준

향후 제작에 적용할 공통 규칙은 [PIXEL_ART_AGENT.md](PIXEL_ART_AGENT.md)의 '소품·펫 가구 제작 기준'에 반영했다. 이 문서는 채택 파일과 실제 사용한 프롬프트 기록을 유지한다.

- 기준 이미지는 `Resources/Corgi_Art_Sheet.png`의 PUSH 행 상자다. 박스 수정에는 사용자가 첨부한 상자 확대 이미지도 참조했다.
- 정면 위주, 단순한 실루엣, 절제된 명암을 유지한다. 입체적인 옆면이나 과도한 질감으로 디테일을 늘리지 않는다.
- 사람용 2인 소파와 첫 입체 박스 시안은 채택하지 않았다.
- 아래는 각 채택 이미지에 실제 사용한 최종 프롬프트다. 향후 수정은 이 세 파일을 기준으로 진행한다.

## 코인 공용 표시 (2026-10-22)

- 2026-10-26 맵 수집 프로토타입에도 같은 코인 PNG/추출 범위를 재사용했다. 실행별 수집 개수만 표시하며 상점 잔액에는 합산하지 않는다. 상세는 [COURSE_COINS.md](COURSE_COINS.md)를 참고한다.

- 원본 `Resources/Gold_Coin_Prototype.png`를 바이트 변경 없이 `public/assets/items/gold-coin.png`에 복사했다. 새 이미지 생성·편집은 없다.
- `src/ui/CoinAmount.ts`의 공용 표시 함수를 Shop의 잔액/의상·가구 가격, Quest의 잔액/일일 보상, Shop·Quest의 시즌패스 보상에 재사용한다. 각 화면의 기존 구독·언어 전환 렌더링이 수량을 갱신한다. 별도 이벤트 버스/재화 모델은 추가하지 않는다.
- 기존 한영 코인 문구와 읽을 수 있는 금액을 유지하고 CSS 장식으로 아이콘을 표시한다. 소유 아이템의 보유 표시에는 가격 아이콘을 붙이지 않는다. 계정 조회 전 잔액은 `—`로 표시한다.
- PNG는 1254×1254, alpha>1 범위 `(359,406)–(896,943)`다. CSS에서 패딩 2px 포함 범위 `(357,404,541,541)`를 배경 크기 231.79%, 위치 50.07%/56.66%로 표시하고 pixelated를 적용한다. Vite의 상대 base 경로로 로컬과 GitHub Pages에서 같은 파일을 사용한다.
- 구매·수령 금액과 서버 SQL/저장 형식은 변경하지 않는다. 실제 브라우저·모바일의 최종 아이콘 크기는 별도 확인 대상이다.

## 박스 최종 프롬프트

Isolate and faithfully reconstruct ONLY the existing wooden crate from the provided reference images as a standalone transparent game sprite. Image 1 is the original corgi sheet: use the FIRST wooden crate in the bottom-row PUSH sequence. Image 2 is a close-up identifying exactly that crate. These are the approved target design, NOT loose inspiration. Preserve its plain nearly perfectly front-facing square silhouette, flat brown front panel, four simple border planks, and single diagonal plank rising from lower left to upper right. Match its understated warm muted medium-brown colors, restrained soft pixel-cluster shading, and low visual complexity next to the corgi. NO visible right side, NO projecting top or lid, NO isometric perspective, NO protruding rails, NO added grain specks, knots, cracks, nail heads, highlights or ornamental texture. Do not redesign into a shiny polished game icon. This must look like the same small modest crate lifted out of the sheet, not a more detailed upgrade. Remove all dogs, sheet background, labels, ground and shadows. Genuine transparent background. One crate only, centered with transparent padding, full silhouette intact. Preserve the reference's subtle pixel-art finish; do not impose large exaggerated stair-step pixels or create a fake 3D render.

## 코인 최종 프롬프트

Create ONE gold coin sprite prototype for the PawHaven cozy pixel-art platform game. The reference image is STYLE REFERENCE ONLY: match the simple wooden crate in the bottom-row PUSH sequence and the corgi's restrained soft pixel-cluster treatment. Subject: a single nearly front-facing round gold coin, simple readable circular silhouette, a modest raised rim and a plain recessed center. Warm muted golden yellow, ochre shadow and one pale gold highlight; understated 2–3 shading levels. Flat game-sprite presentation, very thin edge only, no isometric or thick 3D perspective. Match the modest detail of the reference crate. Crisp small pixel clusters with lightly stepped circular edges, not a smooth vector illustration, not exaggerated giant mosaic pixels. No emblem, currency letters, numbers, paw print, face or engraved decoration. No jewel-like gloss, metallic reflections, gradients, texture noise, sparkles, glow, motion or particles. One centered complete coin occupying about 60% of a square canvas with generous clear padding. Genuine transparent background, no floor or shadow, no labels, no sheet or extra objects. Keep it simple enough to read when displayed small beside the approved corgi.

## 펫 소파 최종 프롬프트

Create ONE small dog sofa-bed sprite for PawHaven, a cozy pixel-art pet game. It must unmistakably be PET FURNITURE sized for ONE small corgi, NOT a human armchair or a miniature human couch. A low, wide, shallow nesting dog bed with softly rounded chunky bolstered sides and a low wraparound back, a lowered open front entrance, and ONE continuous plump white oval-ish seat cushion. Black/charcoal fabric outer bolster and base, white inner cushion, soft light-gray cushion shadows. No tall backrest, no separate upright back cushion, no paired seat cushions, no conventional sofa legs, no human chair proportions. The bed sits directly on the ground. Nearly front-facing with just enough view into the nest to show where a puppy curls up. Simple modest soft pixel-art clusters matching the corgi and the small crate in the reference sheet. Restrained neutral palette, 2–3 shading levels, minimal detail, small-game-sprite readability. No fabric grain, stitching, tufting, buttons, logos, bows, paw emblem, extra pillows, blankets, gloss, realistic 3D rendering or exaggerated mosaic pixels. One complete isolated dog sofa-bed centered on a square canvas, generous padding. Genuine transparent background, NO glow, halo, floor, ground shadow, room, dog, text or other objects. Input image is STYLE REFERENCE ONLY; do not reproduce the sheet.
