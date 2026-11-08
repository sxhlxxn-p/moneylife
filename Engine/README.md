# 금융 계산 엔진

`src/index.js`는 현금·저축·소득·지출·이벤트의 월별 처리 규칙을 공유한다. DOM·DB·네트워크에 의존하지 않는다.

- 브라우저: 만 원 단위 실수 계산 미리보기. 기존 화면의 계산 동작을 유지한다.
- 서버: `src/snapshot.cjs`가 정수 원 입력과 Decimal 이자 반올림 정책을 적용한다. `src/runner.cjs`는 고정된 stdin/stdout JSON 인터페이스다.
- 금리: 유효 연 금리에서 월 금리를 구해 월초 저축 잔액에 적용, 원 단위 HALF_UP. 월말 이체는 다음 달부터 이자 발생.
- 목표: `cash + saved - unpaid` 최초 도달 월. 현금 부족 시 자동 대출·저축 인출·상환을 하지 않는다.
- 결과: 초기 0개월부터 월별 잔액, 목표 도달 월·부족 기간·기간 말 자산.

루트에서 `npm ci`로 decimal.js를 설치한다. `npm test`는 기존 미리보기 회귀 사례를 검증한다. `cd Server` 후 `../.venv/bin/python -m pytest -q`는 실제 Node 실행·원 단위 반올림·Run 저장을 검증한다. 서버 계약은 [simulation-contract](../Shared/simulation-contract.md)를 따른다.

주식·물가·부채와 TypeScript 전환은 후속 범위다. 입력 단위와 반올림 정책을 바꾸면 엔진 버전과 기대 결과를 함께 변경한다.
