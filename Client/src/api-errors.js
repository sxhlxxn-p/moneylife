function apiErrorMessage(resource, code, status) {
  if (
    [
      "paper-plans",
      "paper-runs",
      "paper-comparisons",
      "news-game-comparisons",
      "market",
    ].includes(resource)
  ) {
    const messages = {
      INSUFFICIENT_SHARES:
        "현재 보유 주식에서 이미 예약한 매도 수량을 제외한 수량만 팔 수 있어요.",
      SERIES_PERIOD_EXCEEDED:
        "가상 가격이 지원하는 마지막 달이에요. 새 투자 연습을 시작해주세요.",
      REQUEST_ID_CONFLICT:
        "요청 번호가 다른 내용에 사용됐어요. 저장한 투자 연습을 확인해주세요.",
      MARKET_CATALOG_INVALID:
        "등록된 가격 자료의 형식을 확인해주세요. 기존 저장 결과는 유지됩니다.",
      MARKET_CATALOG_LIMIT: "등록된 가격 자료 수를 확인해주세요.",
      EXPLANATION_INPUT_INVALID:
        "저장된 결과의 지표를 확인하지 못해 해설을 표시할 수 없어요.",
      ORDER_VALUE_TOO_LARGE:
        "참고 거래대금이 계산 범위를 넘었어요. 수량을 줄여주세요.",
      COMPARISON_INCOMPATIBLE:
        "출발 조건·가격 버전·계산 버전이 같은 사본끼리 비교해주세요.",
      COMPARISON_FUTURE_MONTH:
        "선택한 사본이 모두 진행한 시점까지만 비교할 수 있어요.",
      COMPARISON_INPUT_INVALID:
        "저장된 비교 결과를 확인하지 못했어요. 원본은 유지됩니다.",
      NEWS_SOURCE_INVALID:
        "뉴스 게임의 출발 자산을 확인하지 못했어요. 원본 투자 결과는 유지됩니다.",
      NEWS_RESULT_INVALID:
        "저장된 뉴스 게임 결과를 확인하지 못했어요. 현재 선택은 유지됩니다.",
      NEWS_COMPARISON_INCOMPATIBLE:
        "같은 투자 사본과 출발 자산·규칙 버전의 뉴스 기록을 선택해주세요.",
      NEWS_COMPARISON_FUTURE_ROUND:
        "선택한 뉴스 기록이 모두 진행한 라운드까지만 비교할 수 있어요.",
      CONDITIONS_UNCHANGED:
        "적용 기간의 조건이 이미 같은 금액이에요. 변경할 항목을 확인해주세요.",
      CONDITIONS_INVALID:
        "변경할 금액·기간이나 저장된 조건 기록의 크기를 확인해주세요. 현재 사본은 유지됩니다.",
      ORDER_NOT_FOUND: "이 투자 사본에서 해당 주문을 찾을 수 없어요.",
      ORDER_ALREADY_PROCESSED:
        "이미 체결되거나 거부된 주문은 취소할 수 없어요.",
      ORDER_LIMIT_EXCEEDED: "이 계획의 주문 수가 한도에 도달했어요.",
      ENGINE_OUTPUT_INVALID:
        "계산 결과를 확인하지 못했어요. 같은 요청을 다시 확인해주세요.",
      ENGINE_UNAVAILABLE:
        "계산 서버를 사용할 수 없어요. 같은 요청으로 다시 확인할 수 있어요.",
      ENGINE_TIMEOUT:
        "계산 시간이 초과됐어요. 같은 요청으로 다시 확인할 수 있어요.",
    };
    if (messages[code]) return messages[code];
  }
  if (resource === "event-branches" && code === "EVENT_STATE_INVALID")
    return "변경 기록이 저장 한도를 넘었어요. 현재 여정은 유지됩니다.";
  if (resource === "ai") {
    const messages = {
      LLM_NOT_CONFIGURED:
        "서버에 LLM API 키와 모델을 설정해야 해요. 현재 여정은 유지됩니다.",
      LLM_AUTHENTICATION_FAILED:
        "서버의 LLM API 키 인증을 확인해주세요. 현재 여정은 유지됩니다.",
      LLM_ACCESS_DENIED: "설정한 키의 API 접근 권한을 확인해주세요.",
      LLM_MODEL_UNAVAILABLE: "서버의 모델 ID와 모델 접근 권한을 확인해주세요.",
      LLM_PROVIDER_UNSUPPORTED: "서버의 LLM 공급자 설정을 확인해주세요.",
      LLM_QUOTA_EXCEEDED: "모델 제공자의 크레딧·사용 한도를 확인해주세요.",
      LLM_RATE_LIMITED: "AI 요청이 많아요. 잠시 후 다시 요청해주세요.",
      LLM_TIMEOUT: "AI 응답 시간이 초과됐어요. 현재 여정은 유지됩니다.",
      LLM_REQUEST_INVALID:
        "모델이 요청 설정을 받지 못했어요. 서버의 모델·출력 형식을 확인해주세요.",
      LLM_UNAVAILABLE: "AI 서버가 응답하지 않아요. 잠시 후 다시 요청해주세요.",
      LLM_REFUSED:
        "이 요청을 해석하지 못했어요. 바꿀 조건을 다시 입력해주세요.",
      MODEL_OUTPUT_INVALID: "AI 응답 형식이 올바르지 않아 적용하지 않았어요.",
      CLARIFICATION_NOT_FOUND:
        "이 재질문을 찾지 못했어요. 새 질문으로 시작해주세요.",
      CLARIFICATION_PLAN_MISMATCH:
        "재질문의 출발 계획이 달라요. 새 조건에서 다시 질문해주세요.",
      CLARIFICATION_EXPIRED: "재질문이 만료됐어요. 새 질문으로 시작해주세요.",
      CLARIFICATION_LIMIT:
        "보충 답변은 세 번까지 가능해요. 조건을 정리해 새 질문으로 시작해주세요.",
      PROPOSAL_EXPIRED: "변경안이 만료됐어요. 다시 요청해주세요.",
      SIMULATION_FINISHED: "진행이 끝났어요. 새로운 여정에서 요청해주세요.",
    };
    if (messages[code]) return messages[code];
  }
  if (status === 401)
    return "저장 세션이 만료됐어요. 새 세션으로 계속한 뒤 다시 시도해주세요.";
  if (status === 429) return "요청이 많아요. 잠시 후 다시 시도해주세요.";
  if (status === 422)
    return "입력이나 이벤트 적용 후 금액·기간을 확인해주세요.";
  if (status === 404) return "저장된 계획이나 계산 결과를 찾을 수 없어요.";

  return "서버에 연결하지 못했어요. 현재 여정은 이 기기에 남아 있어요.";
}
