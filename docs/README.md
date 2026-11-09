# 개발 문서

처음 참여한 팀원은 [처음 시작하기](getting-started.md)와 [협업 규칙](../CONTRIBUTING.md)을 먼저 읽는다.

## 계획과 명세

| 문서 | 확인할 내용 |
|---|---|
| [개발 구조](architecture.md) | 역할별 폴더, 의존 방향, 현재 구현과 목표 구조 |
| [결정 기록](decisions.md) | 확정한 선택과 미확정 기술 스택 |
| [API 계약](api-contract.md) | API와 공통 데이터 계약 초안 |
| [계산 규칙](simulation-rules.md) | 계산 단위, 월별 순서와 검증 기준 |
| [프론트엔드 연동](FRONTEND_HANDOFF.md) | 화면, 상호작용과 서버 연결 지점 |
| [LLM 설계와 평가](llm-evaluation.md) | 조건 추출, 설명 생성과 평가 기준 |
| [배포](deployment.md) | 배포 계획과 환경 설정 |

## 영역별 시작점

| 영역 | 안내 | 작업 기준 |
|---|---|---|
| 화면 | [Client](../Client/README.md) | [FE Guideline](../Client/FE-Guideline.md) |
| API·DB·LLM | [Server](../Server/README.md) | [BE Guideline](../Server/BE-Guideline.md) |
| 금융 계산 | [Engine](../Engine/README.md) | [Engine Guideline](../Engine/ENGINE-Guideline.md) |
| 공통 계약 | [Shared](../Shared/README.md) | 계약 변경은 관련 영역과 함께 검토 |
| 검증 | [Test](../Test/README.md) | [QA Guideline](../Test/QA-Guideline.md) |
| 공통 예시 | [fixtures](../fixtures/README.md) | 비식별 입력과 기대 결과 |
| 초기 초안 | [prototype](../prototype/README.md) | 보관용, 새 작업은 역할별 영역에서 진행 |

현재 구현·검증 범위와 남은 작업은 [계획서 대비 진행 현황](progress-2026-11-09.md)을 기준으로 확인한다. 재무 계산·게임 기본 화면·Plan/Run 저장·게스트 세션과 투자 사본의 주문/취소/생활 조건 변경·공통 시점 비교가 동작한다. LLM 어댑터·승인·설명·평가 도구는 있으나 실제 모델 실험과 토스 인증 조회는 미검증이다. 현재 실행은 정적 JavaScript·FastAPI·로컬 SQLite 검증이며 React/TypeScript 이전과 PostgreSQL/Docker·배포 검증은 남아 있다.
