#!/usr/bin/env bash

# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

mode="${1:-}"
phase="${2:-}"
status="${3:-success}"

if [[ -z "${CI_TIMING_DIR:-}" ]]; then
  timing_dir="${GITHUB_WORKSPACE:-$PWD}/.ci-timings"
elif [[ "$CI_TIMING_DIR" = /* ]]; then
  timing_dir="$CI_TIMING_DIR"
else
  timing_dir="${GITHUB_WORKSPACE:-$PWD}/$CI_TIMING_DIR"
fi

summary_json="$timing_dir/summary.json"

field_value() {
  local value="$1"
  value="${value//$'\t'/ }"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  printf '%s' "$value"
}

now_ms() {
  local value
  value="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s' "$value"
  else
    printf '%s000' "$(date +%s)"
  fi
}

warn() {
  printf 'ci-timing: %s\n' "$*" >&2
}

ensure_directory() {
  if [[ -d "$timing_dir" ]]; then
    return 0
  fi

  if ! mkdir -p "$timing_dir"; then
    warn "unable to create timing directory: $timing_dir"
    return 1
  fi
}

start_phase() {
  local name start tmp
  name="$1"
  start="$(now_ms)"
  if ! ensure_directory; then
    return 0
  fi

  if ! command -v jq >/dev/null 2>&1 || [[ ! -f "$summary_json" ]]; then
    return 0
  fi

  tmp="${summary_json}.tmp"
  if ! jq \
    --arg phase "$(field_value "$name")" \
    --argjson start_ms "$start" \
    '.phases += [{phase: $phase, start_ms: $start_ms, end_ms: null, duration_ms: null, status: "running"}]' \
    "$summary_json" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    warn "unable to record start for phase: $name"
    return 0
  fi
  if ! mv "$tmp" "$summary_json"; then
    rm -f "$tmp"
    warn "unable to save start for phase: $name"
  fi
}

end_phase() {
  local name result start end duration tmp
  name="$1"
  result="$(field_value "${2:-success}")"

  if ! command -v jq >/dev/null 2>&1 || [[ ! -f "$summary_json" ]]; then
    return 0
  fi

  start="$(jq -r --arg phase "$(field_value "$name")" '
    [.phases[] | select(.phase == $phase and .end_ms == null) | .start_ms] | last // empty
  ' "$summary_json" 2>/dev/null || true)"
  if [[ ! "$start" =~ ^[0-9]+$ ]]; then
    warn "no start marker found for phase: $name"
    return 0
  fi

  end="$(now_ms)"
  duration=$((end - start))
  if (( duration < 0 )); then
    duration=0
  fi

  tmp="${summary_json}.tmp"
  if ! jq \
    --arg phase "$(field_value "$name")" \
    --argjson start_ms "$start" \
    --argjson end_ms "$end" \
    --argjson duration_ms "$duration" \
    --arg status "$result" \
    '.phases |= map(
      if .phase == $phase and .start_ms == $start_ms and .end_ms == null
      then . + {end_ms: $end_ms, duration_ms: $duration_ms, status: $status}
      else .
      end
    )' \
    "$summary_json" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    warn "unable to record end for phase: $name"
    return 0
  fi
  if ! mv "$tmp" "$summary_json"; then
    rm -f "$tmp"
    warn "unable to save end for phase: $name"
  fi
}

init() {
  local start tmp

  if ! ensure_directory; then
    return 0
  fi

  rm -f "$summary_json" "$summary_json.tmp"
  start="$(now_ms)"

  if command -v jq >/dev/null 2>&1; then
    tmp="${summary_json}.tmp"
    if jq -n \
      --arg workflow "${GITHUB_WORKFLOW:-}" \
      --arg job "${GITHUB_JOB:-}" \
      --arg run_id "${GITHUB_RUN_ID:-}" \
      --arg run_attempt "${GITHUB_RUN_ATTEMPT:-}" \
      --arg repository "${GITHUB_REPOSITORY:-}" \
      --arg sha "${GITHUB_SHA:-}" \
      --arg ref "${GITHUB_REF:-}" \
      --arg event_name "${GITHUB_EVENT_NAME:-}" \
      --arg runner_name "${RUNNER_NAME:-}" \
      --arg runner_os "${RUNNER_OS:-}" \
      --arg runner_arch "${RUNNER_ARCH:-}" \
      --arg job_kind "${CI_TIMING_JOB_KIND:-}" \
      --arg package "${CI_TIMING_PACKAGE:-}" \
      --arg flavor "${CI_TIMING_FLAVOR:-}" \
      --arg test_type "${CI_TIMING_TEST_TYPE:-}" \
      --arg scenario "${CI_TIMING_SCENARIO:-}" \
      --arg k3s_version "${CI_TIMING_K3S_VERSION:-}" \
      --arg observed_start_ms "$start" \
      '{schema_version: 1, metadata: {
        schema_version: "1",
        workflow: $workflow,
        job: $job,
        run_id: $run_id,
        run_attempt: $run_attempt,
        repository: $repository,
        sha: $sha,
        ref: $ref,
        event_name: $event_name,
        runner_name: $runner_name,
        runner_os: $runner_os,
        runner_arch: $runner_arch,
        job_kind: $job_kind,
        package: $package,
        flavor: $flavor,
        test_type: $test_type,
        scenario: $scenario,
        k3s_version: $k3s_version,
        observed_start_ms: $observed_start_ms
      }, phases: []}' \
      > "$tmp" 2>/dev/null; then
      if ! mv "$tmp" "$summary_json"; then
        rm -f "$tmp"
        warn 'unable to save timing summary'
      fi
    else
      rm -f "$tmp"
      printf '{"schema_version":1,"metadata":{},"phases":[]}\n' > "$summary_json"
      warn 'unable to initialize timing summary'
    fi
  else
    printf '{"schema_version":1,"metadata":{},"phases":[]}\n' > "$summary_json"
    warn 'jq is unavailable; timing summary will be empty'
  fi

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
      printf 'CI_TIMING_ENABLED=true\n'
      printf 'CI_TIMING_DIR=%s\n' "$timing_dir"
    } >> "$GITHUB_ENV" 2>/dev/null || true
  fi

  start_phase job
}

finalize() {
  if ! ensure_directory; then
    return 0
  fi

  end_phase job "${status:-success}"
}

case "$mode" in
  init)
    init
    ;;
  start)
    if [[ -n "$phase" ]]; then
      start_phase "$phase"
    else
      warn 'start requires a phase name'
    fi
    ;;
  end)
    if [[ -n "$phase" ]]; then
      end_phase "$phase" "$status"
    else
      warn 'end requires a phase name'
    fi
    ;;
  finalize)
    finalize
    ;;
  run)
    if [[ -z "$phase" || "$#" -lt 3 ]]; then
      warn 'run requires a phase name and command'
      exit 2
    fi

    start_phase "$phase" || true
    shift 2
    set +e
    "$@"
    command_status=$?
    set -e
    if (( command_status == 0 )); then
      end_phase "$phase" success || true
    else
      end_phase "$phase" failure || true
    fi
    exit "$command_status"
    ;;
  *)
    warn "unknown mode: ${mode:-<empty>}"
    exit 2
    ;;
esac
