# 정장 아이템 리소스 (2026-10-24)

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
