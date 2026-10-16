# 산타모자 착용 프로토타입

2026-10-16. 실제 착용 아이템 한 개로 장착 흐름을 검증한다. 개발 계획 4번 중 모자 최소 세트이며 Home 실제 아트/배치는 아직 진행하지 않았다.

- 리소스: public/assets/items/santa-hat.png. built-in image_gen 사용, Resources/Corgi_Art_Sheet.png는 그림체 참고로만 사용했다. 원본 이미지들은 변경하지 않았다.
- PNG 1536×1024, 투명 배경. 알파 >1 외곽 범위 x383~1156/y278~781로 여백을 확인했다. 생성 결과 전체 캔버스를 그대로 보존하며 배경 제거·다시 그리기·타이트한 이미지 자르기를 하지 않았다.
- Hat:1 기본 소유 아이템을 산타모자로 교체. Character와 Shop에 같은 PNG 아이콘 표시. Hat의 None/다른 더미 모자를 선택하면 실제 모자는 해제한다. 다른 더미 아이템 착용은 아직 구현하지 않았다.
- AnimationSet.head는 각 프레임의 발 원점 기준 머리 부착 위치와 폭을 지정한다. 코기 값은 public/assets/characters/corgi/head-anchors.json. 실제 아트별로 지정하고 새 동물에 그대로 복사하지 않는다.
- 모자는 몸체 Sprite 자식이므로 애니메이션 프레임, 좌우 방향, 점프 높이, 환영 들썩임, 몸체 크기 변화를 함께 따른다. Idle/Walk/Run/Jump/Fall/Land/Attack/Skill/Emote 위치를 연결했다. 기본 모자 PNG의 챙 중심은 (865,730), 챙 폭 기준 550이다.
- Game의 공용 OutfitState를 코기 wardrobe에 연결해 Character에서 고른 착용 상태가 로비·게임에 전달된다. 기존 공용 프리셋 3개의 저장/불러오기를 사용한다. 새로고침 후에는 저장된 프리셋을 불러오면 된다. 현재 선택을 프리셋에 자동 덮어쓰지 않는다.
- 씬 종료 시 자식 모자 Sprite만 정리하고 공용 텍스처는 Game 종료 시 정리한다. 대시 픽셀 VFX와 기존 몸체 잔상은 유지한다. 잔상은 기존처럼 몸체만 복제한다.
- 자동 테스트 46개·타입 검사·빌드 통과. 인벤토리 산타 PNG, 실제 Character 장착/해제, 모든 행동 프레임 부착·방향·점프·공유 상태·프리셋 복원·씬 텍스처 소유권을 확인했다.
- 실제 브라우저 도구가 시작하지 못해 최종 화면에서 프레임별 착용 위치/귀 가림/모바일 조작감은 아직 시각 검증하지 못했다. 필요 시 head-anchors.json만 조정한다.

## 최종 생성 프롬프트

Use case: stylized-concept. Project game equipment asset: ONE small Santa hat, isolated on a genuinely transparent background. Reference image is STYLE ONLY: match its cozy detailed pixel-art corgi sprites, warm soft pixel clusters and restrained shading. Generate ONLY the hat, NO dog, head, mannequin, text, ground, shadow, effects, panels, grid or other objects. Classic warm red floppy Santa cap with ivory fluffy brim and small ivory pompom. Three-quarter side view suitable for a corgi facing RIGHT; tip droops LEFT, brim almost horizontal. Compact squat proportions so ears can remain visible outside hat. Clean readable silhouette, deliberately visible square pixels, no blur, no vector outlines, no photoreal fur. Hat fully contained within central 65% of image, broad transparent margin, brim bottom centered, even neutral lighting. A single item for compositing on animated sprites and inventory icon. Save generated image as a PNG asset.
