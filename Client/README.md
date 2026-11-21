# Client

머니 라이프의 재무 입력·마을·계획 비교·모의투자 화면이다. HTML·CSS·JavaScript로 실행하며 금융 계산은 공용 Engine, 저장·AI·모의투자 요청은 FastAPI를 사용한다.

## 실행과 확인

루트에서 의존성을 설치하고 서버와 화면을 실행한다.

```bash
npm ci
npm run dev:server:local
# 별도 터미널
npm run dev
```

Python 의존성과 DB 설정은 [서버 안내](../Server/README.md)를 따른다. 개발 서버 주소는 기본 http://localhost:5173 이며 `/api`는 로컬 API 서버로 전달된다. 검사 명령은 루트의 `npm run check`, `npm test`, `npm run test:ui`다.

## 코드 위치

- `index.html`: 화면 구조, 접근성 속성, 스크립트 의존 순서.
- `src/app.js`: 초기 복원, 메뉴·버튼 연결, 첫 화면 실행.
- `src/journey-store.js`, `journey-defaults.js`: 현재 여정과 기본값. 읽기는 `JourneyStore.current`, 변경은 `set`, `mutate`, `restore`를 사용한다. 읽은 객체·배열은 직접 수정할 수 없다.
- `src/journey-storage.js`: 기존 로컬 저장 형식의 저장·복원과 저장 불가 안내.
- `src/journey-simulation.js`: 공용 Engine 호출과 파생 재무 정보.
- `src/finance-screen.js`, `dashboard-screen.js`, `report-screen.js`, `journey-events.js`: 재무 입력·대시보드·리포트·이벤트와 시간 진행.
- `src/ui-common.js`: 모달·포커스·화면 전환·표시 도구.
- `src/api-client.js`, `api-errors.js`: HTTP·시간 초과·오류 코드와 안내 문구. HTTP 계층은 모달을 직접 만들지 않는다.
- `src/server-plans.js`, `server-events.js`, `session-recovery.js`: 저장 계획·계산 결과·이벤트 분기·세션 복구.
- `src/ai-client.js`: 자연어 변경 요청·보충 답변·사용자 승인.
- `src/paper-client.js`: 모의투자 기능 조립. 각 화면은 `paper-view`, `paper-orders`, `paper-conditions`, `paper-comparison`, `paper-explanation`, `paper-charts`로 나뉜다.
- `src/paper-requests.js`: 미확인 명령의 로컬 보관과 복원. 요청 ID는 재시도 시 새로 만들지 않는다.
- `src/paper-commands.js`, `paper-session.js`, `paper-context.js`: 명령 전송·결과 확인·저장 목록과 모의투자 전용 상태.
- `src/news-game.js`: 가상 뉴스 게임. 실제 뉴스나 시장 예측이 아니다.
- `src/styles.css`: 스타일 진입점. `styles/`의 공통·대화상자·투자·레이아웃·입력·대시보드·반응형 보정 순서로 불러온다.

## 변경 기준

화면에 금융 수식을 추가하지 않는다. 원/만 원 변환은 `plan-state.js`를 사용한다. 재무 요약은 현재 상태에서 계산하고 별도 복사본을 저장하지 않는다. 다른 화면의 상태를 직접 변경하지 않는다.

모의투자는 본편과 분리된 사본이다. 새 명령은 저장 성공 후 전송하고, 응답 유실·시간 초과 시 같은 요청 ID를 유지한다. 명확한 검증 실패와 처리 여부를 모르는 통신 실패를 구분한다. 미래 주가는 진행 전 화면에 전달하지 않는다.

이벤트 확정에는 서버 연결이 필요하다. 원본·새 계획·계산 결과를 함께 저장하고 성공을 확인한 뒤 반영한다. 세션 복구는 로컬 여정을 보존하지만 이전 소유자의 서버 자료를 연결하지 않는다.

외부 API 키는 Client에 넣지 않는다. 실제 LLM과 토스 주가 연결은 서버 설정 후 별도로 검증한다. 화면 원본은 예빈 브랜치에 보존하며 `prototype`은 참고본으로만 사용한다.

## 관련 문서

[화면 명세](../docs/FRONTEND_HANDOFF.md), [계획 계약](../Shared/plan-contract.md), [투자 API](../Shared/paper-api-contract.md), [주문 확인](../Shared/order-preview-contract.md), [AI 변경](../Shared/ai-change-contract.md), [뉴스 게임](../Shared/news-game-contract.md), [백엔드 운영](../docs/backend-operations.md).
