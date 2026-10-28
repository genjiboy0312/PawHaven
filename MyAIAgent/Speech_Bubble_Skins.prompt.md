# 말풍선 스킨 시안

## v7 중앙 꼬리 수정 (2026-10-28, 최신)
- 사용자 요청: 작은 구름을 삭제하지 않고 큰 구름 아래 중앙으로 이동. 내장 image_gen 편집으로 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v7.png`를 생성했고 런타임 `public/assets/items/speech-cloud-sky.png`에 동일 파일을 사용한다. v6 원본은 보존한다.
- 두 작은 구름과 큰 구름의 중심축을 맞추고, SpeechSkins의 body/frame 좌표를 공유한다. 게임에서는 꼬리 길이를 반영해 기본 말풍선과 같은 머리 위 간격을 유지한다. 상점/캐릭터 미리보기는 0.55배·y=-200으로 두어 작은 구름이 머리에 겹치지 않게 한다. 관련 16개 테스트·빌드·실제 Chrome 비교 및 640×360 검증 통과.
- 서버 SQL 027 사용자 적용 완료. 가격/구매/장착/저장 구조 변경과 추가 SQL은 없다.
- 편집 프롬프트: Use case: precise-object-edit. Edit target: the supplied PawHaven sky-blue pixel-art thought bubble. Move the two small detached white/blue thought-cloud dots from the lower LEFT to directly underneath the horizontal CENTRE of the large cloud body, vertically stacked. The larger dot sits just below the body's bottom centre, followed by the smaller dot beneath it. The smallest bottom dot aligns with the main cloud's central vertical axis, pointing down to the character's head. Remove their old lower-left positions completely (transparent there). Preserve the naturally irregular cloud body, pure white centre, sky-blue edge, fine flat 2D pixel-art style and palette. No text, shadows, decorations, extra clouds, triangular tail or background. Preserve true alpha; fit the complete cloud and both centred dots without clipping.

- 2026-10-28: 사용자가 구름 모양의 하늘색·분홍색을 제안했고 하늘색 시안부터 제작하도록 요청했다.
- 2026-10-28: 하늘색 v6 사용자 승인. 상점 Style → Etc에서 150코인 구매·미리보기, Character → Etc 장착, 로비 대화·공원 채팅에 적용한다. 기본 말풍선은 무료이며 Etc의 없음 선택으로 복원한다. 분홍색은 아직 제작/판매하지 않는다.
- 생성: 내장 image_gen 도구. 신규 이미지, 투명 배경. 원본 PNG는 재가공하지 않고 Resources에 복사한다.
- 리소스: `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype.png`.
- 스타일 기준: UI_STYLE.md의 블랙·화이트 펫 소파 기준 픽셀 밀도, 평면 2D, 얇은 자연스러운 윤곽, 절제된 색 단계. 구름 굴곡은 크고 완만하게, 중앙 글자 공간은 넉넉하게 유지한다. 글씨는 게임의 Jua로 런타임에 넣기 위해 이미지에는 넣지 않는다.

## 하늘색 v6 사용자 참고 이미지 반영 (최신 기준)

- 사용자가 제공한 흑백 생각 말풍선 참고 이미지처럼 좌우 대칭이 강하지 않고 자연스러운 구름 윤곽을 원한다고 명확히 설명했다. 기존 사각형 골격/같은 모서리/규칙적인 봉우리 유지 지시보다 이 참고 형태를 우선한다.
- 사용자가 첨부한 흑백 생각 말풍선을 형태 참고로 사용했다. 참고 원본을 공개 저장소에 추가하지 않는다. 승인 결과는 흰색 중앙·하늘색 테두리·픽셀 스타일로 제작한 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v6.png`다. 왼쪽 아래 작은 방울 꼬리를 사용한다. 내장 image_gen 편집 사용. 런타임 파일은 원본과 동일한 `public/assets/items/speech-cloud-sky.png`이며 이미지 재생성/가공 없이 Pixi frame으로 여백만 제외한다.

## 구현 규칙
- `SpeechSkins.ts`의 Etc:2 메타데이터를 아이콘/이름/가격/장착 판정에 공유한다. 의상 부착물 배열에 넣지 않는다.
- `SpeechBubble.setSkin`이 같은 콘텐츠·타이밍·리액션·화면 경계 처리를 재사용한다. 흰 중앙 안으로 220px 줄바꿈과 여백을 적용하고, 기본 꼬리 대신 이미지의 방울 꼬리를 쓴다. 상점/캐릭터 미리보기만 0.65배로 제한한다.
- 기존 OutfitState.Etc/프리셋/계정 저장/공원 look을 재사용한다. 공원 상대방도 같은 장착값과 공유 텍스처로 렌더링한다. 구매와 장착은 별도이며 미리보기는 저장·차감하지 않는다.
- SQL: `202610280027_speech_bubble_skins.sql`, 쿼리 이름 **Sky Cloud Speech Bubble Shop**. 026 이후 적용. 기존 economy_items와 economy_command의 잠금·멱등 요청을 유지하고 Etc:2 가격만 서버에서 150으로 결정한다. `speechSkinsReady`가 없는 이전 서버에서는 구매를 차단한다.
- 검증: 전체 325개 테스트·빌드 통과, DB 가격/중복 요청/재실행/계정 분리 및 공원 외형 전달 검증. 실제 Chrome 구매 1000→850/장착 Etc:2/Character/640×360 모바일/기본 및 구름 대사 비교 확인.

```text
Edit Image 1, the PawHaven sky-blue speech-bubble draft, using Image 2 as the controlling SHAPE reference.
The user says Image 2 has the natural, not-obviously-bilaterally-symmetric cloud feel they actually wanted. This new shape reference supersedes previous requests to preserve rectangular sides, a rigid frame, a centered pointed tail, or matching corner shapes.
Image roles:
- Image 1: edit target; retain only its WHITE center, SKY-BLUE outline color concept, and fine 2D pixel-art game-asset craft.
- Image 2: essential silhouette/composition reference, the small black-outline thought cloud. Closely follow its compact naturally puffy cloud body and its small two-dot thought tail at lower left, but do NOT reproduce the black outline or white page background.
Redraw the body as a simple, charming organic cloud dialogue balloon with unevenly sized and unevenly spaced rounded lobes around the whole perimeter, just like Image 2. Subtle asymmetry: left/right lobes do not mirror each other, upper lobes differ gently in size, lower edge is naturally uneven. No obvious rounded rectangular skeleton, no tall straight sides, no long straight top/bottom rails, no repeated scalloped border/crown, no sharp V-shaped valleys or stylized animal ears. Do not exaggerate the irregularity; the reference is calm, compact and friendly.
Use a spacious pure WHITE interior for later runtime dialogue text. Clean thin pastel SKY-BLUE outline (#93c8e1 family); extremely restrained 1–2 blue edge tones. No blue fill/gradient in the text area, no dark outer rim, no neon cyan fringe, no 3D gloss or heavy shadow. Fine natural pixel-art contour density matching a modest 2D pet game, not huge blocky mosaic pixels and not sterile smooth vector art. Preserve soft genuinely rounded lobes.
Keep the compact overall proportions of Image 2 with a modestly wider central text space if needed; definitely not a panoramic banner. Exactly one blank cloud and its small lower-left thought dots. Full silhouette visible with modest transparent margins. Genuine transparent alpha outside all components. No text, animal, icons, stars, scenery, sample UI, watermark, black linework or opaque/checkerboard background.
```

## 하늘색 v5 상·하단 수정 (이력)

- 사용자는 좌우측은 예쁘지만 상단 자체가 어색하다고 했고 하단도 함께 수정하도록 요청했다. 좌우는 유지하고, 상단의 같은 크기 봉우리 반복과 하단의 긴 직선을 크기·높이가 다른 완만한 구름 곡선으로 다듬었다. 흰색 중앙/하늘색 테두리/현재 비율/중앙 꼬리를 유지했다. 내장 image_gen 편집을 사용했으며 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v5.png`에 별도 저장한다. 실제 게임 적용은 아직 하지 않았다.

```text
Edit the referenced PawHaven speech balloon prototype. User feedback: the LEFT and RIGHT sides are attractive and must be preserved, but the TOP looks ugly; now the user also requests the BOTTOM to be redesigned together.
Redesign ONLY the top and bottom perimeter rhythm into a naturally fluffy cloud trim. The current top is a repetitive five-peak crown / zigzag and the bottom has long straight stretches. Replace these with a small number of broad, softly bulging cloud curves of subtly varied widths and heights, smoothly merging with SHALLOW ROUNDED recesses. No sharp V valleys, no pointy mountain peaks, no repeated identical semicircles, no crown, no frilly stamp edge, no long straight horizontal rail. Avoid mirrored top/bottom patterns. Think soft organic cloud puffs attached around an otherwise broad rectangular dialogue area, with calm low-amplitude curves, not a wild irregular cloud silhouette.
CRITICAL PRESERVE: both approved side contours, the compact balanced body proportions of the reference, large uninterrupted PURE WHITE central text area, thin SKY-BLUE-only edging, fine natural pixel-art density and restrained flat 2D game-UI palette. Maintain approximately the current overall width/height; do not return to an extra-wide banner. Keep the small bottom-center downward speech tail, integrating it naturally into the redesigned lower cloud edge.
Do not add internal decorative lines, blue wash, shading across the white center, text, symbols, animals, stars, logos or a UI scene. One centered complete blank speech bubble, full perimeter and tail visible, genuine transparent alpha outside, modest transparent margin. Small fine pixel steps along truly rounded contours; no chunky mosaic and no glossy 3D appearance.
```

## 하늘색 v4 상단 굴곡 수정 (이력)

- 상단 중앙의 긴 직선을 둥글게 이어지는 구름 굴곡으로 교체했다. v3 비율·흰색 중앙·하늘색 테두리·기존 측면/하단/꼬리는 유지한다. 내장 image_gen 편집을 사용했고 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v4.png`에 별도 저장한다. 게임 연동은 아직 진행하지 않았다.

```text
Make one targeted edit to this PawHaven speech-bubble prototype. The user specifically points to the long straight horizontal TOP border between the two corner puffs and wants that section to feel soft, rounded and cloudy too.
Replace that ENTIRE straight top segment with a continuous row of 5–6 broad, softly rounded cloud scallops/lobes. Each lobe should arch upward then dip gently into the next. No long horizontal straight segment must remain along the top. Integrate the corner puffs smoothly into this scalloped top, without making two isolated cat-ear shapes. Keep the lobes similar modest heights, not one enormous central dome. Shape the outline itself, not a decoration drawn inside the bubble.
Preserve everything else as closely as possible: the current compact balanced width/height, broadly rectangular white central text area, pure WHITE fill, delicate SKY-BLUE-only perimeter, small side/bottom cloud puffs, short downward centered tail, fine natural pixel-art craftsmanship, restrained flat 2D shading, and genuine transparent alpha background. Keep all top lobes outside the generous central text-safe area. No letters, icons, animals, sparkles, scene, checkerboard or extra variants. Full asset visible with modest transparent margins.
```

## 하늘색 v3 비율 수정 (이력)

- v2가 가로로 너무 길다는 피드백에 따라 가로를 줄이고 세로 여유를 늘렸다. 흰색 중앙/하늘색 테두리/사각형에 붙인 작은 뭉게 형태를 유지한다. 원본을 덮어쓰지 않고 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v3.png`에 저장한다. 내장 image_gen 편집을 사용했고 실제 게임 적용은 하지 않았다.

```text
Edit this PawHaven speech-bubble skin. The user likes the white rectangular center and sky-blue cloud-puff edging, but says it is much too horizontally stretched.
Make the BODY approximately 1.8:1 width to height (for example a 540-wide by 300-high body, excluding a short tail), a compact rounded rectangular dialogue bubble with comfortable vertical room for three short dialogue lines. Visibly shorten the long horizontal span and increase the body height. Do not retain the panoramic banner proportions of the reference. Use a more balanced composition/canvas so the asset reads as a compact dialogue balloon.
Preserve the current visual identity: solid WHITE central fill, delicate SKY-BLUE outline only, a few small soft cloud puffs attached to the outside of the rounded rectangle, a short integrated downward speech tail at bottom center. The underlying rounded rectangle must remain recognizable. Spacious uninterrupted white text-safe center; no blue tint across that center.
Preserve the fine natural pixel-art craft of the reference: small restrained stepped edges and very limited color shading, flat friendly 2D pet-game UI, not coarse enlarged pixels, not glossy or 3D. Keep border and tail thickness proportionate, not horizontally squashed.
Exactly one centered blank bubble. Genuine transparent alpha background outside it, modest margin, full shape visible. No text, letters, icons, animal, stars, sparkles, sample UI, scenery, watermark or extra variants.
```

## 하늘색 v2 수정 (이력)

- 기본 둥근 사각 말풍선의 넓은 중앙 영역을 유지하고 바깥에 작은 뭉게 구름 모양을 붙이는 방향이다. 가운데는 흰색, 테두리만 하늘색이다. 기존 전체 파란 구름 시안을 덮어쓰지 않고 `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype_v2.png`에 저장한다.
- 내장 image_gen 편집 사용. v1 PNG를 참조했고 투명 배경을 유지했다. 아직 시안이며 게임 연동은 하지 않는다.

```text
Edit the referenced PawHaven sky-blue cloud speech-bubble prototype to follow this exact user correction. Output exactly one empty 2D game speech-bubble asset on genuine transparent alpha.
SHAPE CHANGE: the underlying shape must clearly remain a horizontal rounded RECTANGULAR speech bubble with a broad flat rectangular white text area. Like the game's original rounded rectangle with small soft cloud puffs attached around its outside edges. Keep long mostly straight top/bottom segments and recognizable four rounded corners; add restrained small rounded cloud lobes at the corners and a few along the outer perimeter. Do NOT make the whole body a large irregular cloud mound. No enormous central top dome, no deep scallops cutting into the text area. Width around 2.7 times the body height, generous blank center for several dialogue lines.
COLOR CHANGE: pure solid WHITE central fill (#ffffff), including the full text-safe interior. SKY BLUE only on the outline/perimeter trim (#9dcfe9 family), modest thin border with fine pixel-crafted contours. No blue wash or blue gradient across the center. No dark gray outer frame. Flat 2D, very restrained 2-tone blue trim, no gloss or 3D inflation. Retain the reference's fine natural pixel-art density rather than coarse chunky enlarged pixels or smooth vector clipart.
Keep a small integrated downward pointing speech tail at bottom center, white inside and sky-blue edge. One asset centered, complete perimeter/tail visible with transparent margin. Absolutely no text, letters, icons, animals, sparkles, scenery, extra variants, or opaque/checkerboard background. Preserve transparency.
```

## 하늘색 v1 생성 프롬프트 (이력)

```text
Use case: ui-mockup / game UI asset prototype.
Create exactly ONE standalone sky-blue cloud-shaped speech bubble skin for PawHaven, a cozy 2D pixel-art pet game. This is the empty UI asset only, NOT a whole interface and NOT a landscape.
Silhouette: a generously wide horizontal cloud, roughly 2.7:1 body aspect ratio. A few large, gentle rounded cloud lobes along the top, sides, and bottom. Broad continuous empty center with room for a nickname and two or three lines of dialogue. A short integrated downward pointed speech tail at bottom center; no floating thought-bubble dots. The shape must look like a cloud-shaped speech balloon rather than a rounded rectangular panel.
Palette: very pale powder sky-blue body (#dff1fa family), slightly richer light-blue edging, thin muted blue-gray outline (#7e9fae family). Mostly flat interior; extremely restrained 2–3 tone edge shading. Clear readable light center. No pink version.
Style: fine, natural pixel-art edges with controlled small pixel clusters, matching modest 2D pet sprite / black-and-white pet-sofa game assets. Soft friendly cloud contour but visibly finely pixel-crafted, NOT smooth vector clipart, NOT chunky enlarged mosaic pixels. No realism, no 3D puffy inflated rendering, no plastic/gloss, no dramatic lighting, no thick black border, no heavy drop shadow. Very subtle depth only at the lower edge.
Composition: single centered bubble, full silhouette and tail entirely visible, modest transparent margin all around, wide composition. Genuine transparent alpha background. No checkerboard painted into the image.
No text, no letters, no icon, no animal, no paw symbol, no sparkles, no stars, no scenery, no logo, no price tag, no extra variants. Preserve the blank central text-safe area.
```
