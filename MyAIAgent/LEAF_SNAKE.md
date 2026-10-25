# 잎사귀 뱀 프로토타입 (2026-10-25)

## 싱글 Forest 전투 구간 (2026-10-26)
- 싱글 전용 Forest의 초반 평지에 기존 뱀을 총 3마리 배치한다. 순찰 구간은 x=300~500 / 830~1030 / 1510~1710이다. 기존 낮은 장애물 사이에 두고 낭떠러지와 겹치지 않게 한다. Garden/Practice 및 멀티 배치는 한 마리를 유지한다.
- COURSE_SNAKES의 배치 데이터만 확장하며 동일한 시트·순찰·처치/접촉·효과음 컴포넌트를 재사용한다. 새 리소스·UI·SQL·보상·강제 처치 조건은 추가하지 않는다. 점프로 모두 피하거나 어택으로 처치하며 통과할 수 있다.
- 실제 DummyRun 물리/Forest 지형/플레이 이동 배율로 초반 구간을 검증했다. 점프만 사용해 0처치·0피격으로 통과하고, 어택 경로에서는 3처치·0피격으로 통과한다. 전체 288개 테스트·타입 검사·빌드 통과.

## 처치 피드백 (2026-10-25)
- 기존 attack 효과 프레임의 재생 로직을 ImpactBurst 컴포넌트로 분리해 HitReactionEffect와 SnakeDefeatFeedback이 공유한다. 새 이미지/오디오 파일은 생성하지 않는다.
- 처치 위치에 폭 90 world units의 작은 타격 효과를 0.22초간 표시한다. 현재 뱀의 0.3초 squash/fade는 유지한다. effects=false에서는 타격 효과와 squash를 생략하고 기본 fade는 유지한다.
- SnakeDefeatFeedback은 현재 DummyRun의 적 상태만 관찰하며, 새 처치가 있을 때 한 번만 hit 사운드를 요청한다. resize/render·같은 씬 재접속·이미 처치한 적과의 재접촉은 소리를 반복하지 않는다. 같은 프레임의 여러 처치는 한 번으로 합친다. 재경기는 새 관찰 상태를 생성한다.
- hit는 AudioSystem의 기존 SFX 경로에서 75ms의 짧은 삼각파 하강음을 합성한다. 마스터/SFX 볼륨·음소거 설정을 따른다. 다른 참가자의 처치는 내 효과/사운드를 만들지 않는다. 코인·퀘스트 보상이나 네트워크 호출은 추가하지 않는다.
- 전체 287개 테스트 통과. Chrome/Pixi에서 실제 명랑이·기존 attack 텍스처의 폭/위치, attack→hit 콜백 1회씩, 반복 resize 시 무음, effects 끄기, Web Audio 실행을 확인했다.

## 멀티 레이스 적용 (2026-10-25, 아래 싱글 전용 범위 설명보다 우선)
- 기존 시트/manifest/SnakeArt/SnakeView/접촉 효과를 그대로 재사용한다. 멀티 garden/practice도 COURSE_SNAKES의 같은 좁은 구간에 한 마리를 생성한다. 싱글 forest 포함 기존 배치는 유지한다.
- 공통 startsAt과 RoomClient.serverTime의 차이를 초로 계산해 순찰 위치·방향·끝 대기·꿈틀/혀 애니메이션을 결정한다. 물리 단계별 절대 시각을 사용하므로 프레임 속도·늦은 씬 로드·재접속으로 순찰 시간이 누적해서 어긋나지 않는다. 카운트다운 동안 멈춘다. 적 위치·처치용 신규 네트워크 호출/SQL은 없다.
- 처치/접촉/1.2초 보호시간은 각 참가자의 DummyRun에만 속한다. 다른 참가자가 처치해도 내 뱀은 남는다. 같은 씬의 재접속은 처치 상태를 보존하며 새 라운드/재경기는 새 개체로 초기화한다. 적은 서버 권위의 공유 상태가 아닌 개인 장애물이다.
- 멀티 크기는 선택 펫에 따른 충돌 차이를 막기 위해 모두 높이 60 world units, 싱글은 기존 idle 몸체 높이 50%를 사용한다. 기존 맵의 PvP는 계속 꺼 두며 적 접촉용 내부 피격과 외부 receivePlayerHit의 허용 조건을 분리한다.
- 전체 286개 테스트·타입 검사·프로덕션 빌드 통과. 실제 Chrome/Pixi에서 garden/practice 각각 두 참가자 시뮬레이션으로 카운트다운 정지, 서로 다른 프레임 속도에서 위치/애니메이션 일치, 개별 처치, 재접속 상태 보존, 늦은 로드, 새 실행 초기화와 기존 출발 pose 외 추가 전송 없음을 확인했다. 실제 두 계정/모바일 네트워크 환경 검증은 별도로 필요하다.

## 최종 선택 디자인·꿈틀/혀 날름 적용 (2026-10-25, 아래 정적 시안 설명보다 우선)
- 사용자는 `Leaf_Snake_Corgi_Style_Original_Eyes.png`의 코기 기준 몸체/명암 + 최초 큰 눈 스타일 조합을 선택했다. 세이지색·크림색과 눈 표현을 유지한다. 축소 눈 시안·A/B/C 돌출 흰 눈 디자인을 기준으로 되돌리지 않는다.
- 선택 원본은 `Resources/Leaf_Snake_Corgi_Style_Original_Eyes.png`. 이 이미지를 참고하여 built-in image_gen으로 꿈틀 4프레임/혀 날름 4프레임을 만들었다. 가장자리 잘림을 보정한 최종 4열×2행 시트는 `Resources/Leaf_Snake_Animation_Sheet.png`, 바이트가 같은 배포 사본은 `public/assets/enemies/leaf-snake-animation.png`다. 시트에는 기존 디자인 시안의 주변 광원을 넣지 않았다.
- 실제 프롬프트 기준: preserve the approved sage/cream snake, large cream-rimmed eyes, fine-pixel body shading and leaf tail; top row four grounded S-body wriggles with hidden tongue; bottom row hidden/short/full/partly retracted tongue; same scale and fixed baseline; exact 4×2 grid, complete characters with 12% transparent margins; zero glow, shadow, background, text or dividers. 첫 생성의 가장자리 잘림을 수정한 두 번째 시트만 배포한다.
- 원본 1774×887. 프레임별 실제 alpha 경계와 아래쪽 몸체 중심/바닥을 측정한 `Resources/Actions/leaf-snake-frames.json`과 배포 사본을 사용한다. PNG를 코드로 다시 그리거나 후처리하지 않는다. `createSnakeArt`에서 동일한 512×384 논리 캔버스·foot=360을 적용하고, 모두 같은 visibleHeight=280을 기준으로 배율을 고정한다. 프레임마다 화면 높이에 맞춰 재확대하지 않는다.
- `SnakeArt`를 Game에서 1회 로드해 모든 싱글 씬이 공유한다. `SnakeView`는 꿈틀 4프레임을 6fps로 재생하고 3.6초마다 0.6초간 혀 시퀀스 0→1→2→3→1→0을 재생한다. 순찰 끝 대기 시 혀가 들어간 정지 프레임을 사용하며, 예정된 혀 날름 시퀀스는 계속 표현한다. 시트 애니메이션에 이전 단일 이미지 늘임/줄임을 중복 적용하지 않는다.
- 크기는 기존처럼 플레이 중 강아지 idle 몸체 높이의 약 50%, 순찰·물리·처치/접촉·보호시간은 기존 컴포넌트다. 처치는 기존 짧은 squash/fade를 사용하고 effects=false에서는 squash만 생략한다. 기본 캐릭터 애니메이션은 effects 설정과 독립적으로 재생한다.
- 전체 284개 테스트·타입 검사·빌드 통과. 자동 테스트로 8프레임 선택·혀 주기/끝 대기/처치 상태·고정 foot/배율·잘못된 manifest 거절을 추가 검증했다. Chrome 800×450의 실제 Pixi/PNG에서 코기·명랑이 × 싱글 3코스 모두 8프레임 재생·50% 기준 크기·배율/발 고정·일시정지·어택 처치·접촉 효과를 확인했고 멀티에 적이 생성되지 않는 기존 범위도 유지했다.

## 수정 시안 v2 — 검토 중, 운영 미반영
- 이후 만든 A/B/C 게임 몬스터 시안은 사용자에게 거절되어 Resources/Snake_Game_Design_Options.png를 삭제했다. 최초 Leaf_Snake_Prototype.png를 기준으로 다듬는 방향으로 돌아간다. 돌출된 흰 눈·작은 동공의 A/B/C 디자인을 채택하거나 재사용하지 않는다.
- 게임 적용 후 원본의 강한 윤곽·눈 대비·둥근 큰 머리가 강아지와 어울리지 않는다는 피드백으로 제작했다. 원본을 편집 대상으로, 실제 명랑이 게임 화면을 스타일 참고로 built-in image_gen을 사용했다.
- `Resources/Leaf_Snake_Prototype_v2.png`는 별도 투명 PNG다. 원본과 배포 사본은 유지했다. 이미지 1254×1254, alpha>8 경계 (162,426,968,678), 비교용 런타임 추출 Rectangle(160,424,972,682).
- 최종 수정 프롬프트의 기준: preserve the sage/cream leaf-snake identity and right-facing side view; replace heavy dark contours with thin subdued olive contours; keep cute large eyes about 20% smaller with one tiny muted highlight; shorten head height by about 20% and lower the neck; simplify spots/cheeks; match the softly shaded fine-pixel dog; genuine transparency, one sprite, no scene or extra objects.
- `Resources/Leaf_Snake_InGame_Comparison_v2.png`는 기존 PlayScene/Pixi/명랑이/지형에서 원본과 수정본을 동일 높이로 표시해 촬영한 비교 화면이다. 운영 코드·public 리소스 교체 없이 로컬 검토 화면만 만들었고 임시 코드/서버는 정리했다. 최종 채택 전 새 시트나 애니메이션 작업을 진행하지 않는다.

## 최초 정적 시안 기록 (현재는 위 시트로 대체)
- 사용자가 승인한 큰 눈·둥근 머리·세이지색 몸·크림색 배·잎사귀 꼬리의 2D 픽셀 시안이다. 원본 `Resources/Leaf_Snake_Prototype.png`, 배포 사본 `public/assets/enemies/leaf-snake.png`는 바이트가 같다. 원본 투명 PNG를 편집하거나 새 시트로 재생성하지 않는다.
- 원본 1254×1254, alpha>8 경계 (96,209,1065,900). 기존 리소스 로딩 방식대로 런타임에서 2px 여백을 포함한 Rectangle(94,207,1069,904)만 추출한다. 기본 몸체 높이는 현재 강아지 idle의 bodyBounds/trim 높이 × config.scale × clip.scale의 50%다. 모자나 액세서리는 크기 기준에 포함하지 않는다.
- 초기에는 원본 한 장의 작은 늘임/줄임으로 이동·숨쉬기를 표현했다. 현재는 위 꿈틀/혀 시트를 사용한다. 처치는 짧은 찌그러짐과 fade이며 추가 파티클 이미지는 없다.

## 적용 범위와 재사용
- 싱글의 garden/practice/forest 각각 초반 평지에 한 마리씩 배치한다. Garden x=300~540, Practice x=220~430, Forest x=300~500. 장애물·낭떠러지와 겹치지 않는 좁은 구간이며 속도 34 world units/s, 끝에서 0.5초 멈추고 방향을 바꾼다. 추격·독·원거리 공격은 없다.
- PatrolSnake는 렌더러 없는 실행 상태 컴포넌트다. DummyRun의 1/120초 물리 단계에서 순찰·공격·접촉 판정을 처리하고 SnakeView는 이를 표시한다. 코스에 실행 상태를 저장하지 않아 재도전 때 새 개체를 만들고 씬 간 상태가 섞이지 않는다.
- 기존 어택의 전방 거리와 공격 중 상태를 재사용한다. 높이가 겹치는 전방 뱀만 처치하고 같은 단계의 접촉보다 공격 처리를 우선한다. 점프는 회피용이며 밟아 처치하지 않는다. 대시로 닿으면 접촉 피격이다.
- 접촉은 기존 HitReaction/HitReactionEffect를 재사용한다. 짧은 밀려남·반짝임·1.2초 보호시간이며 체력·게임오버·처치 보상·새 퀘스트를 추가하지 않는다. 기존 플레이어 대시·어택 시트와 잔상 효과는 유지한다.
- 처치한 뱀은 같은 시도에서 낙하/체크포인트 복귀 시에도 사라진 상태를 유지하고 처음부터 재도전하면 다시 생성된다. 일시정지/백그라운드 복귀 대기 중에는 기존 PlayScene의 업데이트 차단을 따른다.
- Game에서 공용 SnakeArt를 한 번 로드해 모든 싱글 씬에 전달한다. 아트가 없는 씬에는 보이지 않는 적 판정을 만들지 않는다. 멀티플레이는 아트가 전달되어도 적을 생성하지 않는다. SQL/서버 동기화 변경은 없다.

## 검증
- 전체 282개 테스트·타입 검사·프로덕션 빌드 통과. 순찰 경계·끝 대기·기본 모드 미적용·어택 방향/높이·공격 우선·점프 회피·보호시간·긴 대시 프레임 접촉·처치 후 낙하·재도전 독립 상태·코스 지형 및 idle 크기를 검증했다.
- Chrome 800×450 실제 Pixi PlayScene/PNG에서 코기·명랑이 × 싱글 3개 코스의 6개 조합을 확인했다. 각 한 마리, 약 50% 높이, 순찰, 실제 어택 버튼 처치, 접촉 피격 효과, 퇴장 표시를 확인했다. 멀티 씬에 생성되지 않는 것도 확인했다. 운영 Pages 배포 완료 여부는 별도 확인한다.
