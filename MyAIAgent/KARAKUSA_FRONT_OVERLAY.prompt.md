# Karakusa neck scarf — front overlay

2026-10-30. Mode: built-in image_gen / precise-object-edit / transparent background.

사용자가 빨간색으로 표시한 위쪽 뒷면 띠와 안쪽 면을 제거했다. 목 뒤에 가려져야 하는 천을 앞 레이어에 그리지 않는다. 문양이 있는 앞쪽 목 두름 천과 오른쪽 매듭·짧은 끝은 유지한다. 가슴 위에 얹는 장식으로 취급하지 않는다.

리소스: `Resources/Karakusa_Bandana_Front_Overlay.png`

이 파일은 생성 원본 PNG를 그대로 복사했다. 기존 `Karakusa_Bandana_Fitted_Prototype.png`는 보존한다. 게임 장착 연결·기존 부착선 재사용은 하지 않았다. 윤곽이 바뀌었으므로 새 목 부착선과 실제 착용 확인이 필요하며, 이전 자동 맞춤 비교 이미지는 합격 사례가 아니다.

## Final prompt

Use case: precise-object-edit.
Image 1 is the clean existing PawHaven karakusa scarf sprite to edit. Image 2 is the user's annotated screenshot: the red outline identifies the unwanted UPPER BACK-FACING GREEN WRAP / INSIDE RIM. It is an annotation reference only.
Remove that entire upper rear strip and its dark inner-facing surface from image 1, leaving genuine transparent alpha in its place. This is the broad plain-green arch running from the upper-left raised edge across the top to the upper-right raised lip, ABOVE the cream-patterned front cloth. Do not replace it with another rear band, rolled rim, loop, ring, ellipse, or visible inside surface. The rear part goes BEHIND the pet's neck and must not be drawn on this front overlay sprite.
Keep ONLY the visible FRONT cloth of the neck scarf, with its existing cream karakusa vines, and the existing compact middle-right/front knot with two short tips. After removal, give the remaining front cloth a clean softly stepped top contour that follows the lower boundary of the removed rear strip. It must read as a neck-tied scarf front overlay for a pet facing screen right, not a bib or chest plate.
Preserve the remaining front cloth's muted green palette, cream vine pattern, simple restrained pixel shading and pixel density. Preserve the existing knot location and shape, loose ends, lower silhouette, canvas size, object scale and registration as closely as possible. Do not shift, enlarge or redesign the accessory. No dog, mannequin, background, UI, red marks, text, floor, cast shadow, green glow or halo. Output a SINGLE standalone accessory with clean genuinely transparent background.

## 컴포넌트 검증 연결

앞면 원본은 그대로 두고 독립 폭·두께 변환을 적용한 개발용 착용 확인 화면에 연결했다. 기준과 현재 검증 범위는 [ATTACHMENT_FITTING.md](ATTACHMENT_FITTING.md)를 따른다.
