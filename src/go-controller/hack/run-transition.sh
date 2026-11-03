#!/bin/sh
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
set -eu
case "$(uname -s)" in Linux) host_os=linux ;; Darwin) host_os=darwin ;; *) echo 'Unsupported Core deployment host OS' >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) host_arch=amd64 ;; aarch64|arm64) host_arch=arm64 ;; *) echo 'Unsupported Core deployment host architecture' >&2; exit 1 ;; esac
phase="$1"
shift
exec "$(dirname "$0")/$host_os-$host_arch" --phase "$phase" --contract "$(dirname "$0")/admission-contract.json" "$@"
