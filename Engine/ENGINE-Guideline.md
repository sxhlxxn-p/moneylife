# Engine Guideline

- `Engine`은 UI, HTTP, DB, LLM과 환경변수에 의존하지 않는다.
- 동일 입력과 엔진 버전에는 동일 결과를 반환한다.
- 월 처리 순서, 단위, 반올림과 부족액 정책은 `docs/simulation-rules.md`와 테스트에 함께 고정한다.
- 변경 시 `Test/engine.test.cjs`와 루트 `fixtures`의 기대 결과를 함께 검토한다.
