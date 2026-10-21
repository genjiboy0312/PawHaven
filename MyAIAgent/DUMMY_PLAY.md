# 더미 플레이

- Play → 평지 코스 → Victory 1.5초 → 페이드아웃 0.4초 → 로비 페이드인 0.4초.
- 240px/s, 출발 120px·도착 2520px: 기본 속도로 10초. 대시 사용 시 단축.
- 좌측 하단 조이스틱, 우측 하단 Attack/Dash/Jump 원형 버튼(Jump 크게), 우측 상단 Settings 원형 더미.
- PC: 방향키 또는 A/D 이동, Space/W/위쪽 방향키 점프, Shift 대시, J 공격.
- 게임 이동은 Run, 공격은 Attack, 대시는 Skill 프레임을 재생한다. 적·데미지·충돌 상호작용은 미구현.
- Settings 기능 없음. 복귀 후 코기는 자율 생활하며 첫 환영 연출은 생략.
- 입력은 포인터 캡처 및 멀티터치 지원. 세로에서 CSS로 회전한 화면에서는 조이스틱 축도 변환. 포커스 이탈/화면 전환 시 입력 초기화.
- 씬 종료 시 입력 리스너와 HTML UI 정리. 코기 텍스처는 재사용.
- 검증: 코스 10초, 완주 이후 이동 차단, 점프/착지, 대시 쿨다운, 공격 종료, Play→완주→복귀와 UI 정리 포함 테스트 21개 및 타입 검사/빌드 통과.
- 실기기 터치 및 브라우저 렌더링의 시각 확인은 별도 필요.
## Run / Attack / Skill 및 발바닥 버튼 배치

- Jump를 아래 중앙에 크게, Attack/Dash를 위 양옆에 작게 배치한다.
- 로비 Walk 유지. 게임 이동 Run, 상승 Jump → 하강 Fall → 착지 Land. Fall/Land는 기존 점프 시트의 포즈를 재사용한다.
- 공중 대시 불가(점프 직후 첫 프레임도 차단). 공중 공격 가능하며 중력/점프 궤적을 유지한다.
- 대시 중 점프·공격 취소 불가. 공격 연타로 동작 타이머를 초기화하지 않으며, 공격 중 대시는 막는다.
- Attack 0.48초, Skill 대시 0.32초. 해당 시간에 8개 프레임을 한 차례 재생한다.
- 새 아틀라스: public/assets/characters/corgi/corgi-run-attack-skill.png
- 좌표: public/assets/characters/corgi/combat-frames.json (2048×768, 8열×3행).
- 원본 이미지는 변경하지 않았다. built-in image_gen으로 Resources/Corgi_Art_Sheet.png를 참고해 투명 게임용 시트로 재구성했다. 원본 포즈의 픽셀 단위 직접 추출은 아니다.
- 생성 결과의 RGBA 및 알파 경계를 분석해 프레임 좌표를 정리했다.
- 테스트: 공중 대시 차단, 공중 공격 궤적 유지, 대시 취소 차단, 게임 Run/로비 Walk 구분, 액션 프레임/아틀라스 범위 검증 포함. 모바일 렌더링과 터치는 실기기 확인 필요.

### 생성 프롬프트 (built-in image_gen)

Prepare a runtime sprite atlas from this exact corgi reference. Preserve orange-and-white corgi identity, proportions, detailed soft pixel illustration, side-facing RIGHT. Extract/adapt RUN, ATTACK, SKILL action panels into exactly THREE horizontal rows of EIGHT equally spaced frames each. Row1 RUN: a coherent looping bounding run cycle, clearly running not walking. Row2 ATTACK: anticipation, playful paw swipe with small white crescent, followthrough, recovery, eight chronological poses. Row3 SKILL: low forward dash, launch stretch with tiny dust trail then recovery, eight chronological poses. Same character scale, isolated full-body silhouettes, paws on same baseline in each cell, ample padding. Uniform 8 columns x3 rows, landscape canvas. True transparent background. Remove dark background, labels, dividers, ground shadows. No other actions, no text. Must keep complete ears paws and all effects within each cell. All frames same body size and facing right.
## 프레임 잘림 및 대시 돌진 보정

- 최신 런타임은 corgi-actions-clean.png / clean-frames.json 사용. 이전 아틀라스는 참고용으로 보존.
- 캐릭터와 효과를 분리. Run/Attack/Skill 각각 4포즈, Jump 상승·정점·하강·착지 4포즈를 가진 4열×4행 시트다.
- alpha > 64 경계를 프레임 크기로 자르지 않고, 384×256 셀 전체의 투명 여백을 유지한다. 알파 경계는 몸 중앙·발 기준 정렬용으로만 사용한다.
- 각 셀의 캐릭터 외곽은 경계에서 8px 이상 떨어져 있으며, 실제 PNG 셀 경계의 최대 알파값은 1/255다.
- 512×512 논리 캔버스 안에 발 기준선 400을 공통 적용. 애니메이션별 anchorY로 기존 idle/walk/emote와 정렬한다.
- 공격 궤적과 대시 속도선은 Graphics로 별도 렌더링해 텍스처 경계에 잘리지 않는다.
- 대시는 방향 고정 초기 수평 속도 1100px/s에서 exp(-3.8t)로 감속. 프레임 시간별 이동량을 적분해 프레임레이트 차이를 줄인다.
- 카메라가 지수 보간으로 뒤따라가며 캐릭터가 실제 화면에서도 앞으로 튀어나오도록 한다.
- 공중 대시 차단, 공중 공격 궤적 유지 및 대시 중 행동 취소 제한은 유지.
- 테스트 27개와 타입 검사/빌드로 확인. 브라우저 및 모바일 실기기의 최종 시각 확인은 별도 필요.

### 채택한 정리 프롬프트 / built-in image_gen

원본 참고: Resources/Corgi_Art_Sheet.png. 저장: public/assets/characters/corgi/corgi-actions-clean.png.

Create a clean game sprite atlas editing the provided corgi reference. Exact 4 COLUMNS x 4 ROWS = SIXTEEN isolated corgis, on transparent alpha. Each cell is square. CRITICAL: absolutely NO visual effects, NO dust, NO smoke, NO trails, NO crescents, NO glows, NO shadows, NO colored halo, NO background. Body ONLY. Wide EMPTY gutters between all dogs: corgi fits into middle 60% of each cell, never touches cell edges. All dogs face RIGHT with identical size, orange-white corgi, giant ears, soft detailed pixel style. Row1 four RUN cycle key poses (extended, gathered, opposite extended, gathered). Row2 four ATTACK paw-swipe poses (prepare, raise front paw, extend paw forward, recover). Row3 four DASH poses (lean forward, low stretched launch, low stretched burst, recover). Row4 four JUMP poses (rising paws tucked, airborne apex paws tucked, descending legs out, landing squash). Keep body paws at consistent baseline near 80% height of each cell; no jumping height baked into atlas. Dogs small within cells, centered, with generous transparent space in all directions. Preserve entire ears/tail/paws. No text or panels. Runtime draws effects separately so only clean animal bodies are needed.

생성 결과는 1536×1024이므로 실제 384×256 셀 크기에 맞춰 좌표와 기준점을 설정했다.
## 픽셀 VFX 및 잔상 반영

- 기존 Graphics 선 효과를 제거했다. AnimalEffects에서 독립 투명 픽셀 아틀라스를 행동 진행률에 맞춰 재생한다.
- Attack: 크림색 초승달·픽셀 파편 4프레임. Dash(Skill): 복숭아색 먼지·속도 잔상·파편 4프레임.
- 대시에는 현재 코기 몸체의 텍스처·anchor·scale를 재사용한 반투명 잔상 3개를 뒤에 표시한다. 방향과 속도에 따라 위치를 맞추고 동작 종료 시 숨긴다.
- 효과 저장: public/assets/characters/corgi/corgi-pixel-effects.png, effect-frames.json. 각 셀 전체를 사용하며 셀 경계 최대 알파는 1/255다.
- 도구: built-in image_gen, 참고: Resources/Corgi_Art_Sheet.png. 원본 유지, 효과만 별도 생성.
- 효과 프레임은 AnimalConfig.effects로 공유하고 Game.releaseFrames에서 최종 정리한다.
- 재사용 지침: PIXEL_ART_AGENT.md. 프로젝트 마스터에서 링크한다.
- 시각/터치 실기기 확인은 별도 필요.

### VFX 최종 프롬프트

Create a transparent PIXEL-ART game VFX atlas matching the ATTACK and SKILL effects in this corgi reference, but with NO DOGS, no characters. Exactly FOUR columns x TWO rows (eight isolated effects), landscape. Top row: four chronological frames of a small playful white-cream crescent paw-swipe with clustered pixel spark fragments, emerging small arc, full thick crescent, breaking crescent, dispersing tiny flecks. Arc opens toward LEFT, thick outer curve on RIGHT; effect strikes to the right. Bottom row: four chronological frames of a horizontal dash wake trailing LEFT: pale cream pixel dust puffs, peach-white staggered motion streaks, scattered square spark flecks, fading dispersed dust. Detailed sprite art with irregular clustered pixels, NOT thin vector lines, NOT UI symbols. Pixel-crisp texture, subtle pale peach inner shading, off-white silhouette, no neon. Each effect entirely within central 65% of its own equal grid cell with wide truly empty transparent gutters ALL around; no overlapping cells, no clipped effects. No labels, no frame borders, no grid, no backgrounds or shadows. Pure transparent alpha outside each compact effect. Reference is style only; DO NOT include the corgi.
## 장애물·발판 코스 검증 (계획 3번)

- 코스 길이는 시작 x=120 → 도착 x=2520, 기본 속도 240으로 약 10초 이동 거리다. 점프 타이밍과 재시도에 따라 실제 시간은 늘어난다.
- 낮은 장애물 2개(높이 36/44), 넓은 발판 1개(높이 58), 120 너비의 낙하 구간 1개. 새 아트 생성 없이 단순한 지형 도형으로 표시한다.
- TrainingCourse.ts의 지형 데이터를 충돌과 렌더링이 함께 사용한다. 코스는 Home 꾸미기 상태와 별개다.
- 몸통 충돌 영역은 반너비 24·높이 90. 1/120초 이하 물리 단계에서 좌우 벽·착지·머리 충돌을 계산한다. 대시로 벽을 통과하지 않으며 발판 위에서 다시 점프할 수 있다.
- 공중 대시는 계속 금지, 공중 공격은 낙하/점프 궤적을 바꾸지 않는다. 달리기·대시 감속·몸체 시트·픽셀 VFX·잔상 및 버튼 배치는 유지한다. 대시로 절벽을 벗어나면 낙하로 전환한다.
- 기준선 아래 190 이상 떨어지면 출발점으로 즉시 재시작한다. 행동·속도·쿨다운·조이스틱/키보드 입력·카메라를 초기화하며 퀘스트 클리어 경험치를 지급하지 않는다.
- 피니시 지면에 도착하면 기존 Victory → 1.5초 대기 → 0.4초 페이드 → 로비 복귀를 사용한다. 복귀 콜백은 한 번만 호출한다.
- 자동 테스트 45개: 좌우 충돌/대시 관통 차단, 발판 착지/재점프, 낙하 중 점프·대시 차단 및 공중 공격, 낙하 후 상태 초기화, 30/60/120 FPS에서 네 번 점프로 완주, 실제 PlayScene 입력으로 실패→재시도→Victory→로비 한 번 복귀. 기존 평지 물리 검증은 별도 평지 fixture로 유지한다.
- 타입 검사·빌드 통과. 실제 브라우저·모바일의 시각/조작감 확인은 여전히 별도 필요하다.

## 2026-10-17 화면 비율 조정
- 게임 월드만 0.78 고정 배율로 표시한다. 캐릭터·지형·모자·잔상·픽셀 VFX가 함께 줄고, 조작 버튼과 설정/Victory UI는 원래 크기를 유지한다. 공격·대시·점프 중 별도 줌 전환은 없다.
- 논리 화면 960×540에서 지면 y=365, 가시 월드 폭 약 1231. 카메라는 캐릭터를 화면 x=288 부근에 두고 코스 끝에서 멈춘다. 부드러운 카메라 옵션과 재시작 초기화는 유지한다.
- 달리기·대시의 월드 수평 속도만 1/0.78로 보정해 화면 이동 속도감을 유지한다. 점프 중력·행동 길이·쿨다운·Victory 대기는 실제 시간 그대로다. 기존 약 10초 이동 거리는 이제 약 7.8초이며 장애물/점프로 실제 완주 시간은 늘어난다.
- 승인된 명랑이 Idle/모션 내부 크기 보정은 변경하지 않는다. 확대된 새 맵을 만들 때는 표시 배율보다 코스 데이터를 확장한다.

## 2026-10-17 짧은 어드벤처 코스
- 실제 Play는 AdventureCourse 데이터를 사용한다. finish=6500, 기준 이동 속도와 0.78 줌은 유지. 정상 주행 약 20~30초, 낮은 발판 5개·틈 2개.
- x=2900 이후 지상에 닿으면 체크포인트 활성화. 추락 시 그 지점으로 복귀하며 누적 기록과 파괴 상자 상태는 유지한다. 카메라도 체크포인트 쪽으로 즉시 맞추고 입력은 해제한다.
- 상자 2개는 방향/거리/높이가 맞는 Attack으로 파괴한다. 지상 Dash는 기존대로 유지하고 상자 보상·아이템 지급은 추가하지 않는다.
- 완주 시 기록·낙하 횟수·상자 수와 다시 하기/로비 결과 UI 표시. 자동 로비 복귀를 없애고 선택 후 0.4초 페이드, 새 씬 진입 시 짧게 밝아진다.
- Game에서 완주 이벤트를 한 번만 전달한다. 재도전은 완료 요청을 기다린 뒤 새 서버 run_start 토큰을 받고 씬을 교체한다. 실패하면 결과 화면을 유지하며 재시도/로비를 다시 선택할 수 있다.
- DummyRun 기본 10초 코스/자동 복귀는 물리 회귀 테스트용 기본값으로 남기고, 실제 Play는 RunOptions로 새 코스/수동 결과 모드를 명시한다.
- 30/60/120FPS 완주 시간·체크포인트·방향/공중 공격 범위·완주 기록 고정·결과 선택·재도전 실패·로비 교감 회귀 테스트.
- 실기기 시각/터치 조작감은 배포 후 사용자 확인 대상이다.

## 2026-10-21 싱글 맵 카드·로컬 최고 기록
- 싱글 맵 선택은 카드 선택 후 별도 Play로 시작한다. 기존 크림색 버튼·배경 썸네일을 재사용해 맵 이름/설명/예상 시간/내 최고 기록을 표시한다. 기록이 없으면 도전 안내를 표시한다. 멀티 방장의 맵 선택 팝업과 방 만들기 맵 버튼 동작은 유지한다.
- `SingleRecords`는 map별 완주 시간을 정수 ms로 저장하며 더 빠른 기록만 갱신한다. 파손된 저장값·음수·0·비정수·알 수 없는 맵을 거부한다. 저장이 막힌 경우에도 현재 세션 기록은 메모리에 유지한다. 로컬 기록이므로 서버 순위·재화 검증에 사용하지 않는다.
- `pawhaven.single-records.v1` 키를 기존 AccountStorage에 저장한다. 게스트/계정별 로컬 버킷을 분리하고 계정 로딩 시 기록 객체도 다시 만든다. 현재 cloud snapshot 대상 키에 포함하지 않아 DB/SQL 변경이나 원격 동기화는 없다. 다른 기기에는 자동 공유되지 않는다.
- 싱글 PlayScene의 실제 완주 시 기록 콜백을 한 번만 호출한다. 중도 이탈/추락/멀티 경기는 기록하지 않는다. 기록을 갱신하면 기존 결과 패널에 New personal best!/최고 기록 갱신!을 강조한다. 재도전은 같은 map과 기록 객체를 사용하며 보상 완료·새 run_start 흐름은 유지한다.
- 158개 테스트·타입 검사·빌드 통과. 카드 선택만으로 시작하지 않음/Play 실행, 기록 표시, 빠른 기록만 유지·새 인스턴스 복원, 잘못된 저장값/저장소 오류, 계정별 분리·cloud dirty 비활성, 완주 시 단일 기록·갱신 강조, 기존 로비 복귀/교감 회귀 검증. 실기기 카드 크기와 배치는 배포 후 확인 대상이다.

## 2026-10-21 숲속 징검길 (싱글 우선)
- ForestCourse / map=forest를 추가했다. finish=10100, checkpoint=5100, 일반 달리기와 점프로 약 32.4초에 완주한다. 선택 카드 예상 시간은 30–40초다.
- 초반 낮은 발판과 첫 틈, 중간 4320/4630의 연속 징검 발판, 5000 이후의 안전한 체크포인트 공터, 후반 달리기·점프 교대 구간으로 구성한다. 마지막 장애물 뒤 넓은 평지에 피니시를 둔다. 상자는 선택적으로 공격할 수 있으며 추가 보상을 만들지 않는다.
- 이동 속도·점프 물리·대시·공중 대시 금지·캐릭터 크기는 유지한다. 정적인 옅은 블록형 나무와 초록 지형 팔레트만 기존 Graphics로 그려 숲 분위기를 구분한다. 신규 이미지 생성/다운로드·움직이는 발판·적은 없다. 카드 썸네일은 기존 배경을 재사용한다.
- CourseCatalog.multiplayer 플래그로 싱글 공개와 멀티 공개를 구분한다. forest는 싱글에서만 선택할 수 있다. 서버는 여전히 garden/practice만 허용하므로 SQL 변경은 없다. 추후 멀티 공개 때는 서버 map 제약·완주 좌표·클라이언트 snapshot 허용값을 함께 수정해야 한다.
- 싱글 맵 카드 3개는 두 장씩 보이는 가로 스크롤을 사용한다. 선택/시작 실패 시 스크롤 위치를 보존한다. 싱글 선택값을 방 만들기 선택값과 분리해 forest 선택 후 멀티로 이동해도 잘못된 방 map을 보내지 않는다.
- 기존 로컬 최고 기록·갱신 강조·같은 코스 재도전을 자동으로 재사용한다. 161개 테스트·타입 검사·빌드 통과. 30/60/120FPS에서 일반/대시 경로 모두 추락 없이 완주, 체크포인트 전후 실패 복귀, 넓은 피니시 지면, forest 로컬 기록 복원, 싱글 노출·멀티 선택 분리를 검증했다. 실제 모바일 난이도/터치 조작감은 사용자 확인 후 조정한다.

## 2026-10-21 싱글 맵 선택 버튼·공통 팝업
- 사용자가 가로 스크롤의 새 맵을 알아보기 어렵다고 피드백했다. 싱글 본문을 선택한 맵 요약/Choose map (전체 맵 수)/Play 구성으로 변경하고 가로 카드 스크롤을 제거했다.
- 기존 멀티 맵 선택 팝업의 배경·입력 잠금·닫기·Escape·포커스 복귀를 공유한다. 싱글 팝업은 전체 맵을 두 열로 표시하고 설명·예상 시간·로컬 최고 기록을 유지한다. 현재 3개 카드는 두 행에 배치하며 더 늘면 세로 스크롤한다.
- 싱글 선택 시 서버 맵 변경 RPC 없이 선택값만 갱신하고 팝업을 닫는다. Play를 눌러야 실제 시작한다. 멀티는 기존대로 방장만 버튼을 보고 서버 map 명령을 사용하며 forest는 노출하지 않는다.
- 닫기/Escape는 선택값을 바꾸거나 게임을 시작하지 않고 요약 화면으로 돌아간다. 팝업이 열린 동안 아래 패널은 inert이며, 선택/닫기 후 맵 선택 버튼으로 포커스를 돌린다. 메뉴 종료 시 중첩 팝업과 이벤트도 정리한다.
- 162개 테스트·타입 검사·빌드 통과. 싱글 전체 3개 노출/선택·기록 표시/명시적 Play, 숲속 선택 후 멀티 설정 분리, Escape·포커스·입력 잠금 복구, 기존 방장 맵 변경을 검증했다. 추가 SQL·이미지 리소스는 없다.
