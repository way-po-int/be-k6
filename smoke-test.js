/**
 * Smoke Test — 동작 확인용
 *
 * 목적: 부하 테스트 전 API가 정상 동작하는지 최소 부하로 검증
 * 조건: vus=2, duration=30s
 * 통과 기준: 에러율 0% (모든 요청 성공)
 *
 * 실행:
 *   k6 run \
 *     -e TOKEN=<jwt> \
 *     -e COLLECTION_ID=<id> \
 *     -e PLAN_ID=<id> \
 *     k6/smoke-test.js
 */

import { sleep } from 'k6';
import { getCollections, getCollectionPlaces, getCollectionPlaceDetail } from './scenarios/collection-places.js';
import { getPlans, getPlanBlocks } from './scenarios/plan-blocks.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate==0'],            // 에러 0% 강제
    http_req_duration: ['p(95)<1000'],       // 응답 1초 이내
  },
};

export default function () {
  getCollections();
  getCollectionPlaces();
  getCollectionPlaceDetail();
  getPlans();
  getPlanBlocks(1);

  sleep(1);
}
