#!/bin/bash
# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial



set -e
PUBLIC_KEY="$1"

key_id=$(echo "$PUBLIC_KEY" |\
  openssl rsa -pubin -inform PEM -outform der 2>/dev/null |\
  openssl dgst -sha256 -binary |\
  basenc --base64url -w 0 |\
  tr -d '=')

# Adds a check to ensure that the key_id is not empty
if [ -z "$key_id" ]; then
  echo "Error: key_id is not set, make sure you have openssl, basenc, and tr installed." >&2
  exit 1
fi

jq -n --arg key_id "$key_id" '{"key_id":$key_id}'