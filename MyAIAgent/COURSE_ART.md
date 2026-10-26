# 맵 지형·코스 표식 리소스 (2026-10-21)

## 낭떠러지 배경 (2026-10-27)
- 지형이 없는 낭떠러지는 별도 단색 면을 추가하지 않는다. courseBackdrop은 공통 WORLD_WIDTH×WORLD_HEIGHT 전체를 덮어 바닥 아래 빈 공간에도 시간대별 배경이 보이게 한다. 바닥 높이까지만 배경을 그리면 빈 공간에서 fallback 단색이 드러나므로 다시 축소하지 않는다. 기존 배경 PNG를 재사용하며 지형·충돌·낙하 판정은 유지한다.

## 시간대 배경·갈림길 확장 (2026-10-26)
- [CROSSROADS.md](CROSSROADS.md)의 아침/한낮/노을/밤 원본 PNG 4장과 고정 맵별 시간대를 사용한다. Game 공유 로딩과 맵 카드 미리보기에 연결하며 캐릭터 색상은 바꾸지 않는다. 기존 로비 배경은 유지한다.
- 새 노을 갈림길은 기존 잔디/흙 타일을 재사용하고 CourseSolid.oneWay 발판 옵션으로 아래 길 통과와 위 착지를 구분한다. 지형 픽셀과 물리 크기는 같은 CourseSolid를 기준으로 한다.
- 움직이는 발판은 CourseSolid.motion과 MovingPlatform으로 실행별 위치를 계산하고 CourseTerrain.update가 같은 solid 좌표를 읽는다. 기존 타일을 재생성하지 않는다. 상세는 CROSSROADS.md의 움직이는 발판 절을 참고한다.

사용자 요청 1번(잔디·흙 지형), 2번(출발·체크포인트·피니시 표식)을 built-in image_gen으로 제작했다. 생성 즉시 각각 Resources에 저장하고 배포용 PNG는 원본과 바이트가 같게 복사했다. 코기 PUSH 행 상자와 채택 Wooden_Box_Prototype을 스타일 기준으로 사용했다.

| 용도 | 원본 | 배포용 |
|---|---|---|
| 잔디·흙 상단 | Resources/Terrain_Grass_Soil_Tile.png | public/assets/course/grass-soil.png |
| 흙 채움 | Resources/Terrain_Soil_Fill_Tile.png | public/assets/course/soil-fill.png |
| 출발 | Resources/Course_Start_Flag.png | public/assets/course/start-flag.png |
| 체크포인트 | Resources/Course_Checkpoint_Flag.png | public/assets/course/checkpoint-flag.png |
| 피니시 | Resources/Course_Finish_Flag.png | public/assets/course/finish-flag.png |

## 이미지 검증과 런타임 규격

- 원본 PNG를 스크립트로 다시 그리거나 리사이즈·배경 제거하지 않았다. Python/Pillow는 크기·알파·발 기준점 분석과 JSON 기록에만 사용했다.
- 잔디 타일은 1295×1215, 흙 타일은 1254×1254이며 전체 불투명이다. 표식 3개는 각각 1215×1295, 최소 알파 0/이미지 외곽 최대 알파 0이다.
- 표식의 alpha>1 영역에 2px 여유를 둔 Texture.frame, 아래쪽 불투명 픽셀의 수평 평균으로 구한 발 X, 발 Y를 frames.json에 기록했다. 원본 파일의 투명 여백은 보존한다.
- CourseArt.ts에서 5개 PNG와 frames.json을 한 번 읽어 공유한다. 지형은 TilingSprite로 월드 96×96 단위 반복, 상단 잔디와 흙 채움을 분리한다. 짧은 발판은 표면 영역을 실제 충돌 높이 안으로 제한한다.
- CourseSolid의 x/width/top/bottom과 물리는 그대로 사용한다. 아트 때문에 발판·틈·점프·대시·캐릭터 크기를 바꾸지 않는다.
- 표식의 실제 보이는 높이는 월드 110으로 맞추고 측정된 깃대 발이 COURSE_GROUND=390에 닿도록 anchor를 계산한다. 표식 x는 기존 출발/체크포인트/피니시 좌표다.
- 출발은 초록 삼각기, 체크포인트는 노랑 깃발, 피니시는 흑백 체크무늬다. 기존 언어별 텍스트를 유지한다. 체크포인트는 통과 전 alpha 0.6/어두운 tint, 통과 후 alpha 1/원래 색으로 표시한다.
- 싱글 3개 코스와 기존 멀티 코스에 적용했다. forest 멀티 공개 여부나 서버 규칙은 바꾸지 않았다. 추가 SQL은 없다.
- 공용 텍스처는 씬마다 파괴하지 않고 Game.releaseFrames에서 정리한다. 테스트/독립 PlayScene 호출에서 art를 전달하지 않을 때 기존 단순 도형 경로를 유지한다.
- 165개 테스트·타입 검사·빌드 통과. 원본/배포 이미지 동일성·PNG 크기·프레임 경계, 모든 코스의 타일/충돌 영역 일치, 표식 발 정렬과 실제 표시 높이, 체크포인트 활성화와 공용 텍스처 보존을 검증했다.
- 원본 이미지는 직접 시각 확인했다. 자동 브라우저 미리보기는 CUA 연결 오류로 완료하지 못했으므로 실제 모바일 외형·반복 타일 경계 확인은 배포 후 필요하다.

## 실제 사용한 생성 프롬프트

### 잔디·흙 상단
Create one square horizontally seamless GRASS-OVER-SOIL terrain texture tile for the side-view pixel-art game PawHaven. Reference is style only: match the modest soft pixel clusters and restrained detail of the approved wooden crate. This is a FLAT RECTANGULAR TILE TEXTURE filling the ENTIRE square image edge to edge, NOT an isolated floating block, no perspective, no outer outline, no margins, no background. Top 15 percent is a muted sage-green grassy cap with a flat level walkable top edge flush to the image top, and a slightly irregular pixel-cluster underside. Bottom 85 percent is warm muted medium tan-brown earth, mostly uniform with only a few low-contrast small soil patches. Two or three broad shading tones per material, no smooth gradients, no detailed grain or pebbles, no flowers, plants, rocks, characters, text, lighting effects or shadows. Left and right edges must meet seamlessly when repeated. Soft restrained pixel art matching the corgi crate, no giant mosaic pixels, no shiny or photorealistic treatment. Opaque image; every pixel belongs to grass or soil.

### Terrain_Soil_Fill_Tile.png

Create one square seamless SOIL FILL texture tile, using the brown earth in the reference grass-over-soil tile as the exact palette and pixel-detail guide. Entire image filled edge-to-edge with muted warm medium tan-brown earth, only a few sparse low-contrast pixel-cluster patches, simple two or three tones. NO green grass anywhere, no edge bands or borders, no margins, no isolated block, no perspective, no lighting gradients, no stones, roots, cracks, decorative objects, characters or text. All four edges should blend when tiled. Flat modest pixel-art texture, not gritty realistic soil and not exaggerated mosaic pixels. Opaque square texture.

### Course_Start_Flag.png

Standalone small side-view pixel-art course flag sprite for PawHaven. Match the simple restrained pixel-cluster finish of the wooden crate reference, not a glossy illustration. One thin straight warm-brown wooden pole with flat bottom and a simple cloth flag near its top extending to the RIGHT. Front/side view, modest detail and 2–3 shading levels. Complete flag and full pole centered with generous clear padding. No stand, pedestal, grass, floor, ground shadow, glow, text, letters, extra objects or characters. Genuine transparent background. Keep it readable at a small game size. START flag: muted fresh sage-green triangular pennant, one subtle lighter-green edge and one simple darker-green fold. No icons or emblems.

### Course_Checkpoint_Flag.png

Standalone small side-view pixel-art course flag sprite for PawHaven. Match the simple restrained pixel-cluster finish of the wooden crate reference, not a glossy illustration. One thin straight warm-brown wooden pole with flat bottom and a simple cloth flag near its top extending to the RIGHT. Front/side view, modest detail and 2–3 shading levels. Complete flag and full pole centered with generous clear padding. No stand, pedestal, grass, floor, ground shadow, glow, text, letters, extra objects or characters. Genuine transparent background. Keep it readable at a small game size. CHECKPOINT flag: muted warm golden-yellow rectangular cloth with one shallow notch at the right edge, a pale cream edge and restrained ochre fold. No icons or emblems.

### Course_Finish_Flag.png

Standalone small side-view pixel-art course flag sprite for PawHaven. Match the simple restrained pixel-cluster finish of the wooden crate reference, not a glossy illustration. One thin straight warm-brown wooden pole with flat bottom and a simple cloth flag near its top extending to the RIGHT. Front/side view, modest detail and 2–3 shading levels. Complete flag and full pole centered with generous clear padding. No stand, pedestal, grass, floor, ground shadow, glow, text, letters, extra objects or characters. Genuine transparent background. Keep it readable at a small game size. FINISH flag: a small rectangular black-and-cream checkerboard racing flag, just a few broad readable checker squares and a slight relaxed cloth fold. No other symbols.

