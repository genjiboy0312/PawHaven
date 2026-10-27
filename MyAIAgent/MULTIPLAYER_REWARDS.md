# 멀티 완주 보상 (2026-10-28)

- 최종 검증: 전체 318개 테스트·타입 검사·프로덕션 빌드 통과. 이 문서 작성 시 실서버 SQL 실행 완료 응답은 아직 받지 않았다.

- 싱글과 동일한 완주 10코인 + 개인 수집 개수(1개=1코인)를 지급한다. 순위별 차등은 추가하지 않는다. 서버 완주자로 확인된 사용자만 코인/100 XP/일일 완주 진행을 받는다. DNF는 수집량만 표시하고 ‘미완주 · 완주 보상 없음’을 표시하며 지급 요청을 보내지 않는다.
- 기존 RacePodium의 우승자/순위표 밑에 RunRewardPanel을 재사용한다. 실제 지급 확정 전 잔액을 올리지 않으며 기존 commerceStatus 재시도 버튼을 사용한다. 팝업의 최대 높이/스크롤/Jua/PNG 표면을 유지한다. 재시도 버튼도 키보드 포커스로 접근할 수 있도록 기존 한 버튼 전용 Tab 처리를 확장했다. 팝업 해제 시 구독도 정리한다.
- PlayScene은 서버 results 상태의 round UUID별로 한 번 요청한다. Game은 계정의 ServerShopState를 캡처해 이전 계정의 늦은 응답이 다른 계정에 적용되지 않게 한다. 새 계정이나 게스트 보상으로 복사하지 않는다. 순위/이동/준비/카운트다운 RPC는 변경하지 않는다.
- SQL 이름 **Multiplayer Finish Rewards**. 파일 `supabase/migrations/202610280024_multiplayer_rewards.sql`. Single Run Coin Rewards(023)와 멀티 방 스키마가 선행되어야 한다. raceRewardsReady 플래그가 없는 구형 서버에는 요청하지 않고 준비 중으로 표시한다.
- 기존 잠긴 지갑·요청 UUID·재시도 큐를 공유하는 race_reward 액션을 추가한다. room/round/collected만 전달한다. 서버는 mp_rooms의 실제 round/맵/playing 또는 results/시작 시각과 mp_racers의 본인 finished_ms를 확인한다. 수집 상한은 기존 Practice 7/Garden 10/Forest 11/Crossroads 13과 같다. 수집 개수는 클라이언트 보고 값에 상한을 적용하며 실제 경로를 서버 재생하는 기능은 아니다.
- economy_race_rewards는 (user_id,round_id) 기본 키로 1회 지급을 보장한다. 잔액/XP/일일 진행/영수증은 같은 트랜잭션에 저장하며 직접 테이블 접근은 RLS/권한으로 막는다. 방에 FK를 두지 않아 삭제된 방도 이미 지급한 영수증은 보존한다. 최초 지급은 서버 경기 정보가 남아 있을 때 검증하며, 이미 승인한 보상은 방 삭제/다른 UUID 재요청/응답 유실에도 다시 지급하지 않는다.
- 공통 run_id/run_reward 응답을 재사용하며 이 액션의 run_id는 경기 round UUID다. 현재 결과와 같은 round일 때만 상태를 갱신한다. 1,000,000 지갑 한도에서는 실제 증가한 금액만 표시한다.
- 검증: 실제 PostgreSQL(PGlite)에서 본인 완주/미완주·수집 상한·중복 요청·방 삭제 후 영수증·직접 쓰기 거부·SQL 재실행을 확인했다. 실제 ServerShopState/EconomyClient와 DB를 연결해 응답 유실 후 같은 UUID 재시도/관찰자 갱신/미완주·구형 SQL에서 요청 생략을 확인했다. Chrome 실제 PlayScene/RacePodium에 테스트 전송기를 연결해 한 번 요청·실패 대기·포인터 재시도→확정·640×360/812×375 경계·복귀 후 잔액을 확인했다.

## 공격 타깃 상자 확인
- 공격 타깃은 이미 loadCourseArt의 box → BoxTargetView로 연결되어 있었다. 기존 `Resources/Wooden_Box_Prototype.png`의 배포본 `public/assets/items/wooden-box.png`를 재사용하며 새 리소스를 생성하거나 같은 기능을 중복 구현하지 않았다.
- 로드된 프레임은 (363,353,568,561), 높이 48, anchor(.5,1). Home의 장식 상자와 원본/공유 Texture를 사용하며 공격 여부는 기존 타깃 broken 상태를 따른다. 독립 테스트처럼 아트가 없는 호출만 기존 도형 fallback을 쓴다.
- 실제 싱글·멀티 씬에서 box-target Sprite의 Texture와 프레임을 확인하고 네이티브 J 입력으로 공격→broken→0.3초 파괴 연출 후 숨김을 확인했다. 물리/공격 범위/타깃 개수는 바꾸지 않았다.
