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
  scenario.ts    컷신/테스트 스크립트: 타임라인 + 병종·장수·지형 제어 op + 빌더
  director.ts    시나리오 러너(배틀 생성·틱·타임라인 발동) — 렌더가 재사용
  scenarios.ts   시나리오 라이브러리(advance/charge/duel/hill/defile)
  headless.ts    시나리오 재생 진입점
```

**시나리오/Director = 렌더와 공유하는 재생 구조.** 렌더는 `new Director(scn)` → 매 프레임 `d.step(dt)` → `render(d.battle)`. 액티브 포즈 = `d.paused=true`.

## 실행 (헤드리스)
```bash
cd game
npm install
npm run sim              # 기본 시나리오(advance = 컷신 진격→격돌)
npm run sim charge       # 특정 시나리오 재생
npm run sim duel|hill|defile
npm run typecheck
```

## 단계 (doc/05 5.6.6)
- [x] **A** sim 코어 뼈대: 데이터 모델·고정 틱·스냅샷 로드(헤드리스 검증)
- [x] **B** 이동/배치 명령 + 이동(모임→펼침)·회전 + 명령반경 gating + 기병 가속/선회
- [x] **C** 전선 접촉 + 접전 폭(전면 선분 투영) + 근접 피해(공속·공/방) + 치명율 전사/부상 분배 + 병력 수축
- [x] **D** 궁병 사격(정지·사거리·근접 시 불가) + 사기(접전 하락) + 종료(사기0)·도주(10s)·승리 정도
- [x] **E** 기병 charge(+저지 카운터) + 장수(일기토·HP0→휴식·리젠·재출진·근접 사기 buff·생사 판정)
- [x] **F** 고지→저지 공격 +20%·궁 사거리 +30% + 애로 병목(접전 폭 제한) + 지형 템플릿 3종
- [x] **렌더(PixiJS) 붙이기** — sim 상태를 스프라이트로. `npm run dev` / 라이브 배포.

## 실행 (렌더 — 화면)
```bash
npm run dev              # http://localhost:5173  (폰: http://<맥IP>:5173)
```
- 시나리오 선택: `?s=advance|charge|duel|hill|defile` (기본 advance)
- **space**=일시정지(액티브 포즈) · 드래그=이동 · 휠/핀치=줌
- `src/render/`(blobView·camera) + `src/web/main.ts`(Pixi 부트스트랩 + Director 재생).
- **라이브: https://goalgle.github.io/santoku/** (main에 `game/**` 푸시 시 자동 배포)
