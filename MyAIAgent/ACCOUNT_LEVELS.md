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
