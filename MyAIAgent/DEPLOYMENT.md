# Paw Haven 웹 배포

## 구성

- GitHub Pages, GitHub Actions 자동 배포
- 예상 주소: https://genjiboy0312.github.io/PawHaven/
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
실제 배포 결과와 접속 확인은 작업 완료 후 이 문서에 기록한다.
