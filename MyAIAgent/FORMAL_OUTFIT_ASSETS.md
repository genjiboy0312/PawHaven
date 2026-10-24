# 정장 아이템 리소스 (2026-10-24)

## 게임 연동 (후속 사용자 승인, 2026-10-24)
- 원본 PNG를 변경하지 않고 public/assets/items/black-top-hat.png, red-bow-tie.png에 복사했다. Hat:2 검정 탑햇 / Acc:2 빨간 나비넥타이다. 기본 소유 슬롯 1번은 유지한다. 이전 프로토타입에서 2번을 이미 소유했다면 기존 권리를 유지한다.
- 기존 상품 가격 함수·구매 확인·소유권·캐릭터 저장·공용 프리셋·서버 외형을 재사용한다. 각 아이템은 현재 공통 가격 규칙상 75 Coins다. 새 SQL은 필요 없다. 상점 선택은 사본 미리보기, 구매 후 착용하기로 실제 저장한다.
- Wearables.ts에 이미지·아이템 이름·크기·기준점·부착 위치를 모았다. AnimalAnimationController와 PetPortrait가 같은 wornLayers를 사용한다. 모자·넥타이는 독립 레이어이며 로비·Character·Shop·Play·멀티 원격 동물·대기방·결과 화면에 재사용한다.
- 검정 탑햇: 전체 1536×1024, 챙 기준 (768,738), 맞춤 폭 850. 사용자 요청으로 700→850으로 변경해 실제 크기를 약 18% 줄였다. 나비넥타이: 매듭 기준 (768,535), 맞춤 폭 995. 산타모자 기존 수치는 유지한다. 원본을 타이트하게 자르지 않는다.
- 최초 연결의 머리 위치 기반 추정은 사용자가 이동 시 어색함을 확인해 제거했다. 코기 40개·명랑이 32개 실제 몸체 프레임의 목/가슴 위치를 8×8 검토 격자에서 수동 선택했다. scripts/measure-neck-points.mjs가 이 선택값을 발 원점 기준 좌표로 변환한다. 원본은 Resources/Actions/<pet>-neck-anchors.json, 사본은 public/assets/characters/<pet>/neck-anchors.json이다. Fall/Land는 해당 Jump 프레임 좌표를 공유한다.
- applyNeckAnchors가 프레임 수·유한값·양수 폭을 검증해 각 클립에 지정한다. 머리 앵커 변화가 넥타이에 전파되지 않으며, 목 좌표가 없는 클립에는 넥타이를 임의로 그리지 않는다. 폭도 동작별 배율을 고려해 일정하게 정규화한다. 같은 neck 데이터는 후속 목걸이·스카프에 재사용한다.
- 몸체·점프·좌우 반전을 자식 Sprite로 함께 따르고, DOM에서도 동일한 trim/orig 좌표를 적용한다. 각 참가자의 outfit을 사용해 내 외형이 타인에게 누출되지 않게 한다. 클립·장착 변경 시 미사용 레이어를 숨기거나 제거한다. 공용 텍스처는 Game 종료 때 한 번만 정리한다.
- Chrome 실제 리소스 합성으로 코기·명랑이 Idle/Walk/Run/Jump/Attack/Skill 첫 프레임과 마지막 프레임 좌우 반전, 600×480 상점 Acc 탭을 확인했다. 실기기·운영 두 계정 실시간 확인은 별도다.
- 최종 검증: 전체 232개 자동 테스트·타입 검사·프로덕션 빌드 통과. 동물별 전 동작 부착·방향 반전·모자/넥타이 독립 해제·측정 neck 우선·리소스 복사 일치·미리보기 외형 분리·구매 후 명시적 착용 저장·대기방 DOM 두 레이어 분리를 검증했다.

아래는 연동 전 제작 단계 기록이다.

- 사용자 승인 범위는 리소스 제작·Resources 저장까지다. 게임 착용·상품 등록·SQL 변경은 진행하지 않았다.
- 제작 도구: built-in image_gen. 산타모자(public/assets/items/santa-hat.png)와 검정·화이트 펫 소파(Resources/Pet_Sofa_Black_White_Prototype.png)는 스타일 참고로만 사용했다.
- 산타모자처럼 평면 2D 픽셀 클러스터, 단순한 실루엣, 절제된 명암을 사용했다. 검정 실크해트는 빨간 띠, 나비넥타이는 같은 붉은 계열이다. 동물·목·셔츠·스트랩·UI 배경 없이 아이템만 분리했다.
- PNG 생성 원본의 알파와 캔버스를 그대로 보존했다. 재그리기·배경 제거·리사이즈·타이트한 자르기를 하지 않았다. 복사 전후 SHA-256 일치를 확인했다.
- 두 이미지 모두 1536×1024 RGBA다. alpha>1 경계: Black Top Hat (297,240)–(1239,805), Red Bow Tie (270,306)–(1264,758). 모서리 알파 0, 사방 여백을 확인했다.
- 밝은 크림 배경의 Chrome 미리보기와 축소 표시에서 투명 배경·외곽·픽셀 밀도를 확인했다. 검정 바탕 생성 미리보기의 외곽 색 번짐과 실제 합성 결과를 구분한다. 실제 동물 부착·애니메이션 정렬은 아직 미확인이다.
- 이후 연동 시 실크해트 챙/넥타이 매듭 기준점을 실제 이미지에서 측정한다. 산타모자의 전용 기준점을 그대로 복사하지 않는다. 새 모션 시트를 생성하지 않고 기존 몸체와 분리된 부착 레이어를 사용한다.

| 아이템 | 원본 경로 |
|---|---|
| Black Top Hat | Resources/Black_Top_Hat.png |
| Red Bow Tie | Resources/Red_Bow_Tie.png |

## Black Top Hat 최종 프롬프트

Use case: stylized-concept. Create ONE isolated black top hat equipment sprite for PawHaven, a cozy 2D pixel-art pet game. Both input images are STYLE REFERENCES ONLY: match the existing Santa hat's small stepped pixel clusters and the black-and-white dog sofa's restrained charcoal shades. Do not reproduce either reference object. Subject: a compact classic black silk top hat, modest medium-height straight crown, short broad horizontal brim, one thin muted-red band around the base of the crown. Near-front view, only a very slight view of the top ellipse; suitable as an overlay on a small dog facing RIGHT. Flat 2D sprite construction, simple readable silhouette, charcoal-black body with only 2–3 soft gray shade levels and restrained red band, no harsh shine. The brim bottom should be almost horizontal; compact enough to leave ears visible. Fine deliberate pixel edges and clustered shading, comparable pixel density to reference assets; neither smooth vector art nor giant coarse mosaic pixels. ONE complete item centered occupying around 60% of the canvas with clear transparent margins. Truly transparent background. NO dog, face, head, mannequin, shirt, bowtie, text, watermark, frame, scene, ground, cast shadow, halo or glow. NO photorealism, 3D render, glossy material reflections, fabric texture, decorative buckle or extra objects.

## Red Bow Tie 최종 프롬프트

Use case: stylized-concept. Create ONE isolated red bow tie equipment sprite for PawHaven, a cozy 2D pixel-art pet game. Both input images are STYLE REFERENCES ONLY: match the existing Santa hat's fine stepped pixel clusters and warm red palette, and the black-and-white pet sofa's modest 2–3 shade levels. Do not reproduce either reference object. Subject: a small classic red bow tie for a puppy's neck, two short rounded triangular cloth wings, one small squared central knot, clean balanced nearly symmetrical silhouette. Straight-on front view, almost horizontal, compact proportions; standalone bow tie ONLY, no collar strap, shirt collar, body, neck, suit or hat. Flat 2D inventory/attachment sprite with simple pixel clusters, warm cherry-red main color, muted dark red folds and a tiny soft lighter-red highlight, only 2–3 restrained shade levels. Fine readable slightly stepped edges like the approved game assets, no big coarse mosaic grid, no smooth vector outline, no painterly brush or blur. Entire single bow tie centered occupying about 60% of canvas width with generous transparent padding. Truly transparent background. NO text, badge, paw symbol, watermark, UI frame, glow, halo, floor, ground shadow, extra ribbons or dangling tails. NO realistic silk sheen, glossy 3D rendering or complex fabric texture.

- 2026-10-24 위치 수정 검증: 전체 232개 테스트·타입 검사·빌드 통과. 목 좌표가 머리 변화에 영향을 받지 않는 회귀·잘못된 프레임 수 거부·원본/배포 JSON 일치를 확인했다. Home 1000×700/600×480에서 실제 hit test와 안내 영역 포함을 확인했다. DB 테스트 동시 실행으로 메모리 부족이 발생해 npm test를 동시 2개로 제한한 뒤 전부 통과했다.
