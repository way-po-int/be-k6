# k6 성능 테스트 시스템

> **Waypoint Backend** API 성능 개선(N+1 해소, JOIN FETCH) 효과를 측정하는 k6 부하 테스트 모음

---

## 디렉토리 구조

```
k6/
├── config.js                    # 공통 설정 (BASE_URL, TOKEN, SLO 기준값)
├── utils/
│   └── helpers.js               # checkResponse, warnIfSlow, 커스텀 메트릭
├── scenarios/
│   ├── collection-places.js     # N+1 핵심 — 장소 목록 / 상세 / Pick-Pass
│   └── plan-blocks.js           # JOIN FETCH — 플랜 블록 목록
├── smoke-test.js                # 동작 확인 (vus=2, 30s)
├── load-test.js                 # Before/After 비교 핵심 (vus=30, 60s)
└── stress-test.js               # 한계 부하 탐색 (ramp-up)
```

---

## scenarios/ 구조 및 규칙

### 역할 분리

| 위치                         | 역할                | `export default` | `k6 run` 직접 실행 |
| ---------------------------- | ------------------- | ---------------- | ------------------ |
| `scenarios/*.js`             | API 함수 라이브러리 | ❌               | ❌                 |
| `smoke-test.js` 등 루트 파일 | 테스트 진입점       | ✅               | ✅                 |

`scenarios/` 파일은 **단독으로 실행할 수 없다.** 루트 테스트 파일에서 import해서 사용한다.

### scenarios/ 파일 작성 규칙

- **파일명**: 도메인 단위로 kebab-case (`collection-places.js`, `plan-blocks.js`)
- **함수**: API 엔드포인트 1개당 named export 함수 1개
- **함수 내부 순서**: `http.*` → `checkResponse` → `warnIfSlow` → `Trend.add()` (해당 시) → `sleep()`
- **tags**: `{ endpoint: 'snake_case명' }` 필수 — 루트 파일의 threshold 필터링에 사용됨
- `export default` 및 `export const options` **작성 금지**

```js
// scenarios/my-domain.js 작성 예시
import http from "k6/http";
import { sleep } from "k6";
import { BASE_URL, DEFAULT_HEADERS } from "../config.js";
import { checkResponse, warnIfSlow } from "../utils/helpers.js";

export function getMyResource() {
  const res = http.get(`${BASE_URL}/my-resource`, {
    headers: DEFAULT_HEADERS,
    tags: { endpoint: "my_resource" },
  });

  checkResponse(res, 200, "GET my-resource");
  warnIfSlow(res, 300, "GET my-resource");

  sleep(0.5);
}
```

### 새 시나리오 추가 절차

1. `scenarios/새도메인.js` 생성 — 위 규칙에 맞게 함수 작성
2. 커스텀 Trend가 필요하면 `utils/helpers.js`에 추가
3. 루트 테스트 파일(`load-test.js` 등)에서 import 후 `export default function` 흐름에 편입
4. 루트 파일 `thresholds`에 `endpoint` 태그 기반 SLO 추가

```js
// load-test.js 편입 예시
import { getMyResource } from "./scenarios/my-domain.js";

export const options = {
  thresholds: {
    "http_req_duration{endpoint:my_resource}": ["p(95)<200"],
  },
};

export default function () {
  getMyResource();
}
```

---

## 사전 준비

### k6 설치

```bash
# macOS
brew install k6
```

### 환경변수 설정 (.env.k6)

`k6/.env.k6` 파일에 실제 값을 채운다. (`.gitignore`에 등록되어 있어 커밋되지 않음)

```bash
# k6/.env.k6
BASE_URL=http://localhost:8080
TOKEN=<로그인 후 발급받은 JWT Access Token>
COLLECTION_ID=<external_id>
COLLECTION_PLACE_ID=<external_id>
PLAN_ID=<external_id>
```

값을 채운 뒤 셸에 export:

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
```

> **팁**: 터미널 세션마다 한 번만 실행하면 된다.

### 테스트 데이터 확보

k6를 실행하기 전에 실제 DB에 존재하는 ID를 확인해야 한다.

```bash
# DB에서 테스트용 ID 조회 예시
SELECT external_id FROM collections LIMIT 1;
SELECT external_id FROM collection_places WHERE collection_id = <pk> LIMIT 1;
SELECT external_id FROM plans LIMIT 1;
```

### 결과 저장 폴더 생성

```bash
mkdir -p k6/results
```

---

## 테스트 실행

### 공통 환경 변수

| 변수명                | 필수 | 설명                                      |
| --------------------- | ---- | ----------------------------------------- |
| `TOKEN`               | ✅   | JWT Access Token                          |
| `COLLECTION_ID`       | ✅   | 테스트 대상 컬렉션 external_id            |
| `COLLECTION_PLACE_ID` | ✅   | 테스트 대상 장소 external_id              |
| `PLAN_ID`             | ✅   | 테스트 대상 플랜 external_id              |
| `BASE_URL`            | -    | 서버 주소 (기본: `http://localhost:8080`) |

모든 테스트 실행 전 환경변수 로드:

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
```

---

### 1. Smoke Test — 동작 확인

부하 테스트 전 API가 정상 동작하는지 검증한다. **에러가 1건이라도 있으면 실패.**

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
k6 run k6/smoke-test.js
```

---

### 2. Load Test — Before / After 비교 ⭐

**성능 개선 효과 측정의 핵심.** 최적화 전·후 동일 조건으로 2회 실행하고 결과를 비교한다.

#### Before (최적화 전 상태에서 실행)

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
k6 run --out json=k6/results/before.json k6/load-test.js
```

#### After (최적화 후 상태에서 동일 조건 재실행)

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
k6 run --out json=k6/results/after.json k6/load-test.js
```

---

### 3. Stress Test — 한계 부하 탐색

최적화 후 서버가 어느 동시 사용자 수까지 SLO를 유지할 수 있는지 탐색한다.  
Before/After 모두 실행하여 **"한계 VU 수"** 를 비교하면 내구성 개선 효과를 확인할 수 있다.

```bash
export $(cat k6/.env.k6 | grep -v '^#' | xargs)
k6 run k6/stress-test.js
```

---

## 결과 읽는 법

k6 실행 후 출력되는 요약 리포트의 핵심 항목:

```
http_req_duration............: avg=45ms  p(90)=89ms  p(95)=112ms  p(99)=320ms
http_req_failed..............: 0.00%   ✓ 0        ✗ 0
http_reqs....................: 1842    30.7/s
```

| 항목                         | 의미                                       | SLO 기준      |
| ---------------------------- | ------------------------------------------ | ------------- |
| `p(95)`                      | 상위 5% 느린 요청의 임계점 — **핵심 지표** | < 300ms       |
| `p(99)`                      | 꼬리 지연(tail latency)                    | < 1s          |
| `http_req_failed`            | 에러율                                     | < 1%          |
| `http_reqs / duration`       | RPS (처리량)                               | 높을수록 좋음 |
| `collection_places_duration` | 장소 목록 전용 p95                         | < 200ms       |
| `plan_blocks_duration`       | 플랜 블록 전용 p95                         | < 250ms       |

---

## Before / After 비교표 작성

아래 표에 실측값을 기입한다.

| 지표                  | Before       | After        | 개선율  |
| --------------------- | ------------ | ------------ | ------- |
| 전체 p95 응답시간     | \_\_\_ ms    | \_\_\_ ms    | ▼ \_\_% |
| 전체 p99 응답시간     | \_\_\_ ms    | \_\_\_ ms    | ▼ \_\_% |
| collection_places p95 | \_\_\_ ms    | \_\_\_ ms    | ▼ \_\_% |
| plan_blocks p95       | \_\_\_ ms    | \_\_\_ ms    | ▼ \_\_% |
| RPS (처리량)          | \_\_\_ req/s | \_\_\_ req/s | ▲ \_\_% |
| 에러율                | \_\_\_%      | \_\_\_%      | -       |
| 스트레스 한계 VU      | \_\_\_       | \_\_\_       | ▲ \_\_% |

> **팁**: Grafana에서 테스트 시간대를 Before / After로 각각 고정한 뒤  
> `histogram_quantile(0.95, rate(http_server_requests_seconds_bucket[5m]))` 패널을 스크린샷으로 저장하면  
> k6 결과와 서버 측 메트릭을 교차 검증할 수 있다.

---

## 결과 자동 비교

`compare.sh`를 실행하면 Before / After JSON을 읽어 엔드포인트별 p95, RPS, 에러율을 한 번에 비교한다.

```bash
# 기본 실행 (k6/results/before.json vs after.json, duration=60s)
./k6/compare.sh

# 파일 경로 / duration 직접 지정
./k6/compare.sh k6/results/before.json k6/results/after.json 60
```

출력 예시:

```
═══════════════════════════════════════════════════════════════════════
   k6 성능 비교 리포트                          Before → After
═══════════════════════════════════════════════════════════════════════
                                                 Before         After  개선율
───────────────────────────────────────────────────────────────────────

  ■ 응답시간 p95
  전체                                          450 ms        133 ms  ▼ 70.4%
  collection/places 목록  (N+1 핵심)            980 ms        475 ms  ▼ 51.5%
  collection/place 상세                         200 ms         67 ms  ▼ 66.5%
  Pick/Pass 토글  (preferenceRepository 개선)   310 ms        153 ms  ▼ 50.6%
  plan/blocks 목록  (JOIN FETCH)                250 ms        116 ms  ▼ 53.6%

  ■ 처리량 / 에러
  RPS (총 요청 / 60s)                         32.00/s       54.38/s  ▲ 69.9%
  에러율                                         0.00%        10.96%
═══════════════════════════════════════════════════════════════════════
```

> **주의**: k6 `--out json` 출력은 NDJSON 포맷이므로 일반 `jq .[]` 명령은 동작하지 않는다.  
> `compare.sh`는 `objects` 필터로 비-JSON 라인을 자동 처리한다.
