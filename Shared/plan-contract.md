# 계획 저장 계약 v1

- API 금액은 정수 원, 현재 화면과 JS 엔진의 금액은 만 원이다. Client 어댑터에서 왕복 변환한다.
- `goalBasis`는 `net_assets`로 고정한다. 목표는 `cash + saved - unpaid`의 최초 도달 월이다. 비상금 경고는 목표 금액에서 차감하지 않는다.
- `POST /plans`는 변경 불가능한 새 스냅샷을 저장한다. 이전에 불러온 계획이 있으면 `parentPlanId`를 연결한다. 기존 기록을 덮어쓰지 않는다.
- `GET /plans`와 `GET /plans/{id}`는 현재 게스트 세션 소유자의 계획만 반환한다.
- `state`는 시작 조건과 월 진행·변경 내역을 저장한다. 계산 결과는 서버의 검증된 결과인 것처럼 저장하지 않는다. 서버는 별도 `POST /simulations`로 재계산하고 Run에 저장한다. 상세 계약은 `simulation-contract.md`를 따른다.
- 쿠키는 서버가 발급한 무작위 세션 토큰이다. DB에는 토큰 해시만 저장한다. 게스트 쿠키 삭제/만료 시 기존 계획의 복구는 지원하지 않는다.
- `schemaVersion: 1`, `state.startMonth: "2026-10"`, `months: 120`이 첫 통합 범위다.

## state

`initial`: `name`, `age`, `avatar`, `cash`, `saved`, `income`, `expense`, `target`.

`monthlySaving`, `annualRate`(연 유효 금리 %, 예: 3), `month`(0~120), `changes`, `rateChanges`, `logs`, `events`.

금액 변경은 `{type: expense|income|saving|once, v: 정수 원, m: 1~120, end: 종료 월 또는 null}`이다. 소득·생활비는 가산, 저축은 설정 값, 일회성 지출은 해당 월 한 번 적용한다. `rateChanges`는 `{m, v: 연 유효 금리 %}`이다. 생애 이벤트는 12/30/48/72/96개월 선택 기록이다.

## 완료 조건

같은 세션에서 조건·월·이벤트를 저장하고 다시 불러오면 동일한 계산 경로를 재현한다. 다른 게스트는 ID를 알아도 조회/부모 계획 지정이 불가능하다. 실패 시 진행 중인 여정을 변경하지 않는다.
