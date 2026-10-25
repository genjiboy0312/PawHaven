# 우편함 (2026-10-24)

## 현재 구현
- 승인된 펼쳐 접은 종이 아이콘을 Resources/Lobby_Mail_Note.svg, .png로 정식 보관했다. 미리보기는 Lobby_Mail_Note_Preview.png다. 배포 사본 public/assets/icons/lobby-mail.svg는 SVG 원본과 동일하다. 새로 생성하지 않는다.
- 로비 Quest 바로 왼쪽 같은 행에 Mail을 배치한다(2026-10-25 사용자 수정, 이전 두 번째 줄 배치 대체). 기존 원형 이미지 바탕·색감·Jua·클릭 사운드를 재사용한다. 미수령 유효 우편 수를 배지로 표시한다.
- 씬 전환 없이 기존 설정 계열 패널을 재사용한다. 좌측 목록, 우측 제목·내용·수령 기한·첨부 보상, 개별 받기·모두 받기·새로고침을 제공한다. ×는 패널 안에 배치하며 키보드 Escape/Tab·포커스·기존 일시정지/복귀를 처리한다.
- Guest는 로그인 안내를 표시한다. 실서버에 우편이 없다면 빈 상태를 표시하며 가짜 우편이나 임의의 환영 보상을 넣지 않는다. 쿠폰 입력 UI/검증은 이번 범위가 아니다.
- 코인·간식·기존 의상·가구/소품 수량을 첨부할 수 있다. 인벤토리 아이콘과 명칭을 재사용한다. 이미 소유한 의상은 중복 생성하지 않는다. 첨부 없는 안내 우편도 받기로 처리할 수 있다.

## 컴포넌트와 서버
- MailboxClient는 계정에 고정된 transport·구독·30초 조회·실패 재시도를 담당하고 MailboxPopup과 LobbyHud가 이를 관찰한다. 계정 전환/종료 때 구독·타이머·진행 요청을 정리한다. 응답 유실 시 같은 우편 ID로 재시도한다.
- 서버 player_mail 테이블은 일반 클라이언트가 직접 읽거나 수정할 수 없다. mailbox_command RPC가 본인 우편만 반환한다. 목록은 유효 미수령을 우선해 최대 100개, 모두 받기는 한 번에 최대 100개다.
- public.send_player_mail은 service_role과 SQL Editor의 관리자만 호출할 수 있다. 일반 authenticated/anon에는 실행 권한이 없다. 브라우저는 보상 값이나 수신자를 지정하지 않는다. (user_id,delivery_key) 고유 키로 같은 발송을 재실행해도 중복 배달하지 않는다.
- 기존 economy_command(load)의 초기화·지갑 잠금 및 economy_items/economy_home_items/economy_wallets 저장 구조를 재사용한다. 서버에서 우편 만료·소유자·claimed_at·코인/간식/가구 한도를 검사한다. 한도가 찬 우편은 전체를 미수령으로 남기며 부분 지급하지 않는다. 모두 받기는 가능한 다른 우편만 수령한다.
- 수령과 지갑/아이템 반영은 같은 트랜잭션으로 완료한다. 응답을 잃고 재시도해도 claimed_at 때문에 두 번 지급되지 않는다. 수령 후 ServerShopState.reload로 기존 인벤토리·상점·간식 수량을 다시 읽는다.

## SQL 적용
- SQL Editor 쿼리 이름: **Player Mailbox and Rewards**
- 파일: `supabase/migrations/202610240013_mailbox.sql`
- 계정·서버 재화·가구 상점·간식 마이그레이션이 전제다. 재실행해도 기존 우편과 수령 기록은 유지된다. 실제 운영 적용 완료는 사용자 확인과 구분한다.

## 관리자 발송 예시 (자동 실행하지 않음)
아래 USER_UUID를 Authentication → Users에 있는 수신자 UUID로 바꾼 후, SQL Editor에서 별도 쿼리 **Send Test Mail**로 실행할 수 있다. 이미 발송한 내용을 다시 보내려면 delivery_key를 의도적으로 바꿔야 한다. 서버 지급/쿠폰 검증 로직을 나중에 구현할 때도 같은 함수를 호출한다. service_role 키를 프런트엔드에 넣지 않는다.

```sql
select public.send_player_mail(
  'USER_UUID'::uuid,
  'mailbox-test-20261024',
  '작은 선물이 도착했어요',
  '명랑이와 함께 따뜻한 하루 보내세요.',
  '{"coins":100,"snacks":2,"items":[{"category":"Hat","index":2}],"home":[{"category":"Furniture","index":5,"quantity":1}]}'::jsonb
);
```

- coins: 0~100000, snacks: 0~99. items: 기존 Hat/Body/Acc/Etc 슬롯 1~20. home: Furniture 1~5, Etc 1~4, quantity 1~20. index/quantity는 JSON 숫자를 사용한다.
- 기본 기한은 30일이다. 6번째 인자 p_expires_at에 미래 시각을 지정할 수 있고 최대 366일이다. 지원하지 않는 보상 키나 중복 가구 키는 거절한다.

## 검증
- 전체 245개 테스트 통과. 우편 6개 테스트가 서버 발송 권한·계정 격리·발송 키 중복 방지·읽음·수령 재시도·코인/간식/의상/가구 반영·상한/만료·모두 받기·잘못된 보상·마이그레이션 재실행·로그아웃 후 늦은 응답 폐기를 검증한다.
- 실제 Chrome 1200×760 / 640×440에서 실제 MailboxClient/Popup과 모의 transport로 첨부 리소스·수령/모두 받기·만료 비활성·로그인 안내·닫기 복구·배지 위치/정리·화면 경계를 확인했다. ×와 받기는 elementFromPoint로 실제 클릭 대상을 확인했다. 타입 검사·프로덕션 빌드 통과.
- 화면 검증의 우편은 임시 모의 데이터이며 실제 계정에 지급하지 않았다. 실서버 SQL 적용·실제 관리자 발송·실계정 수령은 별도 확인 대상이다.
