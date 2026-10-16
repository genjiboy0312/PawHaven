# 명랑이 Idle 프로토타입

2026-10-16. 사용자 반려견 명랑이의 사진을 바탕으로 Idle만 제작했다. 기존 게임의 코기는 그림체 참고이며 명랑이를 코기로 바꾸지 않는다. 사용자의 이번 요청이 Idle 한정이므로 공통 16행동 제작보다 이 범위를 우선한다.

- 제작 도구: built-in image_gen, 투명 PNG.
- 이미지: Resources/Myeongrang_Idle_Prototype.png (1774×887).
- 프레임/행동 메타데이터: Resources/Actions/myeongrang-actions.json.
- 반복 미리보기: Resources/Myeongrang_Idle_Preview.html. 로컬에서 열 수 있으며 원본 PNG를 참조하고 프레임 정보는 HTML 안에 포함한다.
- 4열×2행, 총 8프레임. 앉아서 숨쉬기와 눈깜빡임. 기본 4 FPS.
- 갈색 털, 눈·주둥이의 흰 무늬, 이마 중앙 갈색 무늬, 흰 가슴·발, 큰 귀와 위로 말린 풍성한 갈색 꼬리를 반영했다. 품종은 단정하지 않는다.
- 사용한 사진 입력은 20655·20659·20682·20899, Corgi_Art_Sheet는 스타일 입력이다. 산책 사진 20677은 전체 인상 참고로 확인했다. 개인 원본 사진은 Git에 추가하지 않는다.
- 홀수 픽셀 크기여서 실제 셀은 443/444씩 다르다. 열·행 경계를 내림하여 빠짐/중복 없이 전체 시트를 나눴다. 프레임의 원본 셀을 유지하고 기준점만 측정했으며 이미지를 다시 그리거나 배경 제거하지 않았다.
- 8개 셀의 테두리 최대 알파는 1~2/255로 몸체가 셀 경계에서 잘리지 않는지 확인했다. alpha>128 범위에서 중심·발 기준선을 구해 미리보기의 위치를 정렬했다. 실제 반복 동작/닮은 정도는 사용자 확인 후 조정한다.
- runtimeReady=false. 이번에는 게임 캐릭터 목록/로비/플레이에 추가하지 않았다. 다른 행동·의상 부착점도 만들지 않았다. 모습 확정 후 기존 AnimalConfig 구조에 연결한다.

## 최종 생성 프롬프트

Use case: stylized-concept. Create a production-style prototype IDLE SPRITE SHEET of the specific beloved pet dog MYEONGRANG from the four supplied photographs. Photos 1–4 are identity references, not interchangeable breed examples. The final corgi art sheet is STYLE ONLY. Preserve Myeongrang's individual identity: small reddish chestnut/tan brown dog, large upright pointed ears with paler inner fur and wispy edges, very large glossy dark eyes, small black nose, gently pointed white muzzle with tiny dark freckles, white/cream mask around eyes and muzzle, a distinct brown central forehead wedge tapering downward between the eyes, fluffy white chest bib, slender white lower legs and paws with a few brown/gray speckles, longer/slimmer legs than a corgi, chestnut body and a feathered brown upward-curled tail. Subtle wispy chest and haunch fur, not an overly fluffy round Pomeranian. Do not turn this dog into a corgi or generic puppy. Warm, recognizable, affectionate expression, natural proportions gently stylized for the existing cozy game.
Asset: exactly EIGHT IDLE frames in a uniform FOUR COLUMNS x TWO ROWS grid, read left-to-right top-to-bottom. All frames depict the SAME dog calmly sitting, three-quarter view facing RIGHT, same scale, same full silhouette, paws on an identical baseline around 82% of each cell. Gentle breathing cycle and one slow blink: frame1 open eyes resting, frame2 tiny chest inhale, frame3 slightly fuller chest, frame4 half blink, frame5 softly closed eyelids, frame6 reopening eyes, frame7 exhale, frame8 return close to frame1. Tiny restrained tail/ear settling only, NO walking, NO different poses, NO extra dogs in any cell. Keep all ears, tail and paws inside the central 65% of each cell with broad truly transparent gutters; NO elements touch cell boundaries. Keep the body anchored, no baked vertical jump or ground movement.
Style: match the supplied PawHaven corgi sheet's warm detailed pixel clusters, soft cream highlights and gentle brown shading, clear readable silhouette, visibly intentional square pixel edges, no photoreal texture, no vector outlines, no smooth blurred illustration.
Background must be genuine transparent alpha. Bodies ONLY, NO shadows, NO glow, NO floor, NO scenery, NO accessories, NO collar or leash, NO motion effects, NO hearts, NO captions, NO labels, NO grid lines, NO panels or frame borders. Wide landscape sheet, ideally 2:1. This is only the initial Idle art prototype, not the complete action set.

후속 작업: 승인된 Idle 원본을 유지하고 게임 연결을 완료했다. 현재 상태·리소스·검증은 [MYEONGRANG_ANIMATION.md](MYEONGRANG_ANIMATION.md)를 확인한다.
