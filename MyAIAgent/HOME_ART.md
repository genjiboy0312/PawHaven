# Home 픽셀 리소스 제작 기록

2026-10-16. built-in image_gen 사용. Resources/Corgi_Art_Sheet.png는 그림체 참고로 사용했다. 원본 참고 이미지와 생성 PNG는 재편집하지 않았다.

| 용도 | 배포 경로 | 규격 |
|---|---|---|
| 배경 | public/assets/home/garden-background.png | 2172×724, 불투명 |
| 바닥 | public/assets/home/garden-floor.png | 1536×1024, 불투명 |
| 쿠션 | public/assets/home/cushion.png | 1536×1024, 투명 |

Background 0 / Floor 0 / Furniture 4에 각각 연결했다. 배경과 바닥은 별도 이미지여서 독립 교체한다. 쿠션은 원본 전체 캔버스와 (0.5,0.75) 기준점을 사용하고 표시 너비 195로 설정했다. 인벤토리도 같은 PNG를 사용한다. Etc와 나머지 가구는 기존 도형 프로토타입을 유지한다.

## 최종 프롬프트: 배경

Use case: stylized-concept. A game BACKGROUND layer only for a cozy 2D pixel-art corgi pet garden. Very wide panoramic composition: soft pale blue sky, warm morning light, distant softly clustered rounded sage green trees and bushes only along the bottom edge. Gentle detailed square pixel clusters matching the reference corgi style. Calm muted palette, ample open sky. NO floor, NO foreground lawn, NO oval ground patches, NO circular platform, NO furniture, NO animals, NO text, NO UI, no frame or vignette. This separate backdrop will sit ABOVE an independently selectable grass floor. Flat straight bottom edge with distant greenery, no perspective floor. Opaque full canvas, landscape.

## 최종 프롬프트: 바닥

Use case: stylized-concept. A standalone rectangular GRASS FLOOR texture for a cozy 2D pixel-art animal garden. Landscape canvas fully covered edge to edge with soft muted sage green lawn, sparse tiny irregular pixel tufts and a few subdued light grass clusters, very low contrast. Near top-down / shallow side-view ground plane; uniform texture at every edge, no horizon, no sky, no trees, no animals, no objects, no pathways, no text, no UI, no oval patches, no circular platform, no vignette, no border. Match the warm detailed pixel clusters and quiet palette of the reference. It is an independently selectable floor beneath a backdrop. Opaque full canvas.

## 최종 프롬프트: 쿠션

Use case: stylized-concept. ONE standalone cozy pet cushion equipment sprite, on truly transparent background, matching the detailed warm pixel-art style of the reference corgi. A small low padded rectangular dog bed with rounded corners, soft muted sage green outer fabric and warm ivory recessed pillow, subtle peach piping. Shallow three-quarter front view, almost side view so it can sit on a 2D lawn. Entire object in central 65% of canvas with wide empty transparent margins. Clear clustered square pixels, gentle material shading, no blur. NO dog, NO other furniture, NO ground, NO oval floor patch, NO cast shadow, NO glow, NO text, NO UI, NO panel, NO outline frame. Only one cushion, full silhouette.
