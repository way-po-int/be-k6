/**
 * Stress Test — 최대 부하 탐색 / 한계점 확인
 *
 * 목적: 최적화 후 서버가 어느 부하까지 SLO를 유지할 수 있는지 탐색
 *       Before/After 모두 실행하여 "한계 VU 수" 비교
 * 조건: 단계적 VU 증가 (10 → 30 → 50 → 70) 후 감소
 * SLO:  p95 < 500ms (load-test보다 완화), 에러율 < 5%
 *
 * 실행:
 *   k6 run \
 *     -e TOKEN=<jwt> \
 *     -e COLLECTION_ID=<id> \
 *     -e PLACE_ID=<id> \
 *     -e PLAN_ID=<id> \
 *     k6/stress-test.js
 */

import { sleep } from 'k6';
import { getCollectionPlaces, getCollectionPlaceDetail } from './scenarios/collection-places.js';
import { getPlanBlocks } from './scenarios/plan-blocks.js';

export const options = {
  /**
   * 단계별 VU 증가
   *
   * ┌──────────────────────────────────────────────────────┐
   * │  단계   │ 목표 VU │ 지속 시간 │ 의도                   │
   * ├─────────┼─────────┼──────────┼───────────────────────┤
   * │ warm-up │   10    │   30s    │ 예열 (캐시, JIT 등)    │
   * │ normal  │   30    │   1m     │ 평상시 부하             │
   * │ high    │   50    │   1m     │ 피크 부하               │
   * │ peak    │   70    │   30s    │ 한계 도달 시도          │
   * │ high    │   50    │   30s    │ 부하 감소               │
   * │ cool    │    0    │   30s    │ 냉각 (복구 확인)        │
   * └──────────────────────────────────────────────────────┘
   */
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 30 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 70 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 0  },
  ],

  thresholds: {
    // 스트레스 테스트는 SLO를 완화하여 한계점만 탐색
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:collection_places_list}': ['p(95)<400'],
    'http_req_duration{endpoint:plan_blocks_list}': ['p(95)<400'],
    custom_errors: ['rate<0.05'],
  },
};

/**
 * 가장 DB 부하가 큰 엔드포인트에 집중하여 한계 측정
 */
export default function () {
  getCollectionPlaces();      // N+1 최적화 엔드포인트
  getCollectionPlaceDetail();
  getPlanBlocks(1);

  sleep(0.3);
}
