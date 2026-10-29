# Lobby Surface Purchase Repair

2026-10-29. 사용자 증상: 배경·바닥 구매 후 연결 재시도가 반복됨.

최신 스키마와 실제 ShopScene/PurchasePopup 재현에서는 정상 구매됨을 확인했다. 이전 Garden Props SQL의 `garden_home_index`/`garden_home_minimum`이 남는 경우 가구·기타 기준의 인덱스/최소 수량 검사가 배경·바닥 구매를 23514로 거절한다. 이 상태에서 EconomyClient가 오류를 통신 실패로 처리해 같은 요청이 계속 재시도되는 경로를 재현했다. 실제 사용자 DB의 제약 목록을 직접 읽은 것은 아니다.

## Repair

SQL Editor 이름: **Repair Lobby Surface Purchases**

파일: [202610290036_repair_surface_purchases.sql](../supabase/migrations/202610290036_repair_surface_purchases.sql)

해당 보유 테이블의 category/item_index를 참조하는 이전 CHECK만 정리하고 최신 종류·인덱스·최소 수량·배경/바닥 1개 상한을 다시 설치한다. 전역 0~20 수량 제한, RLS, 구매 기록, 요청 영수증, 코인·EXP, 현재 RPC 함수는 유지한다. 최신 계정 경험치·공원 레벨 함수도 덮어쓰지 않는다.

EconomyClient는 23514를 서버 설정 문제로 구분한다. 결과를 알 수 없는 통신 오류와 동일하게 기존 구매 요청 식별자를 보존해, SQL 복구 후 재시도 시 중복 차감하지 않는다.

## Verification

- 최신 SQL의 배경·바닥 구매가 ready 상태로 돌아오고 소유권·잔액이 일치하는지 검증.
- 이전 가구 전용 제약을 설치해 동일 증상 재현 → 구매 롤백·차감 없음 확인 → 복구 SQL → 동일 요청 재시도 성공·1회 차감 확인.
- 기존 펫소파 구매 보존, SQL 재실행 안전성, 잘못된 종류·배경/바닥 중복 보유 거절 확인.
- 실제 상점 UI에서 배경·바닥 구매 확인 팝업이 닫히고 ready 상태를 유지함을 확인.
