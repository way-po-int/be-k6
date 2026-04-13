#!/usr/bin/env bash
#
# k6 결과 자동 비교 스크립트
#
# 사용법:
#   chmod +x k6/compare.sh
#   ./k6/compare.sh                                          # 기본값
#   ./k6/compare.sh k6/results/before.json k6/results/after.json 60

set -euo pipefail

BEFORE="${1:-k6/results/before.json}"
AFTER="${2:-k6/results/after.json}"
DURATION="${3:-60}"  # 테스트 실행 시간(초) — RPS 계산에 사용

# ── 파일 존재 확인 ──────────────────────────────────────────────────────────
for f in "$BEFORE" "$AFTER"; do
  if [[ ! -f "$f" ]]; then
    echo "❌  파일 없음: $f"
    echo ""
    echo "  사용법: $0 [before.json] [after.json] [duration_sec]"
    echo "  예시  : $0 k6/results/before.json k6/results/after.json 60"
    exit 1
  fi
done

# ── jq 존재 확인 ────────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "❌  jq 가 설치되어 있지 않습니다."
  echo "  brew install jq"
  exit 1
fi

# ── 유틸 함수 ───────────────────────────────────────────────────────────────

# p95 계산 (NDJSON 대응 — objects 필터로 비-JSON 라인 무시)
p95() {
  local file=$1 metric=${2:-http_req_duration} ep=${3:-}
  if [[ -n "$ep" ]]; then
    jq -s --arg m "$metric" --arg e "$ep" \
      '[.[] | objects | select(.type=="Point" and .metric==$m and .data.tags.endpoint==$e) | .data.value]
       | sort | if length > 0 then .[(length * 0.95 | floor)] | (. * 10 | round) / 10 else 0 end' \
      "$file"
  else
    jq -s --arg m "$metric" \
      '[.[] | objects | select(.type=="Point" and .metric==$m) | .data.value]
       | sort | if length > 0 then .[(length * 0.95 | floor)] | (. * 10 | round) / 10 else 0 end' \
      "$file"
  fi
}

# 에러율 (0.00 ~ 100.00 %)
error_rate() {
  jq -s '[.[] | objects | select(.type=="Point" and .metric=="http_req_failed") | .data.value]
         | if length > 0 then (add / length * 100 | (. * 100 | round) / 100) else 0 end' "$1"
}

# 총 요청 수
total_reqs() {
  jq -s '[.[] | objects | select(.type=="Point" and .metric=="http_reqs")] | length' "$1"
}

# RPS = 총 요청 수 / 테스트 시간
calc_rps() {
  local count=$1
  awk "BEGIN { printf \"%.2f\", $count / $DURATION }"
}

# 개선율 (낮을수록 좋은 지표: before > after 면 양수 = 개선)
pct_improve() {
  local b=$1 a=$2
  awk "BEGIN {
    if ($b == 0) { print \"N/A\" }
    else { v = ($b - $a) / $b * 100; printf \"%.1f\", v }
  }"
}

# RPS 개선율 (높을수록 좋은 지표)
pct_rps_improve() {
  local b=$1 a=$2
  awk "BEGIN {
    if ($b == 0) { print \"N/A\" }
    else { v = ($a - $b) / $b * 100; printf \"%.1f\", v }
  }"
}

# 테이블 행 출력 — 응답시간 (ms)
row_ms() {
  local label=$1 b=$2 a=$3
  local imp; imp=$(pct_improve "$b" "$a")
  local arrow="▼"
  if [[ "$imp" != "N/A" ]]; then
    cmp=$(awk "BEGIN { print ($imp < 0) ? 1 : 0 }")
    [[ "$cmp" == "1" ]] && arrow="▲"
    imp="${imp//-/}"  # 절댓값
  fi
  printf "  %-44s %9s ms  %9s ms  %s %s%%\n" "$label" "$b" "$a" "$arrow" "$imp"
}

# 테이블 행 출력 — RPS
row_rps() {
  local label=$1 b=$2 a=$3
  local imp; imp=$(pct_rps_improve "$b" "$a")
  printf "  %-44s %9s/s   %9s/s   ▲ %s%%\n" "$label" "$b" "$a" "$imp"
}

# 테이블 행 출력 — 에러율 (%)
row_err() {
  local label=$1 b=$2 a=$3
  printf "  %-44s %10s%%  %10s%%\n" "$label" "$b" "$a"
}

# ── 메트릭 수집 ─────────────────────────────────────────────────────────────

printf "\n  📊  수집 중 (before)..."
B_P95_ALL=$(p95 "$BEFORE")
B_P95_PLACES=$(p95 "$BEFORE" "http_req_duration" "collection_places_list")
B_P95_DETAIL=$(p95 "$BEFORE" "http_req_duration" "collection_place_detail")
B_P95_PP=$(p95 "$BEFORE" "http_req_duration" "pick_pass")
B_P95_BLOCKS=$(p95 "$BEFORE" "http_req_duration" "plan_blocks_list")
B_ERR=$(error_rate "$BEFORE")
B_REQS=$(total_reqs "$BEFORE")
B_RPS=$(calc_rps "$B_REQS")
printf " done\n"

printf "  📊  수집 중 (after)..."
A_P95_ALL=$(p95 "$AFTER")
A_P95_PLACES=$(p95 "$AFTER" "http_req_duration" "collection_places_list")
A_P95_DETAIL=$(p95 "$AFTER" "http_req_duration" "collection_place_detail")
A_P95_PP=$(p95 "$AFTER" "http_req_duration" "pick_pass")
A_P95_BLOCKS=$(p95 "$AFTER" "http_req_duration" "plan_blocks_list")
A_ERR=$(error_rate "$AFTER")
A_REQS=$(total_reqs "$AFTER")
A_RPS=$(calc_rps "$A_REQS")
printf " done\n\n"

# ── 리포트 출력 ─────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════════════"
echo "   k6 성능 비교 리포트                          Before → After"
echo "═══════════════════════════════════════════════════════════════════════"
printf "  %-44s %12s  %12s  %s\n" "" "Before" "After" "개선율"
echo "───────────────────────────────────────────────────────────────────────"
echo ""
echo "  ■ 응답시간 p95"
row_ms "  전체"                                        "$B_P95_ALL"    "$A_P95_ALL"
row_ms "  collection/places 목록  (N+1 핵심)"          "$B_P95_PLACES" "$A_P95_PLACES"
row_ms "  collection/place 상세"                       "$B_P95_DETAIL" "$A_P95_DETAIL"
row_ms "  Pick/Pass 토글  (preferenceRepository 개선)" "$B_P95_PP"     "$A_P95_PP"
row_ms "  plan/blocks 목록  (JOIN FETCH)"              "$B_P95_BLOCKS" "$A_P95_BLOCKS"
echo ""
echo "  ■ 처리량 / 에러"
row_rps "  RPS (총 요청 / ${DURATION}s)"               "$B_RPS"        "$A_RPS"
row_err "  에러율"                                     "$B_ERR"        "$A_ERR"
echo ""
echo "───────────────────────────────────────────────────────────────────────"
printf "  %-44s %12s  %12s\n" "  총 요청 수" "${B_REQS} req" "${A_REQS} req"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  ▼ = 감소 (응답시간·에러율 개선)   ▲ = 증가 (RPS 개선 / 응답시간 악화)"
echo ""

 
# ── Markdown 리포트 생성 ─────────────────────────────────────────────────────
 
REPORT_DIR="k6/report"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date "+%Y-%m-%d_%H-%M-%S")
REPORT_FILE="${REPORT_DIR}/${TIMESTAMP}.md"
 
# 개선율 화살표 (응답시간용 — 낮을수록 좋음)
md_imp_ms() {
  local b=$1 a=$2
  local imp; imp=$(pct_improve "$b" "$a")
  if [[ "$imp" == "N/A" ]]; then echo "-"; return; fi
  local neg; neg=$(awk "BEGIN { print ($imp < 0) ? 1 : 0 }")
  if [[ "$neg" == "1" ]]; then echo "▲ ${imp//-/}%"; else echo "▼ ${imp}%"; fi
}
 
# 개선율 화살표 (RPS용 — 높을수록 좋음)
md_imp_rps() {
  local b=$1 a=$2
  local imp; imp=$(pct_rps_improve "$b" "$a")
  if [[ "$imp" == "N/A" ]]; then echo "-"; return; fi
  local neg; neg=$(awk "BEGIN { print ($imp < 0) ? 1 : 0 }")
  if [[ "$neg" == "1" ]]; then echo "▼ ${imp//-/}%"; else echo "▲ ${imp}%"; fi
}
 
IMP_ALL=$(md_imp_ms    "$B_P95_ALL"    "$A_P95_ALL")
IMP_PLACES=$(md_imp_ms "$B_P95_PLACES" "$A_P95_PLACES")
IMP_DETAIL=$(md_imp_ms "$B_P95_DETAIL" "$A_P95_DETAIL")
IMP_PP=$(md_imp_ms     "$B_P95_PP"     "$A_P95_PP")
IMP_BLOCKS=$(md_imp_ms "$B_P95_BLOCKS" "$A_P95_BLOCKS")
IMP_RPS=$(md_imp_rps   "$B_RPS"        "$A_RPS")
 
cat > "$REPORT_FILE" <<EOF
# k6 성능 비교 리포트
 
**생성일시**: $(date "+%Y-%m-%d %H:%M:%S")  
**Before**: \`${BEFORE}\`  
**After**: \`${AFTER}\`  
**테스트 시간**: ${DURATION}s
 
## 응답시간 p95
 
| 항목 | Before | After | 개선율 |
|------|-------:|------:|:------:|
| 전체 | ${B_P95_ALL} ms | ${A_P95_ALL} ms | ${IMP_ALL} |
| collection/places 목록 (N+1 핵심) | ${B_P95_PLACES} ms | ${A_P95_PLACES} ms | ${IMP_PLACES} |
| collection/place 상세 | ${B_P95_DETAIL} ms | ${A_P95_DETAIL} ms | ${IMP_DETAIL} |
| Pick/Pass 토글 (preferenceRepository 개선) | ${B_P95_PP} ms | ${A_P95_PP} ms | ${IMP_PP} |
| plan/blocks 목록 (JOIN FETCH) | ${B_P95_BLOCKS} ms | ${A_P95_BLOCKS} ms | ${IMP_BLOCKS} |
 
## 처리량 / 에러
 
| 항목 | Before | After | 개선율 |
|------|-------:|------:|:------:|
| RPS (총 요청 / ${DURATION}s) | ${B_RPS}/s | ${A_RPS}/s | ${IMP_RPS} |
| 에러율 | ${B_ERR}% | ${A_ERR}% | - |
 
## 요약
 
| | Before | After |
|---|-------:|------:|
| 총 요청 수 | ${B_REQS} req | ${A_REQS} req |
 
---
> ▼ 감소 = 응답시간·에러율 개선 &nbsp;&nbsp; ▲ 증가 = RPS 개선 / 응답시간 악화
EOF
 
echo "  📄  리포트 저장: $REPORT_FILE"
echo ""
 

