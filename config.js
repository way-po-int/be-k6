/**
 * k6 공통 설정
 *
 * 환경 변수로 주입:
 *   BASE_URL      서버 주소 (기본: http://localhost:8080)
 *   TOKEN         JWT Access Token
 *   COLLECTION_ID 테스트 대상 컬렉션 ID
 *   PLACE_ID      테스트 대상 장소 ID
 *   PLAN_ID       테스트 대상 플랜 ID
 */

export const BASE_URL = __ENV.BASE_URL || "BASE_URL";
export const TOKEN =
    __ENV.TOKEN || "TOKEN";
export const COLLECTION_ID = __ENV.COLLECTION_ID || "COLLECTION_ID";
export const COLLECTION_PLACE_ID = __ENV.COLLECTION_PLACE_ID || "COLLECTION_PLACE_ID";
export const PLAN_ID = __ENV.PLAN_ID || "PLAN_ID";

export const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
};

/**
 * SLO (Service Level Objective) 기준값
 * - 업계 일반: p95 < 300ms, p99 < 1s, 에러율 < 1%
 */
export const SLO = {
    P95_MS: 300,
    P99_MS: 1000,
    ERROR_RATE_PCT: 1,
};

/**
 * 표준 threshold 설정 — options.thresholds에 전개하여 사용
 */
export const BASE_THRESHOLDS = {
    http_req_duration: [`p(95)<${SLO.P95_MS}`, `p(99)<${SLO.P99_MS}`],
    http_req_failed: [`rate<0.${String(SLO.ERROR_RATE_PCT).padStart(2, "0")}`],
};
