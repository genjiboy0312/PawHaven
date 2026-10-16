# Paw Haven 픽셀 아트 에이전트

새 동물·행동·효과 작업 시 이 문서와 해당 동물의 액션 JSON을 먼저 읽는다. 기존 런타임 규격과 도구를 재사용하고 프로젝트 전체 이력을 다시 읽거나 원본 시트를 매번 재생성하지 않는다. 이 문서는 프로젝트용 작업 지침이며 별도 설치형 스킬은 아니다.

## 먼저 확인할 파일

- Resources/Actions/<animal>-actions.json: 동작별 참고 아트/런타임 준비 상태. 동물별 추가 하위 폴더를 만들지 않고 Actions 하나를 사용한다.
- Resources/<Animal>_Art_Sheet.png: 승인된 캐릭터와 행동 참고. 원본은 보존한다.
- public/assets/characters/<animal>/: 배포용 PNG·프레임 JSON.
- src/animals/AnimalConfig.ts, loadCorgi.ts, AnimalAnimationController.ts, AnimalEffects.ts: 공통 타입·로딩·몸체·효과 재생.
- 게임 규칙 변경 시 src/game/DummyRun.ts와 scenes/PlayScene.ts만 추가로 확인한다.
- 새 MD는 모두 MyAIAgent 안에 저장한다.

## 재사용 원칙

1. 요청한 동작만 준비한다. 이미 승인된 아트와 런타임 시트는 재사용하고 불필요한 생성·전체 리팩터링을 하지 않는다.
2. 몸체와 효과를 분리한다. 먼지·공격 궤적·속도선은 별도 투명 VFX 아틀라스로 만들고 AnimalEffects에서 재생한다. 단순 벡터 선으로 최종 픽셀 효과를 대체하지 않는다.
3. 대시 잔상은 현재 몸체 텍스처를 반투명 Sprite로 복제한다. 잔상용 캐릭터 이미지를 새로 만들지 않는다.
4. 동물 이름만으로 프레임 수·해상도를 가정하지 않는다. 시트 제목의 숫자 대신 실제 이미지와 프레임 JSON을 검증한다.
5. 4포즈로 충분한 더미는 기존 4포즈 규격을 재사용한다. 자연스러운 연결이 필요하면 요청한 동작만 6~8포즈로 확장한다.

## 투명도와 정렬: 반복 실수 방지

- 생성·배경 제거는 imagegen 스킬의 built-in 도구를 사용한다. 입력은 먼저 눈으로 확인한다. 스크립트로 이미지를 다시 그리거나 배경 제거하지 않는다.
- 새 결과는 새 파일로 저장한다. 기존 파일을 덮어쓰지 않고, 채택 결과는 반드시 프로젝트 안에 복사한다.
- 모든 몸체는 같은 방향·크기. 귀·발·꼬리와 효과에 충분한 투명 여백. 셀 경계를 넘는 먼지/잔상이 있으면 채택하지 않는다.
- 알파가 낮다는 이유만으로 프레임을 타이트하게 잘라내지 않는다. 전체 셀을 Texture.frame에 사용한다. 알파 경계 분석은 중앙·발 기준점 측정용이다.
- 현재 clean 아틀라스: 1536×1024, 384×256 셀, 4열×4행 Run/Attack/Skill/Jump. 논리 orig 512×512, trim=(256-center,400-baseline,384,256), anchor=(0.5,400/512).
- 기존 idle/walk/emote는 기존 규격을 유지한다. 이 값들은 현재 코기 전용 예시이며 새 동물은 실제 크기에 맞춰 같은 원리로 정렬한다.
- trim 전체가 orig 안에 들어가는지, 캐릭터 발 기준점이 애니메이션 전환 후에도 같은지 검증한다.
- 단순 RGBA 여부만으로 투명도 품질을 확정하지 않는다. 셀 테두리의 알파와 외곽 여백을 확인한다. 현재 채택 몸체/VFX의 셀 경계 최대 알파는 1/255다.
- 배경색이나 테두리 잔상이 보이면 기존 증상과 비교해 확인한다. 도구의 투명 미리보기 색만으로 실제 게임의 결과를 단정하지 않는다.

## 연결 규칙

- 로비 이동 Walk, 게임 이동 Run. 상승 Jump → 하강 Fall → Land.
- Attack은 공중에서도 가능하며 점프 물리는 유지. Dash는 지상만 가능하고 중간에 점프·공격으로 취소하지 않는다.
- 반복 동작은 별도 프레임 시간을 사용한다. 행동 타이머 초기화로 같은 시트 재생을 매번 끊지 않는다.
- 단발 Attack/Skill과 VFX는 행동 진행률에 프레임을 맞추고 끝나면 숨긴다. 반대 방향에서 몸체·효과·잔상을 함께 좌우 반전한다.
- 씬 파괴 시 Sprite/UI/리스너를 정리한다. 공용 텍스처는 씬마다 파괴하지 않고 Game.releaseFrames에서 최종 정리한다.

## 최소 검증과 기록

- PNG 크기·RGBA, 프레임 개수/좌표/간격, 여백, trim/orig, 액션 재생·방향 반전·종료 상태를 확인한다.
- npm test 및 npm run build. 코드 변경에 맞는 회귀 테스트만 추가한다.
- 가능하면 실제 브라우저에서 공격·대시·점프 및 모바일 회전 상태를 본다. 미확인이면 완료 기록에 명시한다.
- 액션 JSON의 frames/runtimeReady를 실제 구성으로 갱신한다. 사용한 도구·최종 프롬프트·저장 경로는 해당 작업 MD에 기록한다.

## 몸체 프롬프트 템플릿

Edit the approved [ANIMAL] reference into a transparent runtime atlas. Preserve identity, proportions and pixel style. Exact [COLUMNS] columns x [ROWS] rows, ordered [ACTIONS]. Bodies only: NO dust, trails, crescents, shadows, labels or background. All animals face RIGHT at the same scale. Each complete silhouette fits into the central 60% of its cell with generous empty transparent gutters. Preserve full ears/paws/tail. Consistent foot baseline. No baked jump displacement; the engine handles height. Actual cell dimensions and frame count must be measured after generation.

## VFX 프롬프트 템플릿

Create a transparent pixel-art VFX atlas matching the approved animal sheet, with NO characters. Exact [COLUMNS] columns x [ROWS] rows. Ordered effects [ACTIONS], chronological emergence, peak, breakup and dispersal. Clustered irregular pixels, cream/peach dust and spark fragments, NOT thin vector lines or UI symbols. Entire effects fit inside the central 65% of each cell, wide transparent gutters, no overlapping or clipped cells, no background wash, text or borders. Actual dimensions must be measured after generation.
## 착용 아이템 추가

- 첫 실제 아이템은 Hat:1 산타모자. [SANTA_HAT.md](SANTA_HAT.md) 참고. AnimationSet.head에 프레임별 부착점·폭을 두고 몸체 Sprite 자식으로 연결한다. 코기는 head-anchors.json을 사용한다. 새 동물에 좌표를 그대로 재사용하지 않는다. 모자 원본과 몸체/VFX는 분리한다.

- 명랑이 런타임 예시: createMyeongrang.ts, loadMyeongrang.ts 및 public/assets/characters/myeongrang/frames.json. 원본 셀 규격을 가정하지 않고 실제 투명 구간으로 프레임을 나눈다. 논리 1024×1024·발 원점 870을 사용한다. 효과/모자는 기존 코기 설정을 참조 공유한다. 상세: [MYEONGRANG_ANIMATION.md](MYEONGRANG_ANIMATION.md).

## 동작 전환 시 크기 기준 — 사용자 확인 완료 (2026-10-17)

- 사용자가 승인한 Idle 크기를 기준으로 고정한다. 모션이 커 보인다고 Idle을 키워 맞추지 않는다.
- 앉은 Idle과 서기/달리기/대시를 전체 높이 또는 프레임 사각형 크기로 각각 정규화하면 몸체가 커질 수 있다. 머리·몸통의 실제 표시 크기를 비교한다. 공격·대시를 Run에만 맞춰 해결한 것으로 처리하지 않는다.
- 명랑이는 원본 alpha>128 몸체 픽셀 수(opaqueArea)를 측정하고, Idle 중앙값 면적×Idle 배율²을 기준으로 다른 클립의 최대 표시 몸체 면적을 맞춘 보정이 사용자 확인 완료되었다. 현재 배율과 계산은 MYEONGRANG_ANIMATION.md 및 배포용 frames.json을 따른다.
- 클립 안에서는 일정 배율을 사용해 프레임별 크기 떨림을 방지한다. 발 기준점·좌우 반전·다리를 뻗거나 몸을 낮추는 원래 자세·이펙트는 유지한다. 모자와 잔상은 몸체 배율을 상속한다.
- 새 동물에도 승인된 Idle→Walk/Run/Attack/Skill/Jump/Emote→Idle 전환을 양방향으로 검증한다. 면적 보정은 초기 기준이며 자세·털·꼬리 차이도 있으므로 최종 시각 확인을 대신하지 않는다. 명랑이의 수치 자체를 다른 동물에 복사하지 않는다.

## 공용 표현/모자 보정 (2026-10-17)
- 물음표·음표·하트·환영 문구는 SpeechBubble.ts의 흰색 둥근 사각형, 회색 테두리와 작은 꼬리를 공유한다. 짧게 커지며 나타나고 기호가 바뀌기 전에 흐려진다. 환영 문구는 환영 상태 동안 유지한다.
- 말풍선은 몸체의 자식이 아닌 별도 컨테이너로 두어 좌우 반전되지 않는다. 현재 프레임 머리 기준점 위에 배치하고 씬 종료 시 내부 Graphics/Text를 정리한다.
- 모자는 공유 컨트롤러에서 논리 5px 아래로 보정한다. 원본 기준점/시트/몸체 크기는 유지하고 각 클립 배율의 역수로 위치를 보정한다. 게임 월드 고정 줌은 이 내부 크기 정규화와 별개다.
