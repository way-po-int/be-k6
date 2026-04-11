/**
 * Plan Blocks 시나리오
 *
 * - GET /plans/{planId}              : 플랜 단건
 * - GET /plans/{planId}/blocks?day=N : 블록 목록 (JOIN FETCH 최적화)
 * - GET /plans/{planId}/blocks/{id}  : 블록 상세
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, PLAN_ID, DEFAULT_HEADERS } from '../config.js';
import { checkResponse, warnIfSlow, planBlocksTrend } from '../utils/helpers.js';

/**
 * 플랜 단건 조회
 */
export function getPlan() {
  const res = http.get(
    `${BASE_URL}/plans/${PLAN_ID}`,
    {
      headers: DEFAULT_HEADERS,
      tags: { endpoint: 'plan_detail' },
    }
  );

  checkResponse(res, 200, 'GET plan');
  warnIfSlow(res, 200, 'GET plan');

  sleep(0.3);
}

/**
 * 플랜 목록 조회
 */
export function getPlans() {
  const res = http.get(
    `${BASE_URL}/plans?size=10`,
    {
      headers: DEFAULT_HEADERS,
      tags: { endpoint: 'plans_list' },
    }
  );

  checkResponse(res, 200, 'GET plans');
  warnIfSlow(res, 300, 'GET plans');

  sleep(0.5);
}

/**
 * 플랜 블록 목록 조회 — JOIN FETCH 최적화 대상
 * TimeBlock → PlanDay → Plan 계층 조회 시 N+1 방지를 검증
 * @param {number} day 조회할 일자 (1부터 시작)
 */
export function getPlanBlocks(day = 1) {
  const res = http.get(
    `${BASE_URL}/plans/${PLAN_ID}/blocks?day=${day}&size=20`,
    {
      headers: DEFAULT_HEADERS,
      tags: { endpoint: 'plan_blocks_list' },
    }
  );

  checkResponse(res, 200, `GET plan/blocks day=${day}`);
  warnIfSlow(res, 300, `GET plan/blocks day=${day}`);
  planBlocksTrend.add(res.timings.duration);

  sleep(0.5);
}
