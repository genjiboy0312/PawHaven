# 노을 갈림길 · 시간대 배경 (2026-10-26)

벚꽃 테마 및 하늘 구매 규칙(2026-10-29): [CHERRY_SKY.md](CHERRY_SKY.md). 하늘 5종을 Resources에 보관하며 기본 아침만 무료, 나머지는 각 200코인이다. 새 타일과 기존 벚꽃나무로 싱글 벚꽃 산책길을 구성하고 기존 코스/효과를 재사용한다.

## 최종 이미지 프롬프트
morning: Use case: lighting-weather. Edit the referenced PawHaven pixel-art panoramic game background into ONE time-of-day variant. Keep exactly its wide 3:1 panoramic framing, composition, cloud silhouettes, distant tree line, modest crisp fine pixel clusters and cozy muted palette. Opaque full canvas, preferably 2160x720. This is a distant BACKGROUND layer only, no floor or foreground lawn, no characters, furniture, platforms, text, UI, watermark, gradients of photorealistic lighting, vignette, or 3D rendering. Preserve all distant tree and cloud forms; adjust only atmospheric colors and time-of-day lighting. Keep the distant greenery confined to bottom 30 percent so playable objects remain readable. MORNING variant: pale warm apricot light near the horizon, soft cool powder-blue upper sky, cream clouds with delicate peach underside, muted sage greenery with gentle morning warmth. Calm fresh early morning; no harsh bright sun disk.
noon: Use case: lighting-weather. Edit the referenced PawHaven pixel-art panoramic game background into ONE time-of-day variant. Keep exactly its wide 3:1 panoramic framing, composition, cloud silhouettes, distant tree line, modest crisp fine pixel clusters and cozy muted palette. Opaque full canvas, preferably 2160x720. This is a distant BACKGROUND layer only, no floor or foreground lawn, no characters, furniture, platforms, text, UI, watermark, gradients of photorealistic lighting, vignette, or 3D rendering. Preserve all distant tree and cloud forms; adjust only atmospheric colors and time-of-day lighting. Keep the distant greenery confined to bottom 30 percent so playable objects remain readable. NOON variant: clear soft cornflower-blue sky, warm ivory clouds with tiny cool shadows, balanced muted fresh green tree line. Cheerful clear midday, readable restrained colors, no harsh saturation or strong sun rays.
sunset: Use case: lighting-weather. Edit the referenced PawHaven pixel-art panoramic game background into ONE time-of-day variant. Keep exactly its wide 3:1 panoramic framing, composition, cloud silhouettes, distant tree line, modest crisp fine pixel clusters and cozy muted palette. Opaque full canvas, preferably 2160x720. This is a distant BACKGROUND layer only, no floor or foreground lawn, no characters, furniture, platforms, text, UI, watermark, gradients of photorealistic lighting, vignette, or 3D rendering. Preserve all distant tree and cloud forms; adjust only atmospheric colors and time-of-day lighting. Keep the distant greenery confined to bottom 30 percent so playable objects remain readable. SUNSET variant: dusty lavender-blue upper sky blending through muted rose and soft peach near the horizon, restrained warm cream/apricot cloud edges, distant trees in subdued olive and slate green. Warm gentle sunset, no exaggerated glow or saturated orange wash.
night: Use case: lighting-weather. Edit the referenced PawHaven pixel-art panoramic game background into ONE time-of-day variant. Keep exactly its wide 3:1 panoramic framing, composition, cloud silhouettes, distant tree line, modest crisp fine pixel clusters and cozy muted palette. Opaque full canvas, preferably 2160x720. This is a distant BACKGROUND layer only, no floor or foreground lawn, no characters, furniture, platforms, text, UI, watermark, gradients of photorealistic lighting, vignette, or 3D rendering. Preserve all distant tree and cloud forms; adjust only atmospheric colors and time-of-day lighting. Keep the distant greenery confined to bottom 30 percent so playable objects remain readable. NIGHT variant: muted dusk navy and periwinkle sky, soft blue-gray clouds with pale silver edges, blue-sage distant trees; a small pale cream crescent moon and a very few tiny subtle pixel stars in open sky. Peaceful evening, keep silhouettes readable and lighter than black; no neon, no glowing foreground.

## 승인 범위와 구조
- 기존 잔디/흙 타일·표식·뱀·플레이 조작을 재사용한 약 18~24초 코스다. 내부 ID는 crossroads, 한글 이름은 노을 갈림길, 영어 이름은 Sunset Crossroads다. 결승점 5700, 체크포인트 3350, 상자 3300/5050.
- 아래는 연속된 지면과 개인별 뱀 4마리, 위는 높이 60→120→150의 선택 발판길이다. 중간 쉼터에서 합류 후 두 번째 선택 구간을 지나 같은 결승점으로 간다. 위에서 떨어져도 아래 길로 계속 진행할 수 있다. 플레이어 간 공격은 기존처럼 비활성화한다.
- CourseSolid.oneWay는 아래/옆에서 통과하고 위에서 내려올 때만 착지하는 선택 옵션이다. 기존 solid의 벽/천장 충돌은 유지한다. 지형 아트와 별도로 물리 데이터를 정의하며 속도/점프 높이는 바꾸지 않는다.
- SINGLE_RECORDS와 기존 맵 선택 패널/결과창/멀티 RoomClient/카운트다운/순위를 재사용한다. COURSE_SNAKES의 절대 시각 순찰·개인별 처치·접촉·피드백을 그대로 사용한다.

## 시간대 리소스
- built-in image_gen, imagegen 스킬 사용. 참고는 public/assets/home/garden-background.png의 기존 도트 배경이다. 구도/구름/수목 실루엣과 픽셀 밀도를 유지하고 시간대만 변경했다. 각 PNG를 별도로 생성했고 원본을 재가공하지 않고 복사한다.
- Resources/Park_Background_morning.png → public/assets/backgrounds/morning.png (정원)
- Resources/Park_Background_noon.png → public/assets/backgrounds/noon.png (연습장)
- Resources/Park_Background_sunset.png → public/assets/backgrounds/sunset.png (노을 갈림길)
- Resources/Park_Background_night.png → public/assets/backgrounds/night.png (숲길)
- 모두 2172×724. Game이 한 번 로드하고 공유하며 courseBackdrop은 960×365의 독립 배경으로 그린다. 강아지/장비/지형/UI에는 밤색 tint를 적용하지 않는다. 같은 배경을 맵 카드 미리보기에도 사용한다. 로비/Home의 기존 선택 배경은 유지한다.

## 서버 적용
- 사용자에게 2026-10-26 SQL 등록 완료를 확인받았다. 아래 moving platform에는 신규 SQL이 필요하지 않다.
- SQL Editor 쿼리 이름: Sunset Crossroads Course.
- supabase/migrations/202610260018_crossroads_course.sql 전체 실행. 기존 007까지의 멀티 SQL이 선행되어야 한다.
- 허용 맵에 crossroads를 추가하고 pose/finish의 권위 있는 결승점을 5700으로 지정한다. 기존 방장 권한·레디 초기화·loaded 장벽·공통 출발 시각·권한 부여는 유지한다. forest는 싱글 전용이다.
- 로컬 PostgreSQL에서 방 생성/입장/레디/loaded/출발·이전 결승점에서 조기 완주 거절·5700 좌표 제한/완주·비방장 맵 변경 거절을 검증했다.

## 하늘 구름 오브젝트 (2026-10-26)
- 최종 생성 프롬프트: Use case: stylized-concept. Asset type: one reusable transparent sky cloud sprite for PawHaven, a cozy side-scrolling 2D pixel game. The reference is ONLY a style guide for its gentle detailed pixel clouds. Create ONE isolated low horizontal puffy cloud, with a few small rounded rising lobes and an irregular subtly tapered flat underside. Warm ivory/cream lights, very subtle cool pale blue-gray shadow clusters, modest fine square pixel clusters matching the reference. Shape roughly 3:1 width to height, centered in the canvas with at least 12 percent fully transparent padding on every side. No blue sky, no gradient wash, no ground, no trees, no objects, no text, no border, no glow or outer shadow, no baked checkerboard. Not a smooth vector icon, not 3D, not exaggerated large mosaic pixels. Entire cloud silhouette opaque; genuine transparent background outside it. One cloud only, designed to remain legible around 180 pixels wide in game. Keep it pale enough for runtime time-of-day color tinting.
- 사용자는 구름을 캐릭터 주변이 아닌 하늘 맵 영역에만 배치하는 것으로 확정했다. SkyClouds는 화면 y=0~132에 고정된 클립 마스크 안에만 표시하며 캐릭터의 높이·위아래 이동을 따라가지 않는다. 지형 위쪽 하늘에 위치하는 충돌 없는 장식이고 DB/SQL·네트워크 상태는 추가하지 않는다.
- Resources/Sky_Cloud.png → public/assets/backgrounds/cloud.png. built-in image_gen으로 기존 한낮 배경의 구름 도트 밀도를 참고해 투명 구름 한 장을 생성했다. 원본을 다시 그리거나 배경 제거하지 않고 바이트가 같은 파일을 복사한다. RGBA 2172×724, alpha 범위 0~255, alpha>8 경계 (370,215,1799,555), 외곽 최대 alpha 1/255를 확인했다.
- 같은 텍스처를 폭 280/230/300의 Sprite 3개로 재사용하고 화면 y=4/52/22에 배치한다. 카메라 이동량×PLAY_ZOOM의 18%/24%/30%만큼 움직이며 화면 밖에서 반복한다. 렌더 횟수·fps와 무관한 절대 위치 계산이다. 기본 배경의 먼 구름은 유지한다.
- 시간대별 구름에만 크림/화이트/연한 복숭아/블루 tint와 낮은 alpha를 적용한다. 강아지/장비/지형은 tint하지 않는다. loadCourseBackgrounds에서 한 번 로드해 공유하며 씬 종료 시 공용 텍스처를 파괴하지 않는다.
- 전체 293개 테스트 통과. 반복 렌더링·큰 이동·잘못된 입력에서도 하늘 높이/유한 좌표를 유지하고 텍스처를 보존하는지 검증했다. Chrome/Pixi에서 4개 맵의 클립 영역·카메라 시차·점프 높이와 독립된 위치·강아지 색상 유지도 확인했다.

## 움직이는 발판 (2026-10-26)
- 위쪽 x=1740, 폭 400, 높이 150 발판 한 개만 기준 x의 ±48 범위에서 4.8초 주기의 sine 이동을 한다. 아래 길·뱀·결승점·새 이미지 리소스는 변경하지 않는다.
- CourseSolid.motion={distance,period}와 MovingPlatform을 사용한다. 각 DummyRun이 움직이는 solid만 복사하므로 코스 원본/다른 참가자의 실행 상태가 섞이지 않는다. 기존 지형 타일을 CourseTerrain에서 그대로 재사용하며 렌더 위치를 물리 solid에서 읽는다. 단순 Graphics 경로도 같은 좌표로 갱신한다.
- 1/120초 물리 단계에서 이전 발판 위에 서 있는 플레이어에게 해당 단계의 발판 delta를 더한다. 점프/걸어서 이탈하면 탑승 이동을 해제하고 아래 길로 떨어질 수 있다. 발판 탑승 중에는 기존 pose.vx에 발판 속도도 포함해 상대 캐릭터 보간이 뒤처지지 않게 한다.
- 기존 뱀과 동일한 공통 race time으로 발판 위치를 계산한다. 시작 전에는 초기 위치를 유지하며, 재접속/일시정지 복귀 때는 프레임 시작 위치로 재동기화하여 지나간 시간만큼 플레이어를 한 번에 밀지 않는다. 이동 위치 방송·신규 RPC/SQL을 추가하지 않는다.
- 위 경로 자동 검증에서는 움직이는 실시간 발판 끝도 고려해 도약한다. 발판을 놓쳐도 연속된 아래 지면으로 떨어지므로 강제 실패/낙하 판정을 추가하지 않는다.
- 전체 296개 테스트·타입 검사·빌드 통과. 30/60/120fps 탑승/점프/이탈, 공통 시각·늦은 씬/복구·원본 상태 분리, 아트/충돌 위치 일치를 검증했다. Chrome/Pixi의 실제 명랑이·지형에서 서로 다른 fps의 두 클라이언트가 같은 발판/탑승 위치를 보이는지, 기존 pose에 탑승 속도가 반영되는지, 점프 후 분리·재착지하는지도 확인했다. 실제 별도 기기 네트워크 테스트는 배포 후 확인할 수 있다.

## 검증
- 전체 292개 테스트 중 맵 개수 표시 기대값 2개를 3→4로 갱신했고, 해당 파일 전체 74개 테스트를 재실행해 통과했다. 나머지 218개는 전체 실행에서 통과했다. 타입 검사·프로덕션 빌드 통과.
- 실제 DummyRun에서 30/60/120fps 각각 아래 공격 경로(4처치)와 위 발판 경로(0처치)를 18~24초·0피격·0낙하로 완주했다. oneWay의 아래 이동/상승 통과/위 착지와 기존 solid 천장 충돌도 확인했다.
- Chrome/Pixi에서 명랑이로 두 경로를 실제 PlayScene에서 완주하고, 시간대 4종·캐릭터 tint 유지·4개 맵 카드·노을 갈림길 선택을 확인했다. PNG 원본/배포 사본 바이트·크기와 공유 텍스처 보존도 검사했다.
- 운영 Supabase SQL은 사용자 실행 완료 확인을 받았다. 이동 발판은 같은 레이스 출발 시각만 사용한다.
