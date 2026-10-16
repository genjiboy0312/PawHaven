# 명랑이 애니메이션과 게임 연결

2026-10-16 제작 시작, 2026-10-17 최종 검증. 사용자가 승인한 Idle 외형을 유지하고 현재 코기와 동일한 플레이 동작을 연결했다.

## 구성

- 승인된 Resources/Myeongrang_Idle_Prototype.png는 그대로 유지한다. 배포용 idle.png는 원본 복사다.
- Resources/Myeongrang_Walk_Emote.png: Walk 4프레임, Emote 4프레임.
- Resources/Myeongrang_Action_Art_Sheet.png: Run / Attack / Skill / Jump 각각 4프레임. 초기 결과의 간격이 부족해 몸체 크기를 줄이고 투명 여백을 확보한 결과를 채택했다.
- 배포 경로: public/assets/characters/myeongrang/idle.png, daily.png, combat.png, frames.json.
- Idle 8, Walk 4, Run 4, Attack 4, Skill 4, Jump 3공중+1착지, Fall 1, Land 1, Emote 4. Fall/Land는 Jump 텍스처를 재사용한다.
- 몸체만 생성했고 공격 궤적·대시 먼지·픽셀 파편은 corgi.effects를 참조 공유한다. 잔상은 기존 AnimalEffects가 현재 명랑이 몸체 텍스처를 복제한다. 별도 효과 이미지·잔상 이미지는 생성하지 않았다.
- 기존 속도·점프 궤적·공중 공격·지상 대시·코스 충돌·재시작 규칙을 사용한다. 로비에서도 기존 자율 생활·환영·쓰다듬기를 사용한다.

## 프레임과 기준점

원본 시트를 재편집하거나 타이트하게 잘라낸 PNG로 바꾸지 않았다. frames.json의 Texture.frame은 실제 동작 사이의 투명 구간까지 포함한다. Daily는 실제 그림 사이 여백을 기준으로 열 폭을 다르게 나눴고, 액션 시트는 충분한 행 여백 안에서 경계를 정했다. 시트가 정확한 동일 셀 크기라고 가정하지 않는다.

alpha>128은 중심/발 기준점 측정용이며 런타임 투명도를 삭제하지 않는다. 각 셀 경계 최대 알파를 확인해 8/255 이하만 채택했다. 논리 orig=1024×1024, trim=(512-center,870-baseline,width,height), anchorY=870/1024. Idle/Daily는 실제 몸체 높이를 기준으로 크기를 맞추고 Combat는 Run 기준 공통 크기를 유지해 대시의 낮은 자세를 보존한다.

프레임별 머리 부착점으로 기존 산타모자를 사용할 수 있다. 현재는 초기 위치값이므로 실제 화면에서 미세 조정이 필요할 수 있다.

## 게임 연결과 검증

- Character → Pets: Corgi / Myeongrang(명랑이), 한영 이름 지원. 선택한 캐릭터를 로비·게임·샵 미리보기에 공유한다.
- 공용 프리셋 3개는 petId=myeongrang과 현재 의상 선택을 저장/복원한다. 코기로 다시 전환할 수 있다. 새로고침 후 선택은 기존처럼 코기로 시작하며 저장된 프리셋으로 명랑이를 불러올 수 있다.
- createMyeongrang.ts는 렌더러 없이 검사할 수 있는 설정/텍스처 조립 함수, loadMyeongrang.ts는 배포 에셋 로더다.
- Game 종료 시 두 동물의 텍스처를 Set으로 합쳐 공유 VFX·모자를 중복 파괴하지 않는다. 씬 전환은 공용 텍스처를 유지한다.
- 자동 테스트 50개, 타입 검사·빌드 통과. PNG 크기/RGBA·전체 프레임/trim/orig·모든 행동/방향/모자, 효과 참조 공유, Pets 선택→로비 Walk→게임 Jump/Attack/Skill/명랑이 잔상→프리셋 복원→코기 전환을 검증했다.
- 모델/가짜 DOM 테스트이며 실제 브라우저에서의 최종 시각/터치 검증은 별도 필요하다.

## 제작 도구

built-in image_gen. 입력은 승인된 명랑이 Idle 및 첫 액션 시트(여백 보완용)다. 새 개인 사진 업로드나 사진 원본 Git 추가는 하지 않았다.

## 최종 생성 프롬프트 1

Use case: stylized-concept. Game runtime sprite atlas for the EXACT approved dog MYEONGRANG in the supplied Idle reference. Preserve that specific face, brown central forehead wedge, white eye/muzzle mask and freckled muzzle, glossy dark eyes, large upright ears, chestnut coat, white chest/paws, feathered upward-curled brown tail, slender legs. Same warm detailed pixel clusters and soft shading; no generic corgi, no new dog design. Every dog faces RIGHT in three-quarter side view, same scale and identity. Full bodies only, true transparent alpha, NO floor, shadows, glow, dust, swipe arcs, speed lines, text, grid, labels, panels or accessories. Keep complete ears, paws and tail inside the central 60% of each cell, wide empty transparent gutters, nothing touching cell edges. Grounded poses have same foot baseline at 82% of cell. Runtime applies jump displacement; do not bake a rising trajectory across cells. EXACT FOUR COLUMNS x TWO ROWS =8 frames, wide 2:1 landscape sheet. Row1 WALK: four distinct chronological slow walking gait poses, alternating forelegs and hindlegs, paws contact consistent baseline. Row2 EMOTE: four chronological seated happy greeting poses (soft smile, open cheerful mouth, closed eyes happy, return to soft smile). Expression changes and tiny chest/ear movement only; keep seated silhouette size and feet position stable. No hearts, symbols or effects. This extends the approved Idle; do not redraw the Idle sequence.

## 최종 생성 프롬프트 2

Use case: stylized-concept. Game runtime sprite atlas for the EXACT approved dog MYEONGRANG in the supplied Idle reference. Preserve that specific face, brown central forehead wedge, white eye/muzzle mask and freckled muzzle, glossy dark eyes, large upright ears, chestnut coat, white chest/paws, feathered upward-curled brown tail, slender legs. Same warm detailed pixel clusters and soft shading; no generic corgi, no new dog design. Every dog faces RIGHT in three-quarter side view, same scale and identity. Full bodies only, true transparent alpha, NO floor, shadows, glow, dust, swipe arcs, speed lines, text, grid, labels, panels or accessories. Keep complete ears, paws and tail inside the central 60% of each cell, wide empty transparent gutters, nothing touching cell edges. Grounded poses have same foot baseline at 82% of cell. Runtime applies jump displacement; do not bake a rising trajectory across cells. EXACT FOUR COLUMNS x FOUR ROWS =16 frames, wide landscape. Row1 RUN: four distinct chronological running gait poses (extended airborne, gathered forelegs landing, opposite stride extended, gathered hindlegs pushing off), actual leg movement. Row2 ATTACK: playful front paw swipe, four chronological poses (brace, paw raised, paw extended forward, recovery). Row3 DASH / SKILL: four chronological low forward burst body poses (lean, push off, streamlined extended body, recovery). Row4 JUMP / LAND: four poses (rising paws tucked, apex tucked, descending forepaws reaching down, low landing with legs flexed). Separate complete silhouettes; maintain identity. VFX are reused separately in the engine so render no effects whatsoever.

## 최종 생성 프롬프트 3

EDIT THIS EXISTING MYEONGRANG ACTION ATLAS. Preserve the same dog's face, chestnut/white markings, pixel style and the same sixteen poses in the SAME row order. CRITICAL LAYOUT REPAIR: shrink EACH dog to HALF ITS CURRENT SIZE within its own cell. Add extremely generous truly transparent margins. EXACT FOUR COLUMNS x FOUR ROWS uniform equal cells. Each dog occupies AT MOST 45% of cell width AND AT MOST 50% of cell height. Put each little dog in centre of cell at consistent baseline around 70% of cell height. Enormous clear gutters between all sixteen complete silhouettes, especially row3 first dog and row4 first dog; these must NEVER touch. No silhouette crosses a cell border, all ears, paws, tails completely visible. Row1 four run gait poses; row2 brace, raised paw, extended paw-swipe, recover; row3 lean/push/extend/recover dash; row4 rising/apex/descending/landing jump. Bodies ONLY, NO glows, NO ground, NO shadow, NO VFX, NO labels, NO lines, NO panels. Actual transparent alpha everywhere outside bodies. This is a spacing repair, keep dog identity and animation intent unchanged. Landscape canvas.
