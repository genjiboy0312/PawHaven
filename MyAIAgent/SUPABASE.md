# Supabase 연결 (2026-10-17)

## 대시보드에서 필요한 설정
1. 프로젝트 rgsbqfjnhdvmqxrlqawm → SQL Editor → New query.
2. supabase/migrations/202610170001_player_accounts.sql 전체를 붙여 넣고 Run.
3. Authentication → URL Configuration:
   - Site URL: https://genjiboy0312.github.io/PawHaven/
   - Redirect URLs: https://genjiboy0312.github.io/PawHaven/ 및 로컬 개발 주소 http://localhost:5173/ (127.0.0.1을 쓰면 그 주소도 별도 추가).
4. Authentication → Providers → Email 활성화, Confirm email 유지.
5. 기본 이메일 발송기는 대상/발송량에 제한이 있으므로 공개 테스트 전 Custom SMTP 설정 필요.
6. Google 로그인은 아직 연결하지 않음. 별도 OAuth 설정 후 추가.

공개 Publishable key는 클라이언트에서 사용하는 식별 키이다. Secret/service_role/DB 비밀번호는 코드·채팅·GitHub에 넣지 않는다.
이 SQL은 사용자 본인 행만 읽고 저장하도록 RLS와 명시적 권한을 설정한다. 프로필의 최초 닉네임은 서버 함수에서 한 번만 설정할 수 있다.

## 구현 범위
- 이메일·비밀번호 회원가입/로그인, 세션 복원, 로그아웃.
- 강아지·의상 선택, 프리셋 3개, Home 배치의 계정별 저장.
- 게스트와 계정별 로컬 데이터를 분리. 게스트 꾸미기 가져오기는 계정 화면에서 명시적으로 선택.
- revision 비교로 다른 기기의 새 저장을 무조건 덮어쓰지 않음. 충돌·오프라인 시 로컬 상태를 유지하고 알림.
- 코인·소유권·구매·퀘스트·패스는 기기/계정별 로컬 프로토타입. 서버 검증/기기 간 공유는 후속 작업.
- 공개 키만으로 SQL/인증 설정을 적용할 수 없으므로 위 대시보드 단계는 사용자가 실행해야 함.

## 연결/검증 기록
- 프로젝트 Auth 설정 API에서 이메일 활성화와 이메일 인증 필수 상태 확인. 공개 키·URL 정상.
- 사용자가 SQL 실행 완료를 확인했다. 실제 API에서 player_saves/player_profiles 비로그인 SELECT가 42501로 거부됨을 확인.
- save_player_state/claim_player_nickname도 비로그인 호출을 거부하는지 확인한다. 이메일 발송/실제 계정 생성은 에이전트가 자동 수행하지 않는다.
- 공개 URL/키는 로컬 .env.local(커밋 제외)과 GitHub Actions 빌드 env에 설정했다. 저장소에 포함된 것은 공개용 Publishable key뿐이다.
- 저장 전용 AccountStorage가 기존 게스트 키와 계정 UUID별 접두사를 분리한다. 기기 설정(언어/음량)은 기기 기준을 유지한다.
- 클라우드는 JSON version 1: character / presets / home만 사용한다. 기존 검증기로 범위·수량을 정규화한다.
- 온라인 변경은 0.8초 뒤 저장하며 서버 revision을 비교한다. 오프라인 변경의 dirty/revision을 계정별 로컬에 남기고 재시작 시 최신 서버와 충돌하면 업로드를 중지한다.
- 저장 도중 새 변경은 dirty로 남겨 다음 저장에 포함한다. 씬 재구성 중 기본값 복원은 사용자 편집으로 취급하지 않는다. 계정 변경/종료 후 돌아온 이전 응답은 무시한다.
- 게스트 꾸미기 가져오기는 현재 계정의 꾸미기만 교체한다. 게스트 원본과 계정별 테스트 상점 기록은 유지한다.
- Account의 Load cloud save는 해당 기기의 계정 꾸미기를 원격 저장으로 교체하는 명시적 동작이다. 다른 기기에서 돌아올 때 수동 불러오기/재접속으로 최신 기록을 가져온다. Realtime 동시 편집은 지원하지 않는다.
- 닉네임은 최초 한 번 한글/영문/숫자/밑줄 2~16자. 서버 UNIQUE 인덱스와 최초 설정 RPC로 중복/재설정 방지. 변경권 결제는 미구현.
- 자동 테스트 82개 및 타입 검사/프로덕션 빌드. 계정 분리·게스트 이전·충돌·오프라인 재시작·저장 중 편집·로그아웃·이전 응답 무시·패널 상태/중복 요청을 검증한다.
- 실제 회원가입 인증 이메일 수신, 인증 링크, 서로 다른 두 계정의 서버 RLS, PC↔모바일 로그인/저장 복원은 실제 사용자 확인이 필요하다. 모의 클라이언트 테스트로 실계정 검증을 대신하지 않는다.

- 사용자가 2026-10-17 SQL 실행과 Site URL/Redirect URLs 등록을 확인했다.
- 저장/닉네임 RPC의 실제 비로그인 호출도 42501(권한 없음)로 차단됨을 확인했다.
