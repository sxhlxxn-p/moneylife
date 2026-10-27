# Server

FastAPI 기반의 머니 라이프 API 서버다. 개발 환경은 Docker Compose로 실행하며, 로컬 Python 설치 없이 소스 변경 자동 반영을 지원한다.

## 실행

저장소 루트에서 다음 명령을 실행한다.

```bash
npm run dev:server
```

또는 `Server` 디렉터리에서 직접 실행할 수 있다.

```bash
docker compose up --build
```

- API: <http://localhost:3000>
- 상태 확인: <http://localhost:3000/health>
- Swagger UI: <http://localhost:3000/docs>
- ReDoc: <http://localhost:3000/redoc>
- OpenAPI JSON: <http://localhost:3000/openapi.json>
- 종료: `Ctrl+C`

API 루트인 <http://localhost:3000>으로 접속해도 Swagger UI로 이동한다. FastAPI 라우트에 요청·응답 Pydantic 모델과 설명을 추가하면 OpenAPI 스키마와 두 문서 화면에 자동 반영된다.

기본 포트와 Client 출처를 바꾸려면 `.env.example`을 `.env`로 복사한 뒤 `PORT`, `CLIENT_ORIGIN`을 수정한다. `.env`와 비밀키는 Git에 커밋하지 않는다.

## 테스트

```bash
docker compose run --build --rm api pytest
```

저장소 루트에서는 다음 명령도 동일하게 동작한다.

```bash
npm test --workspace Server
```

## 구조

```text
Server/
├── app/
│   └── main.py            FastAPI 진입점과 /health
├── tests/
│   └── test_health.py     상태 확인 API 테스트
├── compose.yaml           개발 컨테이너, 볼륨, 포트, 상태 확인
├── Dockerfile             Python 3.12 개발 이미지
├── requirements.txt       런타임 의존성
└── requirements-dev.txt   테스트 의존성
```

요청 검증과 단위 변환은 API 경계에서 수행하고, 금융 결과는 `../Engine`을 호출해 계산한다. API 초안은 `../docs/api-contract.md`, 계산 규칙은 `../docs/simulation-rules.md`, 화면 연결은 `../docs/FRONTEND_HANDOFF.md`를 참고한다.

LLM과 외부 자산 조회는 장애가 발생해도 수동 시뮬레이션이 동작하도록 어댑터 경계로 분리한다. 실제 키와 인증정보는 서버 환경변수로만 관리하며 응답, 로그, LLM 입력에 포함하지 않는다.
