# Stone Path Floor (2026-10-29)

- 로비 바닥 index 2의 ‘안개빛’을 **돌길 / Stone Path**로 교체한다. 기존 소유권·저장 ID·200코인 가격·구매 제한은 유지하며 새 SQL은 없다.
- 상점/홈 썸네일, 상점 미리보기, 홈 편집, 로비, 친구 홈 방문은 같은 PNG와 LobbyMap을 사용한다. loadHome에서 한 번 로드해 공유하며 160 world units 간격으로 TilingSprite에 반복한다. 캐릭터·가구·배경 색은 변경하지 않는다.
- 원본: `Resources/Stone_Path_Floor.png`. 배포용 동일 파일: `public/assets/home/stone-path.png`. 원본 PNG는 편집·재도색·축소하지 않고 그대로 복사했다.
- 제작 도구: imagegen 스킬의 내장 image_gen. 스타일 참고: `Resources/Cherry_Terrain_soil.png`. 절제된 회갈색 흙과 작은 회색 돌, 낮은 대비, 미세한 픽셀 클러스터를 유지한다. 과한 입체감·검정 외곽선·커다란 포장석을 추가하지 않는다.
- 숲길 게임 맵에서도 같은 타일을 재사용한다. 공원 지형은 유지한다. 게임 맵 테마는 로비 바닥 구매 여부와 별개다.

## 최종 프롬프트
Create ONE seamless repeating ground texture for PawHaven cozy 2D pixel animal game. Reference image is ONLY a pixel-cluster density and restrained detail guide. Asset is a small-pebble STONE PATH ground viewed directly from above, edge-to-edge full square. Muted warm light gray and gray-beige small irregular rounded stones scattered naturally in subdued taupe earth, some interlocking stones but NOT uniform large paving slabs, sparse tiny pale sandy gaps. Use flat restrained 2-3-tone pixel clusters with subtle top-left light, matching reference's simple game texture at 160 world-unit tiling. Recognizable little stones about 1/12 to 1/20 of tile width, moderate spacing; neutral warm gray dominates so it differs clearly from beige sand and green grass. Soft low contrast, not shiny. Crisp square pixel clusters, no smooth vector edges, photoreal noise, 3D depth, black heavy outlines, perspective or giant mosaic. Seamless horizontally and vertically; edges must meet without border or bands. No grass fringe, flowers, characters, props, UI, text, watermark, horizon, sky, cast shadows, checkerboard. Entire square opaque, one texture only, no showcase mockup.

## 검증
관련 DB/컴포넌트 테스트 4개, 타입 검사·프로덕션 빌드 통과. 원본·배포 PNG 동일성, 기본/봄 모래/돌길 전환, 공유 텍스처 생존을 확인했다. 실제 Chrome 960×540·640×360에서 1000→800코인 구매, 구매 후 바닥 0 유지, 홈에서 2 선택, 로비 텍스처 공유, 런타임 오류 없음을 확인했다.

## 숲길 지형 재사용 (2026-10-29)
- courseThemeArt가 숲길의 지표·내부를 stoneFloor로 선택하고 160 world units로 반복한다. 로비와 같은 텍스처 객체를 공유하며 새 이미지·복사본·SQL·네트워크 상태를 추가하지 않는다.
- loadCourseArt는 loadHome에서 받은 stoneFloor를 우선 사용하고 없을 때만 같은 Assets 경로로 로드한다. 씬 전환에서 공유 Texture를 파괴하지 않고 Game 종료 때 정리한다.
- 정원·연습장·노을 갈림길은 기존 잔디/흙, 벚꽃 산책길은 기존 밝은 잔디/모래를 유지한다. 공통 CourseTerrain 렌더러와 마커를 재사용한다.
- 코스 solids·발판·낭떠러지·나무 배치·밤하늘·캐릭터 색·코인·상자·뱀·보상은 변경하지 않는다.
- 관련 테스트 83개 및 타입 검사·빌드 통과. 새 테스트는 실제 PlayScene에서 숲길 텍스처·좌표·폭·타일 배율·코스 원본 보존·다른 테마·공유 Texture 생존을 확인한다. Chrome/Pixi 960×540·640×360에서 시작/체크포인트, 로비와 동일 Texture 객체, 정원/벚꽃 테마 유지, 런타임 오류 없음을 확인했다.
