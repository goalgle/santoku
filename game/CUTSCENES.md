# 컷신/시나리오 스크립트 작성법

전투를 **타임라인**으로 연출·테스트하는 방법. 병종·장수·지형을 "언제·무엇" 으로 제어한다.
(구조: `scenario.ts` 정의 · `director.ts` 재생 · `scenarios.ts` 라이브러리)

## 개념
- **Scenario** = `스냅샷(초기 편성)` + `타임라인(시각별 op)` + `duration(선택)`.
- **Director** 가 스냅샷으로 배틀을 만들고, 매 틱 진행하며 타임라인을 발동한다.
- **렌더도 헤드리스도 같은 시나리오**를 쓴다.

## 한 개 만들기
```ts
// src/scenarios.ts 의 SCENARIOS 에 추가
import { scene, place, forceTo, setMight, placeGeneral, setTerrain, say } from './scenario'

const RIGHT = 0, LEFT = Math.PI // 전면 방향(좌우 대립)

myScene: scene('내 컷신', V0_SNAPSHOT)
  .at(0,   place('A', 0, -300, 0, RIGHT), place('B', 0, 300, 0, LEFT), say('대치'))
  .at(1.5, forceTo('A', 0, -40, 0), forceTo('B', 0, 40, 0), say('진격'))
  .duration(14)
  .build(),
```
- `.at(초, ...ops)` — 그 시각에 op들을 발동. 여러 번 쌓을 수 있다.
- `.duration(초)` — 이 시간에 자동 종료(생략 시 전투 끝날 때까지).
- `.build()` — 완성.

## 실행
```bash
npm run dev            # 화면: http://localhost:5173/?s=myScene
npm run sim myScene    # 콘솔(헤드리스)
```

## 좌표·인덱스 규칙
- **좌우 대립**: `'A'`(파랑, **왼쪽**) / `'B'`(빨강, **오른쪽**)
- **병종 인덱스**: `0`=방패 · `1`=창 · `2`=궁 · `3`=기병 (스냅샷 편성 순)
- **좌표**: 월드 px, 원점=중앙, **+x 오른쪽 · +y 아래**
- **facing**: 라디안, 전면이 향하는 방향. `RIGHT=0`(오른쪽) · `LEFT=π`(왼쪽).
  A는 오른쪽(RIGHT)으로, B는 왼쪽(LEFT)으로 마주본다. (방향은 스냅샷·시나리오 좌표만 바꾸면 됨 — sim 코드 무관.)

## op 목록 (`scenario.ts`)
| op | 효과 |
|----|------|
| `place(side, idx, x, y, facing)` | 병종을 즉시 배치(순간이동) |
| `order(side, idx, x, y)` | 이동 **명령**(명령반경 gating 적용 — 현실적) |
| `forceTo(side, idx, x, y)` | 목표 강제 지정(반경 무시 — 컷신용) |
| `setMight(side, v)` | 장수 무력 설정 |
| `placeGeneral(side, x, y)` | 장수 위치 |
| `placeFlag(side, x, y)` | 부대군기 위치(명령반경 중심) |
| `setTerrain(terrain)` | 지형 교체 (`TERRAINS.plain|hills|defile` 또는 커스텀 `Terrain`) |
| `say(msg)` | 콘솔 로그(진행 표시) |

## 자동 연출 (op 불필요)
- **일기토 결투장**: 양측 장수가 출진·근접하면, 병사들이 물러나 **원을 만들어 둘러싼다**. 접전이 지속될수록 원이 커진다. (렌더가 sim 상태를 보고 자동 처리 — `web/main.ts`)

## 팁
- **병사가 안 싸우게** 하려면 접촉거리(≈140px) 밖으로 배치. 관객·행진 연출에 유용.
- **결정성**: 시나리오는 스냅샷 시드로 재현 가능. op는 sim 상태만 바꾸고, 렌더 연출(결투장·bob)은 sim에 영향 없음.
- 예시는 `src/scenarios.ts` (advance/charge/duel/hill/defile) 참고.
