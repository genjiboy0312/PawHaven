# Account Levels and Lobby Profile

2026-10-29 구현. 계정 경험치는 시즌패스의 `xp`/`level`과 별도인 `accountXP`에 저장한다.

- 정상 싱글·멀티 완주: 계정 EXP +20. 미완주·실패·중복 완주는 지급하지 않는다.
- Lv.1→2는 EXP 100, 이후 필요량은 레벨마다 +50. 최대 Lv.100 / 누적 EXP 252450.
- 레벨 상승 시 20코인·비스킷 1개 자동 지급. 기존 재화 상한을 적용한다.
- 서버는 기존 완주 토큰·라운드 영수증·계정별 지갑 잠금·요청 식별자를 재사용한다. 요청에 담긴 EXP를 신뢰하지 않는다.
- 게스트는 기존 상점 로컬 저장의 `accountXP`를 사용한다. 기존 시즌패스 경험치를 계정 EXP로 변환하지 않는다.

## UI / reusable components

- 좌측 상단: 현재 펫 초상화 → 닉네임·Lv. → EXP 바와 현재/필요량. 긴 닉네임은 말줄임.
- `LobbyProfile`은 CommerceState 구독과 공통 언어 변경 구독을 사용한다. 펫 이미지는 기존 Idle 아틀라스를 `paintPetFrame`으로 잘라 쓰며 새 이미지가 없다.
- Character·Home은 좌측 하단 가로 배치. 기존 상단 우측 5개 메뉴와 Play 위치 유지.
- 강아지의 발 위치가 좌측 x<28%/y>70%, 우측 x>80%/y>70%인 구역에 들어가지 않도록 경유점을 사용한다. 이 영역의 휴식 가구도 기존 유효 위치 필터로 제외한다.
- 서버 준비 전에는 `Lv. —`/`EXP —`. 레벨업 안내는 상태에서 한 번 소비하며 서버 재시도에도 반복하지 않는다.
- 폰트는 Jua, 기존 로비 표면 이미지·16:9 배치를 재사용한다. 친구 홈 방문에는 본인 프로필을 추가하지 않는다.

## Server setup

SQL Editor 쿼리 이름: **Account Levels and Finish XP**

파일: [202610290034_account_progress.sql](../supabase/migrations/202610290034_account_progress.sql). Pet House Shop(033) 이후 실행. 사용자 실행 완료 확인.

핵심 파일: `src/account/AccountProgress.ts`, `src/ui/LobbyProfile.ts`, `src/shop/ShopState.ts`, `src/shop/ServerShopState.ts`.

검증: 전체 테스트 364개 통과, 타입 검사·프로덕션 빌드 통과. DB에서 싱글/멀티 완주 중복 방지·계정 격리·재화 상한·응답 유실 재시도·마이그레이션 재실행을 검증. 실제 명랑이/도트 로비로 960×540·640×360의 프로필과 메뉴 간격 확인.

## Completion feedback and fixed profile colors (2026-10-29)

- 싱글·멀티 공통 `RunRewardPanel`에 `AccountRewardView`를 추가한다. 보상 확인 전·미완주·거절된 결과에는 EXP를 표시하지 않는다.
- `accountRunReward`는 완주 직전과 서버 지급 확인 후 EXP로 만든 일시적인 표시 기록이다. 기존 지갑이나 시즌패스에 쓰지 않는다. 동시 계정 갱신은 최대 정상 완주량 20으로 제한해 표시하며, Lv.100 도달 시 실제 차이(+10 등) 또는 +0/MAX를 표시한다.
- 레벨업은 이전→이후 레벨과 해당 완주의 코인·비스킷 보상을 표시한다. 로비 안내의 소비 여부와 별도여서 어느 화면도 다른 화면의 정보를 지우지 않는다.
- 결과 DOM은 상태 구독 중 유지한다. 언어·잔액 갱신에 연출을 재시작하지 않으며 `prefers-reduced-motion`에서는 바를 즉시 최종 값으로 표시한다.
- 프로필·결과 바는 `account-xp-track.png`(#e7dbc2)와 `account-xp-fill.png`(#9dbb76)를 공유한다. 원본은 `Resources/Account_XP_Track.png`, `Resources/Account_XP_Fill.png`, 편집 가능한 SVG는 `public/assets/ui/surfaces/`에 있다. 기존 이미지 표면·고정 글자 색·only light 규칙을 재사용한다.
- 모바일 결과창 안쪽에서 보상 간격을 조정하며 긴 결과는 기존 세로 스크롤을 사용한다. 멀티의 복귀 버튼 포커스가 우승자 영역을 자동으로 스크롤하지 않는다.
- 추가 SQL 없음. 034의 기존 완주 보상을 사용한다. 960×540·640×360 싱글/멀티 결과와 레벨업 표시, 언어 변경 시 애니메이션 유지, Chrome 자동 다크모드 전후 프로필 바/글자 실제 색상 동일을 확인했다.
