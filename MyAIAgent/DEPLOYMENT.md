# Paw Haven 웹 배포

## 구성

- GitHub Pages, GitHub Actions 자동 배포
- 배포 주소: https://genjiboy0312.github.io/PawHaven/
- main에 push하면 의존성 설치 → 테스트 → 타입 검사·빌드 → dist 배포
- 설정 파일: .github/workflows/deploy.yml, vite.config.ts
- 상대 에셋 경로로 /PawHaven/ 하위 경로를 지원
- CI Node.js 22 사용; 로컬 실행 명령은 그대로 유지
- 별도 서버, Supabase, 비밀 환경변수 없이 실행

## 확인 방법

- [배포 작업](https://github.com/genjiboy0312/PawHaven/actions/workflows/deploy.yml)에서 성공 여부 확인
- 배포 주소에서 코기 로딩 및 자유롭게/쉬기/걷기 확인
- main에 변경 사항을 push하면 같은 URL에 자동 갱신
- 각 브라우저의 동물 행동은 독립적이며 기기 간 세션 동기화는 제공하지 않음

## 배포 전 검증

npm test, npm run build 및 dist 에셋 경로를 확인한다.
## 배포 결과 (2026-10-16)

- 첫 배포 커밋: afe009f
- GitHub Pages 활성화 및 첫 자동 배포 성공
- 실행: https://github.com/genjiboy0312/PawHaven/actions/runs/38829502315
- GitHub Linux / Node.js 22 환경에서 npm ci, 테스트 8개, 타입 검사, 빌드 및 게시 모두 성공
- 공개 페이지 HTTP 200, 제목 Paw Haven 확인
- HTML에서 참조한 JavaScript/CSS 11개 모두 HTTP 200
- 코기 PNG HTTP 200 및 image/png 응답 확인
- 공개 프레임 JSON에서 idle 8개·walk 8개 확인
- 브라우저 자동화 도구 초기화 오류로 배포 후 시각 검증은 미실행. HTTP 응답과 CI 결과를 근거로 게시 상태를 확인함
- Supabase 및 별도 서버는 사용하지 않음
