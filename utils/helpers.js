import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

/**
 * 커스텀 메트릭 — Prometheus로 내보내거나 요약 리포트에서 확인 가능
 */
export const customErrorRate = new Rate("custom_errors");
export const collectionPlacesTrend = new Trend(
  "collection_places_duration",
  true,
);
export const planBlocksTrend = new Trend("plan_blocks_duration", true);
export const pickPassTrend = new Trend("pick_pass_duration", true);

/**
 * HTTP 응답 공통 검증
 * @param {object} res        k6 Response 객체
 * @param {number} status     기대 HTTP 상태코드 (기본 200)
 * @param {string} label      로그 식별용 레이블
 * @returns {boolean}         성공 여부
 */
export function checkResponse(res, status = 200, label = "") {
  const ok = check(res, {
    [`[${label}] status ${status}`]: (r) => r.status === status,
    [`[${label}] no timeout`]: (r) => r.timings.duration < 5000,
  });

  if (!ok) {
    customErrorRate.add(1);
    console.error(
      `FAIL [${label}] status=${res.status} duration=${res.timings.duration.toFixed(0)}ms url=${res.url}`,
    );
  } else {
    customErrorRate.add(0);
  }

  return ok;
}

/**
 * 응답 시간이 임계값을 초과하면 경고 로그 출력
 * @param {object} res
 * @param {number} thresholdMs 기본 300ms
 * @param {string} label
 */
export function warnIfSlow(res, thresholdMs = 300, label = "") {
  if (res.timings.duration > thresholdMs) {
    console.warn(
      `SLOW [${label}] ${res.timings.duration.toFixed(0)}ms > ${thresholdMs}ms  url=${res.url}`,
    );
  }
}

/**
 * 응답 Body를 JSON으로 파싱. 실패하면 null 반환
 * @param {object} res
 * @returns {object|null}
 */
export function parseJson(res) {
  try {
    return JSON.parse(res.body);
  } catch (_) {
    return null;
  }
}
