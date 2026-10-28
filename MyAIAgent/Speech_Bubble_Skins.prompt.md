# 말풍선 스킨 시안

- 2026-10-28: 사용자가 구름 모양의 하늘색·분홍색을 제안했고 하늘색 시안부터 제작하도록 요청했다.
- 현재는 하늘색 1종 시안이며 승인/장착/상점 판매/로비·공원 연동은 아직 진행하지 않았다. 기본 말풍선 구현은 유지한다.
- 생성: 내장 image_gen 도구. 신규 이미지, 투명 배경. 원본 PNG는 재가공하지 않고 Resources에 복사한다.
- 리소스: `Resources/Cloud_Speech_Bubble_Sky_Blue_Prototype.png`.
- 스타일 기준: UI_STYLE.md의 블랙·화이트 펫 소파 기준 픽셀 밀도, 평면 2D, 얇은 자연스러운 윤곽, 절제된 색 단계. 구름 굴곡은 크고 완만하게, 중앙 글자 공간은 넉넉하게 유지한다. 글씨는 게임의 Jua로 런타임에 넣기 위해 이미지에는 넣지 않는다.

## 하늘색 최종 생성 프롬프트

```text
Use case: ui-mockup / game UI asset prototype.
Create exactly ONE standalone sky-blue cloud-shaped speech bubble skin for PawHaven, a cozy 2D pixel-art pet game. This is the empty UI asset only, NOT a whole interface and NOT a landscape.
Silhouette: a generously wide horizontal cloud, roughly 2.7:1 body aspect ratio. A few large, gentle rounded cloud lobes along the top, sides, and bottom. Broad continuous empty center with room for a nickname and two or three lines of dialogue. A short integrated downward pointed speech tail at bottom center; no floating thought-bubble dots. The shape must look like a cloud-shaped speech balloon rather than a rounded rectangular panel.
Palette: very pale powder sky-blue body (#dff1fa family), slightly richer light-blue edging, thin muted blue-gray outline (#7e9fae family). Mostly flat interior; extremely restrained 2–3 tone edge shading. Clear readable light center. No pink version.
Style: fine, natural pixel-art edges with controlled small pixel clusters, matching modest 2D pet sprite / black-and-white pet-sofa game assets. Soft friendly cloud contour but visibly finely pixel-crafted, NOT smooth vector clipart, NOT chunky enlarged mosaic pixels. No realism, no 3D puffy inflated rendering, no plastic/gloss, no dramatic lighting, no thick black border, no heavy drop shadow. Very subtle depth only at the lower edge.
Composition: single centered bubble, full silhouette and tail entirely visible, modest transparent margin all around, wide composition. Genuine transparent alpha background. No checkerboard painted into the image.
No text, no letters, no icon, no animal, no paw symbol, no sparkles, no stars, no scenery, no logo, no price tag, no extra variants. Preserve the blank central text-safe area.
```
