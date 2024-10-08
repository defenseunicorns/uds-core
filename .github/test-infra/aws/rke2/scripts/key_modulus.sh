#!/bin/bash
PUBLIC_KEY="$1"

modulus=$(echo "$PUBLIC_KEY" |\
  openssl rsa -pubin -noout -modulus |\
  awk -F'=' '{print $2}' |\
  xxd -r -p |\
  basenc --base64url -w 0 |\
  tr -d '=')

jq -n --arg modulus "$modulus" '{"modulus":$modulus}'