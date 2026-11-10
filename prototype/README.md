# Prototype

정적 금융 시뮬레이션 게임 초안을 보관한다.

- `index.html`: 공통 헤더·사이드바와 게임 화면
- `finance.html`: `index.html`의 오른쪽 영역에 불러오는 재무 정보 입력 화면
- `styles.css`: 정적 스타일
- `app.js`: 프론트 상태와 상호작용
- `engine.js`: 당시 화면이 사용하던 계산 로직

보관본 확인:

```bash
npm run prototype
```

브라우저에서 `http://localhost:5173`을 연다. VS Code Live Server를 사용하는 경우 `prototype/index.html`에서 시작한다. 재무 입력 화면은 개발 서버를 통해 불러온다.

새 기능은 이 경로가 아니라 `client`, `server`, `engine`, `shared`에 구현한다.

