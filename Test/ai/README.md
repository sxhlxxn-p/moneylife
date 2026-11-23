# 자연어 조건 변경 평가

`cases-v1.json`은 비식별 작성 예시 100건이다. 10개 범주마다 개발 6건·최종 평가 4건으로 고정했다. 독립 검수는 아직 받지 않은 데이터 초안이며 실제 사용자 분포를 대표하지 않는다. 계약 일관성 테스트 통과는 의미 정답의 독립 검수를 뜻하지 않는다.

범주: 단일 설정, 증감, 금액 표기, 상대 날짜, 절대 날짜, 한정 기간, 복합 요청, 재질문, 미지원, 서버 검증에서 거부할 조건.

## API 없이 진행하는 개발 검증

```bash
.venv/bin/python Test/ai/check_offline.py
.venv/bin/python Test/ai/prepare.py
```

check_offline은 외부 HTTP 전송을 MockTransport로 대체한다. 모의 응답만 사용하고 실제 API 라우트·추출 스키마·서버 검증·승인·SQLite·공용 엔진·설명 검증을 실행한다. 개발 서버에 모의 모델 모드를 추가하지 않으며, 실제 사용자 데이터나 기존 DB를 변경하지 않는다. 모델이 자연어를 정확히 이해했다는 실험이 아니다.

prepare는 100건의 ID·중복·개발/최종 분리·범주 균형·정답 스키마와 검증 라벨의 일관성을 검사한다. `.data/ai-evaluation/preparation/dev-review.csv`에 개발 60건만 내보내 독립 검수자가 reviewer/decision/notes를 작성할 수 있게 한다. 최종 40건의 모델 평가는 실행하지 않는다. 독립 검수는 현재 pending이다.

## 실행

저장소 루트에서 `.venv`와 Server 의존성을 준비한다. 일반 단위 테스트는 외부 API를 호출하지 않는다.

```bash
.venv/bin/python Test/ai/evaluate.py --mode rules --split dev --output .data/ai-evaluation/rules-dev.json
```

모델 연결 후 먼저 개발 문장 하나로 실제 연결을 확인한다. API와 동일하게 Server/.env 또는 환경변수의 OPENAI_API_KEY, LLM_MODEL, LLM_PROVIDER=openai를 읽는다. `npm run setup:llm`과 `npm run check:llm -- --live`로 먼저 설정·연결을 확인할 수 있다. 모델 평가에는 명시적인 --allow-live가 필요하다. 키가 환경에 있어도 이 옵션이 없으면 실행을 중단한다. 아래 명령은 실제 외부 API 호출을 발생시킨다.

```bash
.venv/bin/python Test/ai/evaluate.py --mode structured --allow-live --split dev --case-id single_set-01 --repetitions 1 --output .data/ai-evaluation/smoke.json
```

전체 개발 평가:

```bash
.venv/bin/python Test/ai/evaluate.py --mode plain --allow-live --split dev --output .data/ai-evaluation/plain-dev.json
.venv/bin/python Test/ai/evaluate.py --mode structured --allow-live --split dev --output .data/ai-evaluation/structured-dev.json
```

기본 3회이므로 각 모드의 개발 평가는 60건 × 3 = 180회 요청이다. 규칙은 외부 호출이 없다. 모델 ID·프롬프트·데이터·검증 코드가 고정된 전체 개발 보고서로 최종 평가를 실행한다.

```bash
.venv/bin/python Test/ai/evaluate.py --mode structured --allow-live --split test --frozen-config .data/ai-evaluation/structured-dev.json --output .data/ai-evaluation/structured-test.json
```

최종 평가는 40건 × 3회다. 일부 문장 smoke 보고서는 최종 평가 설정으로 사용할 수 없다. 개발 60건×3회가 빠짐없이 기록돼야 하고, 중복·누락·최종 문장 혼입 및 반복 횟수 차이가 있으면 최종 평가를 거부한다. 데이터/코드 해시나 모델이 바뀌면 최종 평가를 거부한다. 최종 결과를 보고 프롬프트를 고친 뒤 같은 40건을 새 최종 성능으로 주장하지 않는다.

## 비교 방법과 지표

- rules: 단일 요청만 처리하는 보수적인 정규식 기준선. 지원하지 못하는 기간/복합 요청은 질문한다. 실제 앱의 대체 동작으로 사용하지 않는다.
- plain: 같은 모델과 의미 지시를 사용하고 스키마를 프롬프트 텍스트로 요청한다. 구조화 디코딩은 사용하지 않는다.
- structured: 같은 모델과 의미 지시에 strict JSON Schema 형식을 적용한다.
- 세 방식 모두 추출 결과를 동일한 서버 검증에 통과시킨다. rawExact와 finalExact를 분리해 추출과 검증의 영향을 확인한다.

금액·연산·항목·시작/종료 월과 변경 순서까지 일치해야 조건 완전 일치다. 질문 문장의 문자열 자체는 비교하지 않는다. clarificationRecall은 재질문 상태의 재현율이며 질문의 내용이 적절한지까지 검증한 지표가 아니다.

wrongApplications는 오프라인에서 서버 검증에 통과했지만 정답과 다른 변경 수다. 실제 사용자 계획을 저장·적용하지 않는다. 잘못된 적용 비율의 분모는 검증 통과 건수이며 appliedCount로 함께 기록한다. 검증 전 조건 일치율, 검증 후 상태/조건 일치율, 오류 수, 평균/p95 지연, 제공자 토큰 사용량도 저장한다. 모델 비용은 요율을 확정하지 않았으므로 null이다. 3회 반복은 같은 문장을 재사용하므로 독립 표본 180건으로 해석하지 않는다.

## 현재 확보한 결과

`reports/rules-dev-v1.json`: 개발 60건을 3회 실행한 규칙 기준선이다. 46/60건 완전 일치(76.7%), ready 정답의 조건 일치 34/48건(70.8%), 검증 통과한 잘못된 변경 0건이다. 복합·기간 요청의 지원 범위가 좁아 많은 요청을 재질문으로 돌렸다. 개발 세트에서 보수적 거부 규칙을 보완했으므로 최종 일반화 성능이 아니다.

실제 LLM은 키와 모델이 없어 호출하지 않았다. 규칙 결과와 모의 HTTP 테스트를 LLM 성능으로 해석하지 않는다. 최종 평가 40건의 모델 결과도 아직 없다.

저장된 rules-dev-v1 보고서는 해당 커밋에서의 기준선이다. 이후 검증/연결 코드가 바뀌었으면 최신 코드에서 개발 보고서를 다시 생성한 뒤 최종 평가 설정으로 사용한다. 해시가 다른 과거 보고서는 의도적으로 거부한다.

## 개발 실패 사례 보고서

```bash
.venv/bin/python Test/ai/review_development.py --report .data/ai-evaluation/rules-dev-current.json
```

현재 설정과 일치하는 완전한 개발 보고서만 허용한다. `summary.json`과 `failures.csv`를 `.data/ai-evaluation/development-review`에 생성한다. `reports/rules-dev-review.json`은 현재 14개 실패 문장과 범주를 공유한 결과다. 같은 문장의 세 번 반복은 한 문장으로 집계한다. 이 단계는 모델 호출이나 최종 평가를 실행하지 않으며, 독립적인 정답 검수를 뜻하지 않는다.
