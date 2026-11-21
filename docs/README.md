# 개발 문서

처음 참여한 팀원은 [처음 시작하기](getting-started.md)와 [협업 규칙](../CONTRIBUTING.md)을 읽는다.

## 기준 문서

- [현재 상태](project-status.md): 실제 스택·구현·검증·미완료 범위의 기준.
- [처음 시작하기](getting-started.md): 설치·서버와 화면 실행·영역별 검사 명령.
- [개발 구조](architecture.md): 백엔드 공통 모듈과 기능별 수정 위치.
- [현재 결정](decisions.md): 스택·데이터·트랜잭션·외부 연결 정책.
- [배포](deployment.md): 개발·배포 이미지, PostgreSQL·HTTPS와 백업 복원.

## 기능별 명세

- [API 계약](api-contract.md), [계산 규칙](simulation-rules.md), [저장 복구](write-recovery.md).
- [LLM 구현·평가](llm-evaluation.md), [오프라인 검증](ai-offline-development.md), [평가 실행](../Test/ai/README.md).
- [모의투자](paper-trading-plan.md), [과거 가격 시연](market-demo.md), [가상 뉴스 게임](news-game.md).
- [화면 연결](FRONTEND_HANDOFF.md), [프론트 구조](frontend-structure.md), [백엔드 운영](backend-operations.md).

영역별 안내: [Client](../Client/README.md), [Server](../Server/README.md), [Engine](../Engine/README.md), [Shared](../Shared/README.md), [Test](../Test/README.md).

## 과거 기록

[초기 구조](history/architecture-initial.md), [초기 결정](history/decisions-initial.md), [11월 9일 진행 기록](progress-2026-11-09.md)은 당시 상태다. 현재 구현 여부를 판단할 때는 현재 상태 문서를 우선한다. 기능별 이전 검증 수량도 해당 변경 당시의 결과이며 최신 CI 수량과 다를 수 있다.
