# 실제 주가 시연 자료 준비

시연 규격은 국내 한 종목(005930), 2024년 1~12월로 고정했다. 일봉을 수집해 각 월의 마지막 유효 원화 종가로 등록한다. 다음 달 가격은 진행 전 사용자에게 보내지 않으며 시작 시 가격 버전/해시를 고정한다. 배당·분할은 모델링하지 않는다.

현재 저장소에는 이 종목의 실제 가격을 넣지 않았다. 규격 JSON과 자동화된 수집 경로만 존재한다. 가상 회귀 자료를 실제 주가라고 표시하지 않는다.

## 설정

가상환경을 활성화하고 Server/.env에 TOSS_ACCESS_TOKEN을 넣거나 TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET을 설정한다. Client와 Git에는 값을 넣지 않는다. 환경변수는 파일보다 우선한다.

토스 WTS에서 키와 호출 허용 IP를 설정해야 한다. Client Credentials 토큰은 수집 프로세스 시작 시 한 번 발급해 해당 일봉 수집에 재사용한다. 공식 인증 명세상 재발급은 기존 토큰을 무효화하므로 다른 실행과 공유하는 클라이언트의 수집을 동시에 실행하지 않는다. 이번 범위에 상시 서비스용 분산 토큰 관리나 자동 재시도 루프는 없다.

```bash
source .venv/bin/activate
npm run check:market
npm run prepare:market
```

두 명령의 기본 동작은 외부 요청이 없는 상태 확인이다. 키가 없으면 configured=false, 실제 등록 자료가 없으면 awaiting-collection을 표시한다.

실제 API 연결을 확인할 준비가 됐을 때만 실행한다.

```bash
npm run check:market -- --live
```

확인 후 프로젝트 표시 가능 범위를 검토하고 실제 자료를 등록한다.

```bash
npm run prepare:market -- --collect --project-usage-confirmed
```

이 명령은 새 자료를 등록하며 기존 버전을 덮어쓰지 않는다. 완료하면 실제 데이터 해시·누락 월을 확인하고, 모의투자 가격 목록에서 해당 자료를 선택한다. 이미 등록된 같은 시연 규격은 다시 수집하지 않는다. source와 기간을 바꿀 때는 새 버전 ID를 사용한다.

실제 연결 검증 전에는 인증/IP/데이터 이용 범위가 확인됐다고 기록하지 않는다. check --live는 연결을 확인할 뿐 가격 자료를 등록하지 않는다.

공식 명세(2026-11-22 확인):
- https://openapi.tossinvest.com/openapi-docs/latest/api-reference/Apis/AuthApi.md
- https://openapi.tossinvest.com/openapi-docs/latest/api-reference/Apis/MarketDataApi.md
