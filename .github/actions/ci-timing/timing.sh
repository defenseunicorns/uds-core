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

events_jsonl="$timing_dir/events.ndjson"
metadata_json="$timing_dir/metadata.json"
summary_json="$timing_dir/summary.json"

now_ms() {
  local value
  value="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf '%s000\n' "$(date +%s)"
  fi
}

timing_enabled() {
  [[ "${CI_TIMING_ENABLED:-false}" == "true" ]]
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

append_event() {
  local event_type="$1"
  local name="$2"
  local timestamp="$3"
  local event_status="${4:-}"
  local event_json

  if ! ensure_directory || ! command -v jq >/dev/null 2>&1; then
    return 0
  fi

  event_json="$(jq -cn \
    --arg event "$event_type" \
    --arg phase "$name" \
    --arg status "$event_status" \
    --argjson timestamp_ms "$timestamp" \
    '{event: $event, phase: $phase, timestamp_ms: $timestamp_ms, status: $status}' \
    2>/dev/null || true)"

  if [[ -n "$event_json" ]]; then
    printf '%s\n' "$event_json" >> "$events_jsonl" 2>/dev/null || true
  fi
}

close_open_phases_on_failure() {
  local timestamp="$1"
  local failed_phase="${2:-}"
  local open_phases

  if ! command -v jq >/dev/null 2>&1 || [[ ! -f "$events_jsonl" ]]; then
    return 0
  fi

  open_phases="$(jq -s -r '
    reduce .[] as $event ({open: []};
      if $event.event == "start" then
        .open += [$event.phase]
      elif $event.event == "end" then
        ([range(0; (.open | length)) as $index
          | select(.open[$index] == $event.phase)
          | $index] | last) as $index
        | if $index == null then
            .
          else
            .open = (.open[:$index] + .open[$index + 1:])
          end
      else
        .
      end
    )
    | .open[]
  ' "$events_jsonl" 2>/dev/null || true)"

  if [[ -z "$open_phases" ]]; then
    return 0
  fi

  while IFS= read -r open_phase; do
    if [[ -n "$open_phase" && "$open_phase" != "job" && "$open_phase" != "$failed_phase" ]]; then
      append_event end "$open_phase" "$timestamp" failure
    fi
  done <<< "$open_phases"
}

start_phase() {
  timing_enabled || return 0
  append_event start "$1" "$(now_ms)" running
}

end_phase() {
  timing_enabled || return 0
  append_event end "$1" "$(now_ms)" "${2:-success}"
}

write_metadata() {
  local started_ms="$1"
  local tmp="$metadata_json.tmp"

  if ! command -v jq >/dev/null 2>&1; then
    if ! printf '{"schema_version":1,"metadata":{}}\n' > "$metadata_json"; then
      warn "unable to initialize timing metadata: $metadata_json"
    fi
    return 0
  fi

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
    --arg observed_start_ms "$started_ms" \
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
    }}' > "$tmp" 2>/dev/null; then
    if ! mv "$tmp" "$metadata_json"; then
      rm -f "$tmp" || true
      warn "unable to save timing metadata: $metadata_json"
    fi
  else
    rm -f "$tmp" || true
    if ! printf '{"schema_version":1,"metadata":{}}\n' > "$metadata_json"; then
      warn "unable to initialize timing metadata: $metadata_json"
    fi
    warn 'unable to initialize timing metadata'
  fi
}

init() {
  local started_ms

  timing_enabled || return 0
  ensure_directory || return 0

  if ! rm -f "$events_jsonl" "$metadata_json" "$summary_json" \
    "$events_jsonl.tmp" "$metadata_json.tmp" "$summary_json.tmp"; then
    warn "unable to reset timing files in: $timing_dir"
    return 0
  fi
  if ! : > "$events_jsonl"; then
    warn "unable to initialize timing events: $events_jsonl"
    return 0
  fi
  started_ms="$(now_ms)"
  write_metadata "$started_ms"
  if ! printf '{"schema_version":1,"metadata":{},"phases":[]}\n' > "$summary_json"; then
    warn "unable to initialize timing summary: $summary_json"
    return 0
  fi

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
      printf 'CI_TIMING_ENABLED=true\n'
      printf 'CI_TIMING_DIR=%s\n' "$timing_dir"
    } >> "$GITHUB_ENV" 2>/dev/null || true
  fi

  append_event start job "$started_ms" running
}

aggregate() {
  local finished_ms="$1"
  local final_status="$2"
  local tmp="$summary_json.tmp"

  if ! command -v jq >/dev/null 2>&1 || [[ ! -f "$metadata_json" ]]; then
    return 0
  fi

  if [[ ! -f "$events_jsonl" ]]; then
    if ! : > "$events_jsonl"; then
      warn "unable to initialize timing events: $events_jsonl"
      return 0
    fi
  fi

  if jq -s \
    --slurpfile base "$metadata_json" \
    --argjson finished_ms "$finished_ms" \
    --arg final_status "$final_status" \
    '
      def duration($start; $end):
        if $start == null or $end == null then null
        elif ($end - $start) < 0 then 0
        else ($end - $start)
        end;

      def close_phase($event):
        ([range(0; (.phases | length)) as $index
          | select(.phases[$index].phase == $event.phase
            and .phases[$index].end_ms == null)
          | $index] | last) as $index
        | if $index == null then
            .
          else
            .phases[$index].end_ms = $event.timestamp_ms
            | .phases[$index].duration_ms = duration(
                .phases[$index].start_ms;
                $event.timestamp_ms
              )
            | .phases[$index].status = ($event.status // "success")
          end;

      (($base[0] // {schema_version: 1, metadata: {}})) as $base_summary
      | (reduce .[] as $event (
          {phases: []};
          if $event.event == "start" then
            .phases += [{
              phase: $event.phase,
              start_ms: $event.timestamp_ms,
              end_ms: null,
              duration_ms: null,
              status: "running"
            }]
          elif $event.event == "end" then
            close_phase($event)
          else
            .
          end
        )) as $timing
      | $base_summary
      | .schema_version = 1
      | .metadata.finished_ms = $finished_ms
      | .metadata.final_status = $final_status
      | .metadata.total_duration_ms = (
          [$timing.phases[]
            | select(.phase == "job" and .duration_ms != null)
            | .duration_ms] | last // null
        )
      | .phases = ($timing.phases | map(
          if .end_ms == null then
            .status = "incomplete"
          else
            .
          end
        ))
    ' "$events_jsonl" > "$tmp" 2>/dev/null; then
    if ! mv "$tmp" "$summary_json"; then
      rm -f "$tmp" || true
      warn "unable to save timing summary: $summary_json"
    fi
  else
    rm -f "$tmp" || true
    warn 'unable to aggregate timing events'
  fi
}

finalize() {
  local finished_ms

  timing_enabled || return 0
  ensure_directory || return 0
  finished_ms="$(now_ms)"
  append_event end job "$finished_ms" "${status:-success}"
  aggregate "$finished_ms" "${status:-success}"
}

handle_run_failure() {
  local command_status="$1"
  local phase_name="$2"
  local failure_timestamp

  failure_timestamp="$(now_ms)"
  close_open_phases_on_failure "$failure_timestamp" "$phase_name" || true
  end_phase "$phase_name" failure || true
  trap - ERR
  exit "$command_status"
}

run_phase() {
  local name="$1"
  shift

  if ! timing_enabled; then
    "$@"
    return $?
  fi

  start_phase "$name"

  # The trap records a failed command before returning its exact status. The
  # command is invoked directly, so no eval or string re-parsing is required.
  trap 'handle_run_failure "$?" "$name"' ERR
  "$@"
  command_status=$?
  trap - ERR
  end_phase "$name" success || true
  return "$command_status"
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

    shift 2
    run_phase "$phase" "$@"
    ;;
  *)
    warn "unknown mode: ${mode:-<empty>}"
    exit 2
    ;;
esac
