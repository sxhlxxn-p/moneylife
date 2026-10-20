# Frontend Guideline

- `Client`는 화면, 스타일, 브라우저 상태와 API 호출을 소유한다.
- 금융 계산 공식을 화면 코드에 추가하지 않고 `Engine` 또는 Server API를 사용한다.
- 서버 결과와 재생 월·모달 같은 로컬 UI 상태를 분리한다.
- 로딩·입력 오류·계산 실패·빈 결과·재시도·목표 미달성 상태를 화면에 표현한다.
- 화면 계약 변경 시 `docs/FRONTEND_HANDOFF.md`와 `docs/api-contract.md`를 함께 수정한다.
- React·TypeScript 이전 전까지 현재 HTML·CSS·JavaScript 실행을 깨뜨리지 않는다.
