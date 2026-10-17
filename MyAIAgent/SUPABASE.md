# Supabase 연결 (2026-10-17)

## 대시보드에서 필요한 설정
1. 프로젝트 rgsbqfjnhdvmqxrlqawm → SQL Editor → New query.
2. supabase/migrations/202610170001_player_accounts.sql 전체를 붙여 넣고 Run.
3. Authentication → URL Configuration:
   - Site URL: https://genjiboy0312.github.io/PawHaven/
   - Redirect URLs: https://genjiboy0312.github.io/PawHaven/ 및 로컬 개발 주소 http://localhost:5173/ (127.0.0.1을 쓰면 그 주소도 별도 추가).
4. Authentication → Providers → Email 활성화, Confirm email 유지.
5. 기본 이메일 발송기는 대상/발송량에 제한이 있으므로 공개 테스트 전 Custom SMTP 설정 필요.
6. Google Auth Platform → Clients에서 Web application 생성. Origin은 https://genjiboy0312.github.io, Redirect URI는 https://rgsbqfjnhdvmqxrlqawm.supabase.co/auth/v1/callback. Client ID/Secret은 Supabase Google Provider에만 입력하고 활성화한다.

공개 Publishable key는 클라이언트에서 사용하는 식별 키이다. Secret/service_role/DB 비밀번호는 코드·채팅·GitHub에 넣지 않는다.
이 SQL은 사용자 본인 행만 읽고 저장하도록 RLS와 명시적 권한을 설정한다. 프로필의 최초 닉네임은 서버 함수에서 한 번만 설정할 수 있다.

## 구현 범위
- Google 로그인 및 이메일·비밀번호 회원가입/로그인, 세션 복원, 로그아웃.
- 강아지·의상 선택, 프리셋 3개, Home 배치의 계정별 저장.
- 게스트와 계정별 로컬 데이터를 분리. 게스트 꾸미기 가져오기는 계정 화면에서 명시적으로 선택.
- revision 비교로 다른 기기의 새 저장을 무조건 덮어쓰지 않음. 충돌·오프라인 시 로컬 상태를 유지하고 알림.
- 로그인 계정의 코인·소유권·구매·퀘스트·패스는 적용된 서버 재화 RPC를 사용한다. 게스트는 로컬 프로토타입을 유지한다.
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

## 다음 단계: 서버 재화
- 로그인 계정의 코인/소유 아이템/퀘스트/패스는 새 economy_command RPC로 전환한다. 게스트의 기존 로컬 기록과 꾸미기 저장은 유지한다.
- 새 SQL과 정확한 범위/테스트/실계정 확인 제한: [SERVER_ECONOMY.md](SERVER_ECONOMY.md).
- 로그인 실사용 검증은 사용자 요청으로 추후 Google 연동 시 함께 진행한다.

## 2026-10-17 Google 로그인
- 사용자가 Google OAuth 설정 완료를 확인했으며 공개 Auth 설정에서 external.google=true를 확인했다.
- Settings → Account 상단에 Google로 로그인 / Continue with Google 버튼. 이메일 입력 없이 별도 Google 인증 페이지로 이동한다.
- signInWithOAuth(provider=google), prompt=select_account 사용. 현재 게임 주소의 경로를 보존하고 query/hash를 제거한 URL로 복귀한다. SDK 기본 브라우저 세션 복원으로 계정 저장과 서버 재화를 연결한다.
- 새 로그인 계정은 기존 계정별 저장 정책을 따른다. 게스트 꾸미기를 사용할 때는 Account의 가져오기 기능을 명시적으로 선택한다.
- Client Secret은 앱 환경 변수/저장소에 추가하지 않는다. 로그인 시작 오류는 일반 안내로 표시하고 중복 터치는 처리 중 차단한다.
- 실제 Google 동의·콜백·두 기기 저장/재화 확인은 사용자 로그인으로 확인해야 한다. 공급자 활성화와 자동 테스트만으로 실제 인증 완료를 판단하지 않는다.
- 공식 구현 참고: https://supabase.com/docs/guides/auth/social-login/auth-google- 이번 변경 검증: 전체 103개 자동 테스트와 타입 검사·프로덕션 빌드 통과.

## 2026-10-17 로그인 후 저장 검증·상태 보완
- 사용자 Google 로그인 확인 완료. 실제 PC↔모바일 같은 계정 저장 복원과 운영 서버 구매/보상 수령은 별도 실기기 확인 대상이다.
- Account는 로그인됨, 저장 대기, 저장 중, 저장 완료, 연결 실패/충돌을 구분한다. 신규 계정의 첫 업로드 전에도 저장 완료로 표시하지 않는다.
- 동기화 재시도는 load(false)로 최신 revision을 먼저 확인하고 로컬 변경을 보존한다. 같은 revision이면 저장을 재시도하고 원격이 더 최신이면 충돌을 유지한다.
- 수동 불러오기 요청 뒤 네트워크 대기 중 수정한 꾸미기도 보존한다. 요청 시작 전에 있던 변경의 교체는 기존 불러오기 동작을 따른다.
- 108개 테스트 통과. 새 테스트: 두 기기 모의 강아지/의상/프리셋 3개/가구 복원, 오프라인 안전 재시도, 로드 중 편집 보존, 상태 UI.
- 로컬 PGlite에 계정 migration과 재화 migration을 함께 적용해 실제 SQL로 계정 RLS/revision 충돌/최초 닉네임/중복·직접 변경 거부를 검증했다. 운영 DB의 새 SQL 실행은 필요하지 않다.
- 운영 계정 세션을 임의로 가져오거나 사용자를 대신해 구매/보상 수령하지 않았다.
