/**
 * Load Test — Before / After 성능 비교 핵심
 *
 * 목적: N+1 해소 및 JOIN FETCH 최적화 효과를 정량 측정
 * 조건: vus=30, duration=60s (일반적인 서비스 평균 부하 모사)
 * SLO:  p95 < 300ms / p99 < 1s / 에러율 < 1%
 *
 * 실행:
 *   # Before (최적화 전 브랜치에서 실행 후 결과 저장)
 *   k6 run \
 *     -e TOKEN=<jwt> \
 *     -e COLLECTION_ID=<id> \
 *     -e PLACE_ID=<id> \
 *     -e PLAN_ID=<id> \
 *     --out json=k6/results/before.json \
 *     k6/load-test.js
 *
 *   # After (최적화 후 브랜치에서 동일 조건 재실행)
 *   k6 run \
 *     -e TOKEN=<jwt> \
 *     -e COLLECTION_ID=<id> \
 *     -e PLACE_ID=<id> \
 *     -e PLAN_ID=<id> \
 *     --out json=k6/results/after.json \
 *     k6/load-test.js
 */

import { sleep } from "k6";
import {
  getCollections,
  getCollectionPlaces,
  getCollectionPlaceDetail,
  pickOrPass,
} from "./scenarios/collection-places.js";
import { getPlans, getPlanBlocks } from "./scenarios/plan-blocks.js";

export const options = {
  vus: 30,
  duration: "60s",

  thresholds: {
    // ── 전체 SLO ──────────────────────────────────────────
    http_req_duration: ["p(95)<300", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],

    // ── 엔드포인트별 SLO (tag 기반) ──────────────────────
    // N+1 핵심 — 장소 목록 (배치 Pick/Pass 조회)
    "http_req_duration{endpoint:collection_places_list}": ["p(95)<200"],
    // 장소 상세
    "http_req_duration{endpoint:collection_place_detail}": ["p(95)<200"],
    // 플랜 블록 (JOIN FETCH)
    "http_req_duration{endpoint:plan_blocks_list}": ["p(95)<250"],

    // Pick/Pass 토글 — preferenceRepository findAllByPlaceIdIn 개선 측정
    "http_req_duration{endpoint:pick_pass}": ["p(95)<200"],

    // ── 커스텀 메트릭 ─────────────────────────────────────
    collection_places_duration: ["p(95)<200"],
    plan_blocks_duration: ["p(95)<250"],
    pick_pass_duration: ["p(95)<200"],
    custom_errors: ["rate<0.01"],
  },
};

/**
 * 실제 사용자 행동 흐름 모사:
 *   1. 컬렉션 목록 열람
 *   2. 특정 컬렉션의 장소 목록 조회 (N+1 해소 핵심)
 *   3. 장소 상세 열람 (Pick/Pass 포함)
 *   4. Pick/Pass 토글 (findAllByPlaceIdIn JOIN FETCH 개선 측정)
 *   5. 플랜 목록 → 블록 목록 조회
 */
export default function () {
  // 컬렉션 탐색 흐름
  getCollections();
  getCollectionPlaces(); // ← N+1 해소 측정 포인트
  getCollectionPlaceDetail(); // ← Pick/Pass 단건 측정
  pickOrPass(); // ← preferenceRepository 개선 측정 포인트

  // 플랜 탐색 흐름
  getPlans();
  getPlanBlocks(1); // ← JOIN FETCH 측정 포인트

  sleep(0.5);
}
