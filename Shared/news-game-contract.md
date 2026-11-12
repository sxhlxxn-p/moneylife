# News game records v1

Author: sxhlxxn.

- `POST /paper-plans/{planId}/news-games`: `{requestId: UUID, choices: ('hold'|'half'|'sell')[]}`. 1~4개 선택만 허용한다. 금액·seed·충격·결과는 받지 않는다. 응답은 201이며 같은 소유자의 동일 요청/사본/선택은 같은 기록을 반환한다. 요청 ID 재사용 내용 충돌은 409다.
- `GET /paper-plans/{planId}/news-games?limit=20&offset=0`: 해당 소유자/사본의 최신 기록부터 반환한다. limit 1~100, offset 0 이상.
- `GET /news-games/{recordId}`: 소유한 개별 기록. 타인/없는 기록은 404.

기존 게스트 쿠키·Origin 검사를 적용하고 응답은 `Cache-Control: no-store`다. 사본 소유권 확인 후 현재 저장 Run을 검증한다. 서버가 현재 현금·저축·확인된 주가·보유 수량·미충족 비용과 조건을 가져오며, 프론트와 같은 `Engine/src/news-scenario.js`로 선택을 재생한다. 뉴스게임은 순서/충격이 고정된 가정 실험이고, 실제 시장의 다음 달 가격을 사용하지 않는다.

응답 `{id, paperPlanId, paperRunId, name, sourceMonth, createdAt, result}`. `createdAt`은 기존 API와 같은 epoch 마이크로초다. result는 `{version:'news-game-v1',seed,choices,history,heldHistory,finalAssets,heldAssets}`이며 각 라운드에 대응·주가 손익·소득/생활비 변화·부족액·자산을 포함한다. 서버는 계산 결과의 형식과 자산/라운드 불변식을 검사한다. 원본 가격 배열·미래 가격·주문 원본은 응답하지 않는다.

저장소 `news_game_records`는 독립된 불변 결과 사본이다. 기존 금융 계획·투자 Run·주문은 변경하지 않는다. 중간/완료 라운드를 모두 저장할 수 있고, 이어서 진행한 결과는 새 기록으로 저장한다. 예시 게임은 서버 저장하지 않는다. 브라우저의 저장 버튼 재시도는 같은 요청 ID를 사용하며 실패했다고 금액을 확정하지 않는다.

규칙/라운드 버전 변경 시 기존 기록을 새 규칙으로 자동 재생하지 않는다. v1 화면은 v1 기록만 복원하고 출발 Run/seed/최종 자산을 확인한다. 저장 세션이 만료되면 기존 게스트 복구 한계가 적용된다.
