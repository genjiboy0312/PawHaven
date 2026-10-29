# Stone Path Floor (2026-10-29)

- 로비 바닥 index 2의 ‘안개빛’을 **돌길 / Stone Path**로 교체한다. 기존 소유권·저장 ID·200코인 가격·구매 제한은 유지하며 새 SQL은 없다.
- 상점/홈 썸네일, 상점 미리보기, 홈 편집, 로비, 친구 홈 방문은 같은 PNG와 LobbyMap을 사용한다. loadHome에서 한 번 로드해 공유하며 160 world units 간격으로 TilingSprite에 반복한다. 캐릭터·가구·배경 색은 변경하지 않는다.
- 원본: `Resources/Stone_Path_Floor.png`. 배포용 동일 파일: `public/assets/home/stone-path.png`. 원본 PNG는 편집·재도색·축소하지 않고 그대로 복사했다.
- 제작 도구: imagegen 스킬의 내장 image_gen. 스타일 참고: `Resources/Cherry_Terrain_soil.png`. 절제된 회갈색 흙과 작은 회색 돌, 낮은 대비, 미세한 픽셀 클러스터를 유지한다. 과한 입체감·검정 외곽선·커다란 포장석을 추가하지 않는다.
- 새 리소스가 필요할 때 같은 타일을 재사용한다. 이번에는 게임 코스·공원 지형을 변경하지 않는다.

## 최종 프롬프트
Create ONE seamless repeating ground texture for PawHaven cozy 2D pixel animal game. Reference image is ONLY a pixel-cluster density and restrained detail guide. Asset is a small-pebble STONE PATH ground viewed directly from above, edge-to-edge full square. Muted warm light gray and gray-beige small irregular rounded stones scattered naturally in subdued taupe earth, some interlocking stones but NOT uniform large paving slabs, sparse tiny pale sandy gaps. Use flat restrained 2-3-tone pixel clusters with subtle top-left light, matching reference's simple game texture at 160 world-unit tiling. Recognizable little stones about 1/12 to 1/20 of tile width, moderate spacing; neutral warm gray dominates so it differs clearly from beige sand and green grass. Soft low contrast, not shiny. Crisp square pixel clusters, no smooth vector edges, photoreal noise, 3D depth, black heavy outlines, perspective or giant mosaic. Seamless horizontally and vertically; edges must meet without border or bands. No grass fringe, flowers, characters, props, UI, text, watermark, horizon, sky, cast shadows, checkerboard. Entire square opaque, one texture only, no showcase mockup.

## 검증
관련 DB/컴포넌트 테스트 4개, 타입 검사·프로덕션 빌드 통과. 원본·배포 PNG 동일성, 기본/봄 모래/돌길 전환, 공유 텍스처 생존을 확인했다. 실제 Chrome 960×540·640×360에서 1000→800코인 구매, 구매 후 바닥 0 유지, 홈에서 2 선택, 로비 텍스처 공유, 런타임 오류 없음을 확인했다.
