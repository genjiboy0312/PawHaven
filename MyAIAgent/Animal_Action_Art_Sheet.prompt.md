# Animal Action Art Sheet — 동물 공통 제작 가이드

## 용도

Paw Haven에 추가할 다양한 동물의 행동별 아트 시트를 제작하는 공통 기준이다. 특정 동물이나 털 색에 한정하지 않는다.

## 공통 제작 규칙

- 캐릭터 디자인 참고 이미지와 행동 패널 구성 참고 이미지를 구분해 전달한다.
- 승인된 동물의 외형, 체형, 색상, 무늬를 모든 포즈에서 일관되게 유지한다.
- 동물별 귀, 꼬리, 발, 이동 방식과 고유 행동을 반영한다.
- Corgi_Art_Sheet.png를 기본 그림체 및 행동 패널 구성 참고로 사용한다.
- 행동명은 패널 왼쪽 위에 표시하고, 동작 순서는 왼쪽에서 오른쪽으로 배치한다.
- 기본 행동 분류 16종: Idle, Walk, Run, Jump, Fall, Land, Double Jump, Attack, Hit, Die, Skill, Emote, Direction, Climb, Push, Hurt Loop.
- 새로운 동물도 기본 행동 16종을 한 번에 준비한다. Idle/Walk만으로 전체 아트 제작을 완료 처리하지 않는다. 목표 프레임 수는 제작 요구에 맞게 선택한다. 아트 시트에 행동을 추가하는 것은 게임 기능 구현을 의미하지 않는다.
- 프레임별 크기, 지면 기준점, 간격을 통일하고 귀·발·꼬리가 잘리지 않게 한다.
- 생성 결과는 아트 참고 자료다. 실제 포즈 수, 프레임 정렬 및 애니메이션 연결을 별도로 검증한다.
- Markdown 문서는 MyAIAgent에, 이미지 에셋은 Resources에 저장한다.

## 재사용 프롬프트

```text
Create an action-by-action animal character art reference sheet for Paw Haven.
Character reference: [approved animal image].
Animal: [species / breed].
Identity: [body shape, face, ears, tail, colors and markings to preserve].
Style and action layout reference: Resources/Corgi_Art_Sheet.png.
Actions and target pose counts: [selected actions and pose counts].
Preserve the approved character identity throughout all poses.
Adapt movement and expressions to this animal's anatomy and behavior.
Use clearly labeled action panels and distinct left-to-right animation stages.
Keep character scale, lighting, markings, spacing and ground alignment consistent.
Show complete silhouettes without clipping ears, paws or tails.
Background: [dark presentation background / true transparent background].
No unrelated text or watermark.
```

## 제작 기록: 턱시도 고양이

- Image: ../Resources/Cat_Tuxedo_Action_Art_Sheet.png
- Generator: built-in image_gen
- References: ../Resources/Cat_Tuxedo_Art_Sheet.png (approved character), ../Resources/Corgi_Art_Sheet.png (action panel layout).
- 아래는 당시 사용한 원본 프롬프트다. 원문의 15개 패널 표기는 오류이며 실제 나열된 행동은 16종이다.

### 당시 사용한 프롬프트

Use case: stylized-concept.
Create an expanded action-by-action character animation reference sheet for Paw Haven.
Image 1 is the APPROVED CAT IDENTITY: preserve this exact adorable chubby black-and-white tuxedo kitten design, head shape, large amber eyes, pink nose, pink inner ears, white muzzle/chin continuous with white bib and belly, four white sock paws, black crown/back/flanks and long black tail. Preserve its softly shaded detailed pixel-art game illustration style. Do not redesign the character.
Image 2 is the ACTION ORGANIZATION AND LAYOUT reference: the Corgi_Art_Sheet. Reproduce its useful landscape sheet structure, dark charcoal backdrop, thin unobtrusive panel dividers, small crisp white pixel-font uppercase action labels in the top-left of each panel, and left-to-right sequences of distinct poses. Replace all corgis with the approved tuxedo CAT. Create one polished large landscape sheet with exactly these 15 distinct labeled action panels, using the same arrangement as image 2:
Row 1: IDLE (6) left, WALK (8) right.
Row 2: RUN (8) left, JUMP (8) right.
Row 3: FALL (4) left quarter, LAND (4) next quarter, DOUBLE JUMP (6) right half.
Row 4: ATTACK (6) left, HIT (4) middle, DIE (6) right.
Row 5: SKILL (6) left half, EMOTE (6) right half.
Row 6: DIRECTION (4), CLIMB (6), PUSH (4), HURT LOOP (4), in four consecutive panels.
Labels must be spelled exactly as above. Each panel must depict its own action, not generic repeated sitting poses: Idle breath/blink/ear twitch; Walk slow alternating footfall; Run extended bounding stride with contracted and stretched body; Jump crouch, launch, rise, apex, descend; Fall airborne paws spread; Land paws contact and body squashes then recovers; Double jump tuck and bounce mid-air; Attack harmless playful paw swipes with small white swish arcs; Hit surprised recoil with little stars; Die cartoon pretend faint ending lying peacefully (non-graphic, no injury); Skill playful quick dash with tiny dust puffs; Emote sitting happy, meowing, heart, grooming, curious head tilt, pleased expression; Direction full front/back/left/right views with clear tuxedo markings; Climb gripping a small neutral post with alternating white paws; Push leaning with both front paws on a small wooden crate; Hurt loop cute dizzy wobble with small stars.
Favor feline anatomy and behavior, retain long cat tail in all poses. Consistent scale, lighting, palette, face and marking placement throughout; distinct chronological animation stages; complete silhouettes, no clipped ears/tails/paws; sufficient separation between frames. Match the corgi reference's warm high-quality cozy miniature sprite look. Background dark charcoal for readability of white feet and labels, subtly lighter behind black fur. No unrelated titles, no watermark, no orange cat, no brown tabby. This is an expanded art reference sheet, not a UI screenshot.
