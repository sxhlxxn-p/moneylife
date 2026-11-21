# Prototype

구조 정리 전의 정적 금융 시뮬레이션 게임 초안을 원본 그대로 보관한다.

- `index.html`: 게임 화면
- `styles.css`: 정적 스타일
- `app.js`: 프론트 상태와 상호작용
- `engine.js`: 당시 화면이 사용하던 계산 로직

보관본 확인:

```bash
npm run prototype
```

새 기능은 이 경로가 아니라 `client`, `server`, `engine`, `shared`에 구현한다.


## 참고본 고정

2026-11-22 이후 실제 개발/실행 화면은 Client/index.html이다. 예빈 브랜치의 디자인은 Client에 이식했으며 이 디렉터리에 신규 기능/별도 계산 엔진을 추가하지 않는다.
