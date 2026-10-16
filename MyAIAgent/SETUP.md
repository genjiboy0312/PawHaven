# Paw Haven 개발 환경

## 확정 스택

- PixiJS 8.22.0: 렌더링, 스프라이트, 에셋 로딩, 마우스·터치 이벤트
- @pixi/sound 6.0.1: 향후 배경음·효과음 구현용 (재생 기능은 미구현)
- TypeScript 7.0.2: strict 타입 검사
- Vite 8.3.4: 개발 서버·프로덕션 빌드
- Node.js: ^20.19.0 또는 >=22.12.0 (설치 환경: 20.20.2)
- npm: package-lock.json을 유지해 설치 버전을 재현

## 실행

프로젝트 루트 D:\Project\PawHaven에서 실행한다.

```powershell
npm ci
npm run dev
npm run typecheck
npm run build
npm run preview
```

## 현재 변경 파일

- package.json, package-lock.json: 실행 스크립트와 패키지
- tsconfig.json: strict TypeScript 설정
- index.html, src/main.ts, src/style.css: PixiJS 기본 반응형 캔버스 및 임시 배경
- MyAIAgent/PAW_HAVEN_PROJECT.md: PixiJS 기술 스택, 승인된 턱시도 고양이 디자인 반영

## 검증 결과 (2026-10-16)

- 패키지 설치 완료, npm audit 보고 취약점 0건
- npm run build: 타입 검사 및 프로덕션 빌드 통과
- npm run dev: 로컬 개발 서버 정상 시작
- 데스크톱 브라우저: 기본 캔버스, 제목, 임시 지면 표시 확인; 수집된 오류·경고 없음
- 모바일 화면 크기 및 실제 기기: 미검증
- npm 10.8.2의 설치 중 edgesOut 오류는 해당 설치에 한해 npx npm@11로 해결. 전역 npm 버전은 변경하지 않음

## 최신 진행 상태

M0·M1 완료. M2는 사용자 요청으로 보류. 코기 M3 자율 행동 구현·테스트 완료, 브라우저 시각 검증은 남아 있다. 최신: [M3_PROGRESS.md](M3_PROGRESS.md). 이전: [M0_M1_PROGRESS.md](M0_M1_PROGRESS.md).

## 초기 패키지 설치 당시 기록 (완료 전)

이번 작업은 의존성 설치와 실행 환경 준비 범위다. M0 전체 완료는 아니다.

- 완료: Vite, TypeScript strict, PixiJS Application, 기본 캔버스·임시 배경, 타입 검사·빌드·데스크톱 실행 확인
- 남음: PixiJS Container를 이용한 프로젝트 자체 Boot/Preload/Lobby 씬 구조, 로딩 화면과 씬 전환 흐름
- 남음: 화면 크기 변경·모바일 화면 검증, 씬 종료 시 리소스 정리 검증
- M0 완료 후 M1: 코기 기준 아트 분석, 프레임 준비, idle/walk 구현
- 동물 AI, 환영, 쓰다듬기, 사운드 재생은 미구현
- React, 물리 엔진, 서버·DB 등 추가 라이브러리는 현재 설치하지 않음
- Markdown 문서는 MyAIAgent에 저장

## 공식 자료

- [PixiJS Quick Start](https://pixijs.com/8.x/guides/getting-started/quick-start)
- [PixiJS Application](https://pixijs.com/8.x/guides/components/application)
- [PixiJS Sound](https://github.com/pixijs/sound)
