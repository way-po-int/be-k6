/**
 * Collection Places 시나리오
 *
 * N+1 해소 효과를 직접 측정하는 핵심 시나리오.
 * - GET /collections/{id}/places      : 장소 목록 (getPickPassBatch 배치 조회)
 * - GET /collections/{id}/places/{id} : 장소 상세 (Pick/Pass 포함)
 * - POST .../preference               : Pick/Pass 등록
 */

import http from "k6/http";
import {sleep} from "k6";
import {BASE_URL, COLLECTION_ID, COLLECTION_PLACE_ID, DEFAULT_HEADERS,} from "../config.js";
import {checkResponse, collectionPlacesTrend, pickPassTrend, warnIfSlow,} from "../utils/helpers.js";

/**
 * 장소 목록 조회 — N+1 최적화 핵심 엔드포인트
 * Before: 장소 N개당 N번의 Pick/Pass SELECT 쿼리 발생
 * After:  단일 IN 쿼리로 일괄 조회
 */
export function getCollectionPlaces() {
    const res = http.get(
        `${BASE_URL}/collections/${COLLECTION_ID}/places?size=20`,
        {
            headers: DEFAULT_HEADERS,
            tags: {endpoint: "collection_places_list"},
        },
    );

    checkResponse(res, 200, "GET collection/places");
    warnIfSlow(res, 300, "GET collection/places");
    collectionPlacesTrend.add(res.timings.duration);

    sleep(0.5);
}

/**
 * 장소 상세 조회 — Pick/Pass 단건 포함
 */
export function getCollectionPlaceDetail() {
    const res = http.get(
        `${BASE_URL}/collections/${COLLECTION_ID}/places/${COLLECTION_PLACE_ID}`,
        {
            headers: DEFAULT_HEADERS,
            tags: {endpoint: "collection_place_detail"},
        },
    );

    checkResponse(res, 200, "GET collection/place/detail");
    warnIfSlow(res, 300, "GET collection/place/detail");

    sleep(0.3);
}

/**
 * 컬렉션 단건 조회
 */
export function getCollection() {
    const res = http.get(`${BASE_URL}/collections/${COLLECTION_ID}`, {
        headers: DEFAULT_HEADERS,
        tags: {endpoint: "collection_detail"},
    });

    checkResponse(res, 200, "GET collection");
    warnIfSlow(res, 200, "GET collection");

    sleep(0.3);
}

/**
 * 컬렉션 목록 조회
 */
export function getCollections() {
    const res = http.get(`${BASE_URL}/collections?size=10`, {
        headers: DEFAULT_HEADERS,
        tags: {endpoint: "collections_list"},
    });

    checkResponse(res, 200, "GET collections");
    warnIfSlow(res, 300, "GET collections");

    sleep(0.5);
}

/**
 * Pick/Pass 토글 — preferenceRepository + findAllByPlaceIdIn 경유
 *
 * 개선 포인트:
 *   Before: findByPlaceIdAndMemberId 단건 조회 후 별도 allPreferences SELECT
 *   After:  findAllByPlaceIdIn JOIN FETCH 단일 쿼리
 *
 * @param {string} [type]  'PICK' | 'PASS' — 미지정 시 반복 횟수 기준 교대 토글
 */
export function pickOrPass(type) {
    const resolvedType = type || (__ITER % 2 === 0 ? "PICK" : "PASS");

    const res = http.post(
        `${BASE_URL}/collections/${COLLECTION_ID}/places/${COLLECTION_PLACE_ID}/preference?type=${resolvedType}`,
        null,
        {
            headers: DEFAULT_HEADERS,
            tags: {endpoint: "pick_pass", type: resolvedType},
        },
    );

    checkResponse(res, 200, `POST pick/pass(${resolvedType})`);
    warnIfSlow(res, 300, `POST pick/pass(${resolvedType})`);
    pickPassTrend.add(res.timings.duration);

    sleep(0.3);
}
