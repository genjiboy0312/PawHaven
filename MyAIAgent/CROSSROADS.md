# 노을 갈림길 · 시간대 배경 (2026-10-26)

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
- SQL Editor 쿼리 이름: Sunset Crossroads Course.
- supabase/migrations/202610260018_crossroads_course.sql 전체 실행. 기존 007까지의 멀티 SQL이 선행되어야 한다.
- 허용 맵에 crossroads를 추가하고 pose/finish의 권위 있는 결승점을 5700으로 지정한다. 기존 방장 권한·레디 초기화·loaded 장벽·공통 출발 시각·권한 부여는 유지한다. forest는 싱글 전용이다.
- 로컬 PostgreSQL에서 방 생성/입장/레디/loaded/출발·이전 결승점에서 조기 완주 거절·5700 좌표 제한/완주·비방장 맵 변경 거절을 검증했다.

## 구름 장식 후속 제안
- 사용자가 배경과 분리한 구름 오브젝트로 속도감을 제안했다. 권장 방향은 충돌 없는 구름 2~3개를 캐릭터/발판 뒤에 배치하고 카메라의 20~30% 속도로 움직이는 것이다. 현재는 제안 단계이며 별도 구름 이미지/시차 코드는 추가하지 않았다. DB/SQL 변경은 필요하지 않다.

## 검증
- 전체 292개 테스트 중 맵 개수 표시 기대값 2개를 3→4로 갱신했고, 해당 파일 전체 74개 테스트를 재실행해 통과했다. 나머지 218개는 전체 실행에서 통과했다. 타입 검사·프로덕션 빌드 통과.
- 실제 DummyRun에서 30/60/120fps 각각 아래 공격 경로(4처치)와 위 발판 경로(0처치)를 18~24초·0피격·0낙하로 완주했다. oneWay의 아래 이동/상승 통과/위 착지와 기존 solid 천장 충돌도 확인했다.
- Chrome/Pixi에서 명랑이로 두 경로를 실제 PlayScene에서 완주하고, 시간대 4종·캐릭터 tint 유지·4개 맵 카드·노을 갈림길 선택을 확인했다. PNG 원본/배포 사본 바이트·크기와 공유 텍스처 보존도 검사했다.
- 운영 Supabase SQL은 사용자 실행 완료 확인이 필요하다. 싱글과 배경 확인은 SQL 없이 가능하다.
