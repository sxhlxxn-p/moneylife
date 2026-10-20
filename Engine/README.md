# Financial engine package

UI, DB, 네트워크와 분리된 순수 금융 계산 함수의 소유 경로다.

- 현재 프로토타입 구현: `src/index.js`
- 목표 계약: `simulate(plan) -> monthlyResults, summary`
- 목표 비교: `compare(runs) -> metric별 차이`
- 기준 사례는 `../fixtures`에 두고 회귀 테스트에서 재사용한다.

현재 구현 금액 단위는 만 원이다. 공통 계약 확정 후 서버 경계에서는 정수 원 단위로 통일해야 한다.

## 검증

```bash
npm test
```

엔진은 동일 입력에 동일 결과를 반환해야 하며 DOM, 네트워크, DB와 환경변수에 의존하지 않는다. 변경 시 `../Test/engine.test.cjs`와 기준 fixture를 함께 갱신한다.

