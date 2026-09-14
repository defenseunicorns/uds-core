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

events_file="$timing_dir/events.tsv"
metadata_file="$timing_dir/metadata.tsv"
summary_json="$timing_dir/summary.json"
summary_md="$timing_dir/summary.md"

phase_key() {
  local value="$1"
  value="${value//[^[:alnum:]_.-]/_}"
  printf '%s' "$value"
}

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

record_metadata() {
  local key value
  key="$(field_value "$1")"
  value="$(field_value "${2:-}")"
  printf '%s\t%s\n' "$key" "$value" >> "$metadata_file"
}

start_phase() {
  local name key
  name="$1"
  key="$(phase_key "$name")"
  if ! ensure_directory; then
    return 0
  fi
  printf '%s\n' "$(now_ms)" > "$timing_dir/.${key}.start"
}

end_phase() {
  local name phase_file start end duration result
  name="$1"
  result="$(field_value "${2:-success}")"
  phase_file="$timing_dir/.$(phase_key "$name").start"

  if [[ ! -f "$phase_file" || ! -f "$events_file" ]]; then
    warn "no start marker found for phase: $name"
    return 0
  fi

  start="$(<"$phase_file")"
  end="$(now_ms)"
  duration=$((end - start))
  if (( duration < 0 )); then
    duration=0
  fi

  printf '%s\t%s\t%s\t%s\t%s\n' \
    "$(field_value "$name")" "$start" "$end" "$duration" "$result" >> "$events_file"
  rm -f "$phase_file"
}

write_json() {
  if ! command -v jq >/dev/null 2>&1; then
    printf '{"schema_version":1,"metadata":{},"phases":[]}\n' > "$summary_json"
    return 0
  fi

  local metadata_json phases_json
  metadata_json="$(jq -Rn '
    reduce (inputs | select(length > 0) | split("\t")) as $parts
      ({}; .[$parts[0]] = ($parts[1] // ""))
  ' "$metadata_file" 2>/dev/null || printf '{}')"
  phases_json="$(jq -Rsc '
    split("\n")
    | .[1:]
    | map(select(length > 0) | split("\t") |
      {
        phase: .[0],
        start_ms: (.[1] | tonumber),
        end_ms: (.[2] | tonumber),
        duration_ms: (.[3] | tonumber),
        status: .[4]
      })
  ' "$events_file" 2>/dev/null || printf '[]')"

  jq -n \
    --argjson metadata "$metadata_json" \
    --argjson phases "$phases_json" \
    '{schema_version: 1, metadata: $metadata, phases: $phases}' \
    > "$summary_json" 2>/dev/null || printf '{"schema_version":1,"metadata":{},"phases":[]}\n' > "$summary_json"
}

write_markdown_summary() {
  {
    printf '%s\n\n' '## CI timing'
    printf '%s\n\n' 'These timings are observed after checkout and are best-effort telemetry.'
    printf '| Phase | Duration | Status |\n'
    printf '| --- | ---: | --- |\n'
    if [[ -f "$events_file" ]]; then
      awk -F '\t' 'NR > 1 { printf "| `%s` | %d ms | %s |\n", $1, $4, $5 }' "$events_file"
    fi
  } > "$summary_md"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    cat "$summary_md" >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true
  fi
}

init() {
  if ! ensure_directory; then
    return 0
  fi

  : > "$events_file"
  : > "$metadata_file"
  find "$timing_dir" -maxdepth 1 -type f -name '.*.start' -delete 2>/dev/null || true
  printf 'phase\tstart_ms\tend_ms\tduration_ms\tstatus\n' > "$events_file"
  start="$(now_ms)"

  record_metadata schema_version 1
  record_metadata workflow "${GITHUB_WORKFLOW:-}"
  record_metadata job "${GITHUB_JOB:-}"
  record_metadata run_id "${GITHUB_RUN_ID:-}"
  record_metadata run_attempt "${GITHUB_RUN_ATTEMPT:-}"
  record_metadata repository "${GITHUB_REPOSITORY:-}"
  record_metadata sha "${GITHUB_SHA:-}"
  record_metadata ref "${GITHUB_REF:-}"
  record_metadata event_name "${GITHUB_EVENT_NAME:-}"
  record_metadata runner_name "${RUNNER_NAME:-}"
  record_metadata runner_os "${RUNNER_OS:-}"
  record_metadata runner_arch "${RUNNER_ARCH:-}"
  record_metadata job_kind "${CI_TIMING_JOB_KIND:-}"
  record_metadata package "${CI_TIMING_PACKAGE:-}"
  record_metadata flavor "${CI_TIMING_FLAVOR:-}"
  record_metadata test_type "${CI_TIMING_TEST_TYPE:-}"
  record_metadata observed_start_ms "$start"

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
  write_json
  write_markdown_summary
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
