#!/usr/bin/env bash

# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

DEFAULT_OUTPUT="build/k3d-proxy/uds-config.yaml"
NODE_CA_PATH="/uds-proxy-ca.pem"

proxy_url="${HTTPS_PROXY:-${HTTP_PROXY:-}}"
no_proxy="${NO_PROXY:-}"
ca_cert=""
extra_args=""
base_config=""
output="$DEFAULT_OUTPUT"
print_args=false

usage() {
  cat <<'EOF'
Generate k3d proxy and CA settings for UDS Core local deployments.

Usage:
  scripts/k3d-proxy-config/generate.sh [options]

Options:
  --proxy-url URL       Proxy URL. Defaults to HTTPS_PROXY, then HTTP_PROXY.
  --no-proxy VALUE     NO_PROXY value. Defaults to NO_PROXY.
  --ca-cert PATH       Host path to a CA PEM file mounted into all k3d nodes.
  --extra-args VALUE   Additional K3D_EXTRA_ARGS appended after generated args.
  --base-config PATH   Existing UDS_CONFIG file to merge into the output.
  --output PATH        Output UDS_CONFIG path. Defaults to build/k3d-proxy/uds-config.yaml.
  --print-args         Print K3D_EXTRA_ARGS instead of writing a UDS_CONFIG file.
  -h, --help           Show this help message.
EOF
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  [[ -n "$value" ]] || fail "$flag requires a value"
}

has_whitespace() {
  [[ "$1" =~ [[:space:]] ]]
}

find_yq() {
  if [[ -x "./uds" ]]; then
    echo "./uds zarf tools yq"
    return
  fi

  if command -v yq >/dev/null 2>&1; then
    echo "yq"
    return
  fi
}

read_existing_k3d_args() {
  local config_path="$1"
  local yq_cmd="$2"

  if [[ -n "$yq_cmd" ]]; then
    $yq_cmd '.variables."uds-k3d-dev".K3D_EXTRA_ARGS // ""' "$config_path"
    return
  fi

  CONFIG_PATH="$config_path" node <<'EOF'
const fs = require("fs");
const YAML = require("yaml");

const content = fs.readFileSync(process.env.CONFIG_PATH, "utf8");
const config = content.trim() ? YAML.parse(content) : {};
const value = config?.variables?.["uds-k3d-dev"]?.K3D_EXTRA_ARGS ?? "";
process.stdout.write(String(value));
EOF
}

write_k3d_args() {
  local config_path="$1"
  local yq_cmd="$2"
  local k3d_args="$3"

  if [[ -n "$yq_cmd" ]]; then
    K3D_EXTRA_ARGS="$k3d_args" $yq_cmd -i '.variables."uds-k3d-dev".K3D_EXTRA_ARGS = strenv(K3D_EXTRA_ARGS)' "$config_path"
    return
  fi

  CONFIG_PATH="$config_path" K3D_EXTRA_ARGS="$k3d_args" node <<'EOF'
const fs = require("fs");
const YAML = require("yaml");

const configPath = process.env.CONFIG_PATH;
const content = fs.readFileSync(configPath, "utf8");
const config = content.trim() ? YAML.parse(content) : {};

if (!config.variables || typeof config.variables !== "object") {
  config.variables = {};
}

if (!config.variables["uds-k3d-dev"] || typeof config.variables["uds-k3d-dev"] !== "object") {
  config.variables["uds-k3d-dev"] = {};
}

config.variables["uds-k3d-dev"].K3D_EXTRA_ARGS = process.env.K3D_EXTRA_ARGS;
fs.writeFileSync(configPath, YAML.stringify(config));
EOF
}

join_args() {
  local joined=""
  local part

  for part in "$@"; do
    [[ -n "$part" ]] || continue

    if [[ -z "$joined" ]]; then
      joined="$part"
    else
      joined="$joined $part"
    fi
  done

  printf "%s" "$joined"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --proxy-url)
      require_value "$1" "${2:-}"
      proxy_url="$2"
      shift 2
      ;;
    --no-proxy)
      require_value "$1" "${2:-}"
      no_proxy="$2"
      shift 2
      ;;
    --ca-cert)
      require_value "$1" "${2:-}"
      ca_cert="$2"
      shift 2
      ;;
    --extra-args)
      require_value "$1" "${2:-}"
      extra_args="$2"
      shift 2
      ;;
    --base-config)
      require_value "$1" "${2:-}"
      base_config="$2"
      shift 2
      ;;
    --output)
      require_value "$1" "${2:-}"
      output="$2"
      shift 2
      ;;
    --print-args)
      print_args=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

if [[ -z "$proxy_url" && -z "$ca_cert" && -z "$extra_args" ]]; then
  fail "set --proxy-url, --ca-cert, --extra-args, or matching proxy environment variables"
fi

if [[ -n "$proxy_url" ]] && has_whitespace "$proxy_url"; then
  fail "--proxy-url must not contain whitespace"
fi

if [[ -n "$no_proxy" ]] && has_whitespace "$no_proxy"; then
  fail "--no-proxy must not contain whitespace"
fi

generated_parts=()

if [[ -n "$ca_cert" ]]; then
  [[ -f "$ca_cert" ]] || fail "--ca-cert does not exist or is not a file: $ca_cert"
  if has_whitespace "$ca_cert"; then
    fail "--ca-cert path must not contain whitespace"
  fi

  generated_parts+=("--volume" "${ca_cert}:${NODE_CA_PATH}@all")
fi

if [[ -n "$proxy_url" ]]; then
  generated_parts+=(
    "--env" "http_proxy=${proxy_url}@all"
    "--env" "https_proxy=${proxy_url}@all"
    "--env" "HTTP_PROXY=${proxy_url}@all"
    "--env" "HTTPS_PROXY=${proxy_url}@all"
  )
fi

if [[ -n "$no_proxy" ]]; then
  generated_parts+=(
    "--env" "no_proxy=${no_proxy}@all"
    "--env" "NO_PROXY=${no_proxy}@all"
  )
fi

if [[ -n "$ca_cert" ]]; then
  generated_parts+=(
    "--env" "SSL_CERT_FILE=${NODE_CA_PATH}@all"
    "--env" "CURL_CA_BUNDLE=${NODE_CA_PATH}@all"
    "--env" "REQUESTS_CA_BUNDLE=${NODE_CA_PATH}@all"
    "--env" "GIT_SSL_CAINFO=${NODE_CA_PATH}@all"
    "--env" "AWS_CA_BUNDLE=${NODE_CA_PATH}@all"
    "--env" "NODE_EXTRA_CA_CERTS=${NODE_CA_PATH}@all"
  )
fi

generated_args="$(join_args "${generated_parts[@]}")"
final_args="$(join_args "$generated_args" "$extra_args")"

if [[ "$print_args" == "true" ]]; then
  printf "%s\n" "$final_args"
  exit 0
fi

yq_cmd="$(find_yq)"

if [[ -z "$yq_cmd" ]]; then
  if ! node -e 'require("yaml")' >/dev/null 2>&1; then
    fail "could not find yq or the Node yaml package. Run from the repo root with ./uds present, install yq on PATH, or install Node dependencies"
  fi
fi

mkdir -p "$(dirname "$output")"

tmp_output="$(mktemp "${TMPDIR:-/tmp}/uds-k3d-proxy-config.XXXXXX")"
trap 'rm -f "$tmp_output"' EXIT

if [[ -n "$base_config" ]]; then
  [[ -f "$base_config" ]] || fail "--base-config does not exist or is not a file: $base_config"
  cp "$base_config" "$tmp_output"
else
  printf "variables: {}\n" > "$tmp_output"
fi

existing_args="$(read_existing_k3d_args "$tmp_output" "$yq_cmd")"
final_args="$(join_args "$existing_args" "$final_args")"

write_k3d_args "$tmp_output" "$yq_cmd" "$final_args"
mv "$tmp_output" "$output"
trap - EXIT

echo "Wrote $output"
echo "Export it before deploying:"
echo "  export UDS_CONFIG=$output"
