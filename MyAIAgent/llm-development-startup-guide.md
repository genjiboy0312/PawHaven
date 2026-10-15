# LLM과 함께하는 프로젝트 개발 스타트 가이드

> **목적**: AI 기반 코드 에이전트와 협업하여 처음부터 프로젝트를 개발하는 방법
> **경험 기반**: building-editor (Unified Building Editor) 프로젝트 실제 개발 경험에서 추출한 패턴
> **작성일**: 2026-07-02

---

## 목차

1. [핵심 원칙](#1-핵심-원칙)
2. [Phase 0: 사전 준비](#2-phase-0-사전-준비)
3. [Phase 1: 프로젝트 초기화](#3-phase-1-프로젝트-초기화)
4. [Phase 2: 개발 시작하기](#4-phase-2-개발-시작하기)
5. [Phase 3: LLM 프롬프트 잘 쓰는 법](#5-phase-3-llm-프롬프트-잘-쓰는-법)
6. [Phase 4: 실제 워크플로우 예시](#6-phase-4-실제-워크플로우-예시)
7. [Phase 5: 세션 관리 전략](#7-phase-5-세션-관리-전략)
8. [Cheat Sheet](#8-cheat-sheet)

---

## 1. 핵심 원칙

```
잘못된 방법: "building-editor 만들어줘"
  → 결과: 엉성한 스캐폴딩, 동작 안 함, 재시도 반복
  → 실패율: 100%

올바른 방법: Phase 1 → Phase 2 → ... 순차적 진화
  → 결과: 단계별로 검증된 코드, 점진적 완성
  → 성공률: 80%+

원칙: LLM에게 "전체 설계 먼저" 시키고 "한 방에 만들라고" 하면 망한다
```

### 1.1 LLM 협업의 5계명

| # | 계명 | 설명 |
|---|------|------|
| 1 | **규칙을 문서화하라** | LLM은 세션이 바뀌면 모든 걸 잊는다. `.llm-context/`에 박아넣어라 |
| 2 | **하루 단위로 쪼개라** | "전체 프로젝트 만들어줘" = 실패. "Building CRUD API 만들어줘" = 성공 |
| 3 | **session_id를 저장하라** | 같은 작업은 session_id로 이어서 해야 컨텍스트가 유지된다 |
| 4 | **에러는 구체적으로** | "안돼요" ❌ → "파일 X:Y줄에서 Z에러 발생. 원인과 해결책은?" ✅ |
| 5 | **매 작업마다 commit하라** | LLM이 코드를 망가뜨려도 git으로 롤백 가능 |

---

## 2. Phase 0: 사전 준비

**소요 시간**: 프로젝트 시작 직전 1시간  
**목표**: LLM이 세션이 바뀌어도 프로젝트 컨텍스트를 잃지 않도록 함

### 2.1 LLM 컨텍스트 저장소 생성

프로젝트 루트에 `.llm-context/` 디렉토리를 만들고 필수 파일들을 작성한다.

```
building-editor/
├── .llm-context/           # ← 이 디렉토리가 핵심
│   ├── project-overview.md       # 프로젝트 개요
│   ├── architecture-rules.md     # 아키텍처 규칙 (절대 위반 금지)
│   ├── api-contracts.md          # API 명세서
│   └── setup-commands.md         # 셋업 명령어
├── frontend/
├── backend/
└── docker-compose.yml
```

#### 2.1.1 project-overview.md (예시)

```markdown
# Project: Unified Building Editor

## Tech Stack
- Frontend: React 18 + TypeScript + Vite 6 + Tailwind 4 + Zustand 5
- Backend: Python FastAPI + SQLAlchemy 2.0 + PostGIS
- Database: PostgreSQL 15 + PostGIS 3.4 (SRID 4326)
- 3D: Three.js + @react-three/fiber
- Infra: Docker Compose

## Mono-Repo Structure
building-editor/
├── frontend/          # React SPA
├── backend/           # Python FastAPI
├── docker-compose.yml # 모든 서비스
└── docs/              # 설계 문서

## Key Ports
- Frontend: 5173
- FastAPI: 8000
- PostgreSQL: 5432
- Redis: 6379
```

#### 2.1.2 architecture-rules.md (예시)

```markdown
# Architecture Rules (절대 위반 금지)

## 1. 좌표계
- DB: WGS84 (SRID 4326) - 모든 geometry는 위경도
- Canvas2D: X=좌우(lng), Y=상하(lat)
- Canvas3D: Y-up (X=lng, Y=높이, Z=lat)
- 변환: coordinateTransformUtils.ts에서 처리
- 건물의 origin_longitude/latitude가 기준점

## 2. 데이터 관계
- Building → Floors → Walls/Doors/Windows/Rooms/SecurityDevices
- 모든 DELETE는 CASCADE
- 면적은 PostGIS 트리거 자동 계산
- 장비는 PostGIS 트리거로 Room 자동 할당

## 3. API 패턴
- RESTful, /api/{resource}
- 모든 지오메트리는 WGS84 좌표쌍 [lng, lat]
- 파일 업로드는 multipart/form-data
- 응답은 snake_case (Python) / camelCase 고려

## 4. 프론트엔드 패턴
- 상태 관리: Zustand (단일 스토어에 모든 도메인 상태)
- API 호출: Axios instance (JWT interceptor 내장)
- 2D/3D 렌더링: 순수 함수 모듈화 (Canvas2DRender.ts 패턴)
- 스타일링: Tailwind CSS 변수 시스템
```

#### 2.1.3 setup-commands.md (예시)

```markdown
# 프로젝트 셋업 명령어

## Prerequisites
- Node.js 22+
- Python 3.11+
- Docker Desktop
- Rust (선택사항)

## 1. Docker DB
docker compose up -d postgres redis

## 2. Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

## 3. Frontend
cd frontend
npm install
npm run dev
```

### 2.2 AI 에이전트 설정 파일

`.opencode/instructions/project-rules.md` 또는 AI 도구별 설정에 추가:

```markdown
# Building Editor Project Rules

## 반드시 확인할 파일 (무시 금지)
- .llm-context/architecture-rules.md - 아키텍처 규칙
- .llm-context/project-overview.md - 프로젝트 개요
- backend/app/models/*.py - DB 모델 참조
- frontend/src/shared/types/*.ts - 타입 정의

## 코드 생성 규칙
1. 모든 지오메트리는 WGS84 (SRID 4326) 사용
2. 새 API 엔드포인트는 /api/{resource} 패턴
3. 파일 업로드는 RequestValidatorMiddleware 통과 필요
4. 3D 좌표는 Y-up 시스템 준수
5. Zustand 스토어는 buildingStore.ts 패턴 참조
```

---

## 3. Phase 1: 프로젝트 초기화

**소요 시간**: 1-2시간  
**목표**: 실제로 `npm install && pip install && docker compose up`이 되는 상태

### 3.1 LLM에게 시킬 일 (1세션)

이 단계에서는 하나의 프롬프트로 모든 초기화를 한 번에 시킨다.

#### 프롬프트 템플릿:

```
# Task: 프로젝트 구조 초기화

다음 mono-repo 프로젝트의 초기 구조를 만들어줘.

## 기술 스택
- Frontend: React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + Zustand 5
- Backend: Python FastAPI + SQLAlchemy 2.0
- DB: PostgreSQL 15 + PostGIS 3.4

## 해줘야 할 것 (전부)

### Frontend (building-editor/frontend/)
1. `npm create vite@latest` 수준의 프로젝트 생성 (React + TypeScript 템플릿)
2. package.json 의존성: react-router-dom, zustand, axios, three/@react-three/fiber, @react-three/drei, tailwindcss, lucide-react, zustand
3. vite.config.ts: React plugin, Tailwind plugin, /api 프록시 (→ localhost:8000)
4. tsconfig.json: strict mode
5. index.css: Tailwind import + 기본 스타일
6. App.tsx: BrowserRouter + Routes (기본 페이지 몇 개)
7. main.tsx: React.StrictMode

### Backend (building-editor/backend/)
1. requirements.txt: fastapi, uvicorn, sqlalchemy, psycopg2-binary, geoalchemy2, pydantic, python-dotenv, pytest
2. app/ 디렉토리 구조: api/, models/, schemas/, services/, middleware/, core/
3. app/main.py: FastAPI 앱 + CORS + 헬스체크
4. app/db.py: SQLAlchemy 엔진 + 세션
5. app/__init__.py (빈 파일)

### Docker (building-editor/)
1. docker-compose.yml: postgres(postgis/postgis:15-3.4) + redis(redis:7-alpine)
2. PostgreSQL: 포트 5432, DB total_building_db, 계정 postgres/postgres

### 기타
1. .gitignore: node_modules, venv, __pycache__, .env, dist, *.pyc
2. README.md: 프로젝트 설명 + 실행 방법
3. .env.example: DATABASE_URL 포함

## 중요 조건
- 모든 설정 파일은 실제로 동작해야 함 (복붙 즉시 실행 가능)
- package-lock.json 생성 금지
- requirements.txt는 pip install 가능해야 함
- docker-compose.yml은 docker compose up 으로 즉시 실행 가능
```

---

## 4. Phase 2: 개발 시작하기

### 4.1 방법 A: 계층별 개발 (Layer-by-Layer) — 추천

한 레이어를 완성한 후 다음 레이어로 넘어간다. 안정적이고 디버깅이 쉽다.

```
Week 1: Backend API 완성
  Day 1: Building CRUD API
  Day 2: Floor CRUD API
  Day 3: Upload API (DXF/Image/IFC)
  Day 4: Geometry API (Wall/Door/Window/Room)
  Day 5: Security Device API

Week 2: Frontend 기반 완성
  Day 1: 라우팅 + 레이아웃 + 스토어 + API 클라이언트
  Day 2: Building 관리 페이지
  Day 3: 업로드 페이지
  Day 4: Editor 페이지 기본 구조
  Day 5: 속성 편집기 + 장비 배치

Week 3: Viewer 완성
  Day 1-2: Canvas 2D 렌더러
  Day 3-4: Canvas 3D 렌더러
  Day 5: 2D/3D 통합

Week 4: 고급 기능
  ...
```

#### 세션 프롬프트 템플릿 (계층별):

```
====================
Session: "Building CRUD API"
프롬프트:
"backend/app/api/buildings.py에 Building CRUD API를 만들어줘.
- POST /api/buildings (201 + 중복 검사 409)
- GET  /api/buildings (목록, offset/limit)
- GET  /api/buildings/:id (200 / 404)
- PATCH /api/buildings/:id (200 / 404, 주소 변경 시 자동 지오코딩)
- DELETE /api/buildings/:id (204)
SQLAlchemy ORM 사용, 모든 에러 핸들링 포함.
참조: .llm-context/architecture-rules.md"
====================

====================
Session: "Building Store + API Client"
프롤로그: "Building CRUD API가 완성된 상태.
프론트엔드에서 Building CRUD를 호출하는 코드를 만들어줘.
- frontend/src/api/buildingApi.ts (axios 기반)
- frontend/src/store/buildingStore.ts (Zustand)
- 모든 타입은 frontend/src/shared/types/building.ts에 정의"
====================
```

### 4.2 방법 B: 수직 슬라이스 (Vertical Slice)

한 기능을 백엔드부터 프론트엔드까지 끝까지 만든다. 조기 피드백에 좋다.

```
Week 1: "건물 관리" 기능 완성
  Day 1: Building CRUD API + Store + API Client + 페이지
  (하루만에 Building 관리가 완성됨 → 바로 테스트 가능)

Week 2: "도면 업로드" 기능 완성
  Day 1: Upload API + 업로드 페이지 + 파싱 결과 표시

Week 3: "2D 뷰어" 기능 완성
  Day 1-2: Canvas2D 렌더러 + Geometry API 연동
```

#### 세션 프롬프트 템플릿 (수직 슬라이스):

```
====================
Session: "Device 관리 기능 (API + Store + UI)"
프롬프트:
"Security Device 관리를 백엔드부터 프론트엔드까지 전부 만들어줘.

## Backend
- POST /api/security-devices (장비 생성)
- GET /api/security-devices (목록, floor_id 필터)
- GET /api/security-devices/:id
- PATCH /api/security-devices/:id
- DELETE /api/security-devices/:id
- 모델: SecurityDevice (id, floor_id, room_id, position[POINT], height_meters, device_type, status, rotation 등)
- PostGIS 트리거로 Room 자동 할당 (ST_Contains)

## Frontend
- API Client: frontend/src/api/securityDeviceApi.ts
- Store: buildingStore.ts에 device 관련 상태/액션 추가
- 타입: shared/types/device.ts (SecurityDevice, SecurityDeviceCreate, SecurityDeviceUpdate)
- 페이지: DevicesPage.tsx (목록 + CRUD 다이얼로그)
- 컴포넌트: DeviceTypeSelector.tsx, DeviceListItem.tsx

참조: backend/app/models/security_device.py, docs/architecture-rules.md"
====================
```

### 4.3 방법 비교

| 항목 | 계층별 (Layer) | 수직 슬라이스 (Vertical) |
|------|---------------|------------------------|
| **추천 상황** | 안정적인 프로젝트 | 새 프로토타입 |
| **초기 피드백** | 느림 (모든 API 완성 후) | 빠름 (1일차에 기능 완성) |
| **컨텍스트 관리** | 쉬움 (한 레이어만 집중) | 어려움 (전체 스택 필요) |
| **에러 추적** | 쉬움 (레이어별 디버깅) | 복잡 (어디서 났는지 찾기 어려움) |
| **LLM 부담** | 낮음 | 높음 (컨텍스트 윈도우 압박) |
| **재개발** | **추천** | 검증용으로만 |

---

## 5. Phase 3: LLM 프롬프트 잘 쓰는 법

### 5.1 ✅ 잘되는 프롬프트 패턴

```markdown
## 작업: Geometry 편집 API 만들기

### 컨텍스트
- 지금까지 Building, Floor CRUD API가 완성됨
- 파일 구조:
  - backend/app/models/wall.py, door.py, window.py, room.py (SQLAlchemy)
  - backend/app/schemas/geometry.py (Pydantic)

### 해야 할 일 (구체적)
1. backend/app/api/geometry.py 에 다음 API 생성:
   - PATCH /api/geometry/walls/:id (벽 속성 수정)
   - PATCH /api/geometry/doors/:id
   - PATCH /api/geometry/windows/:id
   - PATCH /api/geometry/rooms/:id
   - POST /api/geometry/walls/batch (일괄 삭제)

2. 각 API의 에러 핸들링:
   - 존재하지 않는 ID → 404
   - floor_id 불일치 → 400
   - DB 에러 → 500 + 롤백

### 참조할 기존 코드
- backend/app/api/buildings.py (에러 핸들링 패턴)
- backend/app/models/wall.py (모델 구조)
```

#### 잘되는 프롬프트의 5요소

| 요소 | 설명 | 예시 |
|------|------|------|
| **컨텍스트** | 현재 상태 설명 | "지금까지 Building CRUD 완성" |
| **목표** | 무엇을 만들지 | "Geometry 편집 API 5개" |
| **구체적 요구사항** | 동작 조건 | "존재하지 않으면 404, DB 에러는 500" |
| **참조 코드** | 패턴을 알려줌 | "buildings.py의 에러 핸들링 패턴 사용" |
| **제약 조건** | 하지 말아야 할 것 | "인증 제외, snake_case 유지" |

### 5.2 ❌ 실패하는 프롬프트 패턴

| ❌ 이렇게 하지 마세요 | 이유 |
|---------------------|------|
| "건물 편집기 만들어줘" | 너무 큼. LLM이 추측만 하다가 망함 |
| "벽 수정 API 만들어줘" | 컨텍스트 부족. DB 구조? 모델? 다 물어봐야 함 |
| "앞에서 하던 거 계속해" | 세션 끊기면 LLM이 모름 |
| "이거 좀 고쳐줘" | 무엇을? 왜? 어떻게? 구체성이 전혀 없음 |
| "에러 나는데?" | 어떤 에러? 어디서? 로그는? |

### 5.3 에러 발생 시 대처법

```
❌ "이거 안되는데 고쳐줘"
  → LLM이 추측으로 수정 → 더 망가짐

✅ "파일 backend/app/api/geometry.py 42번째 줄에서
   TypeError: 'NoneType' object is not subscriptable 에러 발생.
   wall.p1[0]에 접근할 때 wall이 None인 것이 원인으로 보임.
   1) 원인 분석
   2) 수정 코드
   3) 같은 패턴이 있는 다른 곳도 점검"
  → LLM이 정확히 진단하고 수정
```

### 5.4 작업 분할 기준

```
하나의 작업 요청이 다음 조건을 모두 만족해야 함:

□ 1시간 이내에 LLM이 완료할 수 있는 크기
□ 하나의 논리적 단위 (CRUD, 페이지, 컴포넌트)
□ 독립적으로 테스트 가능
□ 기존 코드와의 인터페이스가 명확

→ 이 조건을 넘으면 반드시 분할할 것
→ "Building CRUD API" ✅
→ "전체 백엔드" ❌
```

---

## 6. Phase 4: 실제 워크플로우 예시

### 6.1 Day 1: 프로젝트 초기화

| 시간 | 작업 | 상세 |
|------|------|------|
| 09:00 | `.llm-context/` 작성 | project-overview, architecture-rules, setup-commands |
| 09:15 | LLM에게 구조 생성 요청 | Phase 1 프롬프트 실행 |
| 09:30 | 생성 결과 검토 | package.json, requirements.txt, docker-compose.yml 확인 |
| 09:45 | `npm install` | 의존성 설치, 에러 확인 |
| 10:00 | `pip install -r requirements.txt` | Python 패키지 설치 |
| 10:15 | `docker compose up -d` | PostgreSQL + Redis 실행 |
| 10:30 | FastAPI 실행 테스트 | `/health` 응답 확인 |
| 10:45 | Vite dev server 실행 | `localhost:5173` 접속 확인 |
| 11:00 | **git commit** | `chore: init project structure` |

### 6.2 Day 2: DB + 모델 + Building API

| 시간 | 작업 | 상세 |
|------|------|------|
| 09:00 | LLM에게 마이그레이션 요청 | "001_initial_schema.sql + 모든 SQLAlchemy 모델" |
| 09:30 | migration 실행 | DB 테이블 생성 확인 (16개) |
| 09:45 | LLM에게 Building CRUD API 요청 | "backend/app/api/buildings.py" |
| 10:15 | API 테스트 (curl) | POST/GET/PATCH/DELETE 전부 확인 |
| 10:30 | LLM에게 Pydantic 스키마 요청 | building.py, floor.py 등 |
| 10:45 | 전체 빌드 테스트 | `pip install` 충돌 확인 |
| 11:00 | **git commit** | `feat: add building CRUD API + DB schema` |

### 6.3 Day 3: 프론트엔드 기반

| 시간 | 작업 | 상세 |
|------|------|------|
| 09:00 | LLM에게 App.tsx + 라우팅 요청 | DashboardLayout, lazy loading |
| 09:20 | LLM에게 Zustand store + API client 요청 | buildingStore, buildingApi |
| 09:45 | LLM에게 Building 목록 페이지 요청 | ProjectsPage (테이블 + CRUD 다이얼로그) |
| 10:15 | TypeScript 빌드 테스트 | `npm run build` (tsc) |
| 10:30 | LLM에게 Sidebar + Header 요청 | DashboardLayout 완성 |
| 10:45 | E2E 플로우 테스트 | 페이지 생성 → API 호출 → 데이터 표시 |
| 11:00 | **git commit** | `feat: add frontend building management` |

### 6.4 Day 4: 업로드 기능

| 시간 | 작업 | 상세 |
|------|------|------|
| 09:00 | LLM에게 DXF 업로드 API 요청 | File upload + DXF 파싱 |
| 09:30 | LLM에게 업로드 프론트엔드 요청 | UploadDialog + progress |
| 10:00 | 실제 DXF 파일로 E2E 테스트 | 업로드 → 파싱 → DB 저장 |
| 10:30 | LLM에게 이미지 업로드 API 요청 | OpenCV 파이프라인 연동 |
| 11:00 | 테스트 및 버그 수정 | session_id로 이어서 수정 |
| 11:15 | **git commit** | `feat: add DXF/image upload and parsing` |

### 6.5 Day 5: 2D 뷰어

| 시간 | 작업 | 상세 |
|------|------|------|
| 09:00 | LLM에게 Canvas2D 기본 구조 요청 | renderCanvas2D + 타입 정의 |
| 09:30 | LLM에게 Walls 렌더링 요청 | coordinateTransform 연동 |
| 10:00 | 실제 데이터로 렌더링 테스트 | 브라우저에서 확인 |
| 10:30 | LLM에게 선택/호버 이벤트 요청 | raycasting 대신 2D hit test |
| 11:00 | **git commit** | `feat: add 2D canvas viewer` |

---

## 7. Phase 5: 세션 관리 전략

### 7.1 session_id 활용법

```
Task 실행 시 session_id를 저장해야 한다:

task(
  category="deep",
  load_skills=[],
  description="Building CRUD API",
  prompt="...",
  run_in_background=false
)
→ 결과: { session_id: "ses_abc123", ... }

이 session_id를 메모장/노션에 기록:
  ses_abc123 = Building CRUD API
  ses_def456 = Upload API
  ses_ghi789 = 2D Viewer

다음 날 이어서 할 때:
  task(
    session_id="ses_def456",  ← 저장해둔 session_id
    load_skills=[],
    description="Fix upload error",
    prompt="Fix: 업로드 시 413 에러 발생. RequestValidatorMiddleware에서 제한 확인",
    run_in_background=false
  )
```

### 7.2 세션 상태 저장 템플릿

작업별로 세션 상태를 기록하는 파일을 유지하라:

```markdown
# Session Log

## ses_abc123 (2026-07-01) - Building CRUD API ✅
- 생성: backend/app/api/buildings.py
- 생성: backend/app/schemas/building.py
- 수정: backend/app/main.py (라우터 등록)
- 결과: 5개 엔드포인트 완료, curl 테스트 통과

## ses_def456 (2026-07-01) - Upload API ⚠️
- 생성: backend/app/api/upload.py
- 문제: DXF 파싱 시 좌표 변환 에러 (p1이 null)
- TODO: session_id=ses_def456 으로 이어서 수정 필요
```

### 7.3 세션 분기 전략

```
같은 주제면 같은 session_id로 계속
다른 주제면 새 session_id

예시:
  ses_001: Building CRUD API (Day 1)
    → 같은 session으로 계속 수정해도 됨
    → "Building API에 검색 기능 추가해줘" → ses_001로 이어서

  ses_002: Upload API (Day 2)
    → 새 주제이므로 새 session
    → ses_002로 시작

  ses_002: Upload API 수정 (Day 3)
    → 같은 주제이므로 ses_002 그대로
    → "업로드 시 좌표 변환 에러 수정" → ses_002로 이어서
```

---

## 8. Cheat Sheet

### 8.1 프롬프트 템플릿 모음

#### 새 기능 추가
```
## 작업: [기능 이름]

### 컨텍스트
- 현재 상태: [지금까지 뭐가 만들어졌는지]
- 관련 파일: [참조할 파일 목록]

### 해야 할 일
[구체적인 작업 목록]

### 참조 패턴
[기존 코드의 어떤 패턴을 따라야 하는지]

### 제약 조건
[하지 말아야 할 것, 지켜야 할 규칙]
```

#### 에러 수정
```
## 작업: [에러 내용] 수정

### 에러 정보
- 파일: [경로]
- 라인: [번호]
- 메시지: [에러 메시지]
- 재현 방법: [어떻게 하면 에러가 나는지]

### 원인 추정
[내가 생각하는 원인]

### 수정 범위
[어디까지 수정할지]
```

#### 리팩토링
```
## 작업: [모듈/파일] 리팩토링

### 목표
[무엇을 개선할지 - 성능? 가독성? 구조?]

### 대상
[리팩토링할 파일 목록]

### 유지할 조건
[리팩토링 후에도 반드시 유지되어야 하는 동작]

### 금지 사항
[변경하면 안 되는 것]
```

### 8.2 개발 단계별 체크리스트

```
□ [Phase 0] .llm-context/ 디렉토리 생성
□ [Phase 0] architecture-rules.md 작성
□ [Phase 0] AI 설정 파일에 규칙 등록

□ [Phase 1] 프로젝트 구조 생성 (LLM)
□ [Phase 1] npm install, pip install 성공
□ [Phase 1] docker compose up 성공
□ [Phase 1] git init + 첫 commit

□ [Phase 2] DB 스키마 + 마이그레이션
□ [Phase 2] 모든 SQLAlchemy 모델
□ [Phase 2] 모든 Pydantic 스키마

□ [Phase 3] core API 구현 (Building/Floor/Upload/Geometry/Device)
□ [Phase 3] 모든 API curl/E2E 테스트

□ [Phase 4] 프론트엔드 라우팅 + 레이아웃
□ [Phase 4] Zustand 스토어
□ [Phase 4] API 클라이언트
□ [Phase 4] 주요 페이지 완성

□ [Phase 5] 2D/3D 뷰어
□ [Phase 5] 좌표 변환 정확성 검증

□ [Phase 6] 인증/인가
□ [Phase 6] 테스트 (단위 + E2E)
□ [Phase 6] 성능 최적화
□ [Phase 6] 문서화
```

### 8.3 하지 말아야 할 것

```
❌ "전체 프로젝트를 한 번에 만들어줘"
  → LLM의 컨텍스트 윈도우가 터지거나, 중간에 길을 잃음

❌ "알아서 잘 만들어줘"
  → LLM이 제일 싫어하는 프롬프트. 방향성을 줘야 함

❌ "전에 했던 거랑 똑같이" (세션 끊긴 상태에서)
  → LLM이 모름. .llm-context/를 먼저 읽히고 시작

❌ session_id 저장 안 하고 새로 시작
  → 토큰 낭비 + 컨텍스트 리셋 = 생산성 반토막

❌ git commit 안 하고 계속 작업
  → LLM이 코드 망가뜨리면 복구 불가능
```

### 8.4 성공 공식

```
성공 = 
  명확한 컨텍스트 (.llm-context/) 
  + 작은 작업 단위 (1시간 이하)
  + session_id 저장
  + 구체적 에러 보고
  + 즉시 git commit
  + 점진적 통합
```

---

> **이 문서는 building-editor 프로젝트의 실제 개발 경험에서 추출한 LLM 협업 패턴입니다.**
> **프로젝트를 처음 시작할 때 이 가이드를 따라가면 삽질을 최소화할 수 있습니다.**
