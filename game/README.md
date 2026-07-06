# game — 산토쿠 전술 레이어 (진짜 코드베이스)

> `spike-0/`(던져버린 렌더 실험)와 **별개**. 여기가 실제 구현이다. 설계 → [doc/05 5.6](../doc/05-tech-architecture.md).

## 원칙
- **헤드리스 결정적 sim + 렌더 분리.** `sim/`은 PixiJS를 모른다(순수 TS·고정 틱·시드 RNG).
- **밸런싱 수치 = 데이터**(`data/`), 코드에 하드코딩 금지.
- **입력 = 교전 스냅샷 / 출력 = 승패+정도** (레이어 격리).

## 구조
```
src/
  data/
    grades.ts    등급→배율 (S/A/B/C/D/E=100..50, 치명율 ÷10)
    units.ts     병종 스탯 등급표 (방패/창/궁/기)
  sim/
    rng.ts       시드 PRNG(mulberry32) — 결정성
    types.ts     Battle/Unit/Cohort/General/Flag
    battle.ts    createBattle(스냅샷) + step(고정 틱) + 헬퍼
  snapshot.ts    v0 하드코딩 교전 스냅샷(1:1, 방패1000/창600/궁400/기200+장수)
  headless.ts    콘솔 검증 진입점
```

## 실행 (헤드리스)
```bash
cd game
npm install
npm run sim        # 스냅샷 로드 → 틱 → 결정성 확인
npm run typecheck
```

## 단계 (doc/05 5.6.6)
- [x] **A** sim 코어 뼈대: 데이터 모델·고정 틱·스냅샷 로드(헤드리스 검증)
- [x] **B** 이동/배치 명령 + 이동(모임→펼침)·회전 + 명령반경 gating + 기병 가속/선회
- [x] **C** 전선 접촉 + 접전 폭(전면 선분 투영) + 근접 피해(공속·공/방) + 치명율 전사/부상 분배 + 병력 수축
- [ ] **D** 궁병 사격 + 사기 + 종료(사기0)·도주·정도
- [ ] **E** 장수(근접·명령반경) + 기병(가속·돌파·선회)
- [ ] **F** 언덕 보정 + 지형 템플릿 3종
- [ ] 렌더(PixiJS) 붙이기 — spike-0 표현을 이 sim 상태에 연결
