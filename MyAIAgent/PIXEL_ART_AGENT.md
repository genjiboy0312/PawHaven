# Paw Haven 픽셀 아트 에이전트

숲길 지형(2026-10-29): 로비의 Stone_Path_Floor.png를 courseThemeArt/CourseTerrain에서 160 world units로 재사용한다. 새 PNG·SQL 없이 지형 질감만 바꾸며 물리/배치/보상과 다른 맵 테마는 유지한다. 상세: [STONE_PATH.md](STONE_PATH.md).

돌길 바닥(2026-10-29): [STONE_PATH.md](STONE_PATH.md). Resources/Stone_Path_Floor.png를 160 world units로 반복하며 index 2의 기존 소유권을 유지한다. 같은 PNG·LobbyMap·상점 구매 컴포넌트를 재사용한다.

벚꽃 테마 및 하늘 구매 규칙(2026-10-29): [CHERRY_SKY.md](CHERRY_SKY.md). 하늘 5종을 Resources에 보관하며 기본 아침만 무료, 나머지는 각 200코인이다. 새 타일과 기존 벚꽃나무로 싱글 벚꽃 산책길을 구성하고 기존 코스/효과를 재사용한다.

2026-10-29 펫 구매 규칙 갱신: 코기만 기본 제공하며 명랑이·턱시도 고양이는 각각 500코인 구매 후 사용한다. 기존 기본 보유 설명보다 이 규칙을 우선한다. 리소스·공통 컴포넌트·서버 검증: [PET_SHOP.md](PET_SHOP.md).

새 동물·행동·효과·소품·펫 가구 작업 시 이 문서를 먼저 읽는다. 동물 작업은 해당 동물의 액션 JSON, 소품·가구 작업은 [PROP_RESOURCES.md](PROP_RESOURCES.md)의 채택 이미지와 프롬프트를 함께 확인한다. 기존 런타임 규격과 도구를 재사용하고 프로젝트 전체 이력을 다시 읽거나 원본 시트를 매번 재생성하지 않는다. 이 문서는 프로젝트용 작업 지침이며 별도 설치형 스킬은 아니다.

## 먼저 확인할 파일

- 잎사귀 뱀: [LEAF_SNAKE.md](LEAF_SNAKE.md). 최종 선택은 코기 기준 디자인 + 최초 큰 눈 조합이다. 공용 8프레임 시트(꿈틀4/혀4)와 Resources/Actions/leaf-snake-frames.json을 재사용한다. 싱글은 강아지 idle 몸체 높이 약 50%, 멀티는 공통 높이 60 world units다. 논리 캔버스/바닥/배율을 모든 프레임에서 고정한다. 싱글/멀티 초반 한 마리·좁은 순찰·기존 어택/피격 효과를 유지한다. 멀티 순찰/애니메이션은 공통 레이스 출발 시각 기준으로 계산하며 처치/접촉은 개인별이다. 추가 적 네트워크 호출은 없다.

- 목 액세서리: Resources/Actions/<animal>-neck-anchors.json 및 [FORMAL_OUTFIT_ASSETS.md](FORMAL_OUTFIT_ASSETS.md). 머리 위치에 상수 오프셋을 더해 목을 추정하지 않는다. 실제 프레임의 목/가슴 좌표를 지정하고 모자와 독립적으로 재생한다.

- Resources/Actions/<animal>-actions.json: 동작별 참고 아트/런타임 준비 상태. 동물별 추가 하위 폴더를 만들지 않고 Actions 하나를 사용한다.
- Resources/<Animal>_Art_Sheet.png: 승인된 캐릭터와 행동 참고. 원본은 보존한다.
- public/assets/characters/<animal>/: 배포용 PNG·프레임 JSON.
- src/animals/AnimalConfig.ts, loadCorgi.ts, AnimalAnimationController.ts, AnimalEffects.ts: 공통 타입·로딩·몸체·효과 재생.
- 게임 규칙 변경 시 src/game/DummyRun.ts와 scenes/PlayScene.ts만 추가로 확인한다.
- 새 MD는 모두 MyAIAgent 안에 저장한다.
- 지형·출발/체크포인트/피니시 표식 작업은 [COURSE_ART.md](COURSE_ART.md)의 채택 PNG·공유 로딩·타일/발 정렬 규격을 재사용한다.
- 시간대별 맵 배경은 [CROSSROADS.md](CROSSROADS.md)의 Resources/Park_Background_morning/noon/sunset/night.png 4장을 재사용한다. 로비 배경 기준의 동일 구도·도트 밀도이며 캐릭터나 UI에 색 필터를 씌우지 않는다. 별도 구름은 Resources/Sky_Cloud.png 한 장을 공유하며 SkyClouds의 하늘 y=0~132 클립 안에서만 시차를 적용한다. 캐릭터 주변/바닥에 구름을 배치하지 않는다.

## 소품·펫 가구 제작 기준 — 사용자 확정 (2026-10-21)

### 공통 스타일

- 기준은 `Resources/Corgi_Art_Sheet.png`의 PUSH 행에 있는 작은 정면 나무 상자다. 세부 기준 이미지·최종 프롬프트는 [PROP_RESOURCES.md](PROP_RESOURCES.md)를 참조한다.
- 코기 옆에 놓았을 때 자연스러운 픽셀 밀도와 절제된 디테일을 유지한다. 단순한 실루엣, 소수의 기본색, 은은한 2~3단계 명암을 목표로 한다. 이 명암 단계는 시각적 방향이며 생성 PNG의 실제 색상 수를 의미하지 않는다.
- 정면 위주로 만들고 물체를 알아보는 데 필요한 최소한의 깊이만 표현한다. 과장된 옆면·윗면·아이소메트릭 시점을 추가하지 않는다.
- 나뭇결·천 질감·미세한 장식·강한 광택·복잡한 입체 명암을 늘리지 않는다. 큰 모자이크 블록을 덧씌우는 방식으로 픽셀 느낌을 만들지 않는다.
- 기존 고밀도 소파 아트나 최초 입체 박스 시안을 새 스타일의 기준으로 삼지 않는다. 아래 채택 파일을 먼저 직접 확인한다.

### 품목별 채택 기준

| 품목 | 채택 파일 | 유지할 특징 |
|---|---|---|
| 박스 | `Resources/Wooden_Box_Prototype.png` | 정면 사각형, 네 테두리 판자와 대각선 판자 하나, 절제된 갈색 명암 |
| 코인 | `Resources/Gold_Coin_Prototype.png` | 단순한 금색 원형과 테두리, 문양·글자·반짝임 없는 중심 |
| 펫 소파 | `Resources/Pet_Sofa_Black_White_Prototype.png` | 강아지 한 마리용 낮은 둥지 형태, 낮은 앞 입구, 검정 외곽과 화이트 쿠션 하나 |

### 펫 가구 형태

- 동물이 실제로 웅크려 쉬는 용도와 크기를 우선한다. 사람용 소파를 그대로 작게 만드는 방식은 피한다.
- 펫 소파에는 사람용 높은 등받이, 좌우로 분리된 2인 좌석, 일반 소파 다리를 넣지 않는다. 낮은 가장자리가 쿠션을 감싸는 아늑한 형태를 유지한다.
- 검정+화이트는 이번 펫 소파의 채택 색상이다. 모든 소품·향후 가구의 색상을 흑백으로 제한하는 규칙은 아니다.

### 제작·검토 순서

1. 채택 파일과 코기를 먼저 확인하고 요청한 리소스 한 종류의 시안을 만든다. 별도 요청 없이 여러 변형·시트·애니메이션까지 생성하지 않는다.
2. 검토 시 실제 게임 표시 크기에서 실루엣·픽셀 밀도·명암을 비교한다. 큰 확대 미리보기만으로 어울림을 확정하지 않는다.
3. 사용자가 수정 방향을 주면 해당 부분만 조정하고, 배경·광택·질감을 임의로 추가하지 않는다. 공통 형태가 정해지면 이후 색상·작은 장식 변형에서 재사용한다.
4. 투명 배경으로 생성하되 실제 알파와 외곽의 번짐·밝은 테두리도 확인한다. 생성 요청만으로 투명도 검증을 완료했다고 기록하지 않는다.
5. 채택 이미지는 기존 파일을 덮어쓰지 않고 프로젝트에 보관하며 제작 도구·최종 프롬프트·파일 경로를 기록한다. 게임 연결·배포는 사용자가 요청한 범위에서 진행한다.

현재 세 리소스는 Resources에 보관한 프로토타입이며 게임 런타임에는 아직 적용하지 않았다.

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
