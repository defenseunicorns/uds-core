#!/bin/bash
# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial



PUBLIC_KEY="$1"

modulus=$(echo "$PUBLIC_KEY" |\
  openssl rsa -pubin -noout -modulus |\
  awk -F'=' '{print $2}' |\
  xxd -r -p |\
  basenc --base64url -w 0 |\
  tr -d '=')

jq -n --arg modulus "$modulus" '{"modulus":$modulus}'