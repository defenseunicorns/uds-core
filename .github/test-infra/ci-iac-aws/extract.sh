#!/bin/bash

set +o xtrace

# Check if the runtime environment is Darwin (Mac OS X) or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
  ARCH_NAME=darwin
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  ARCH_NAME=linux
elif [[ "$OSTYPE" == "msys" ]]; then
  ARCH_NAME=windows
elif [[ "$OSTYPE" == "cygwin" ]]; then
  ARCH_NAME=windows
else
  echo "The OS is not supported"
  exit 1
fi

# Check the processor architecture
if [[ $(uname -m) == "x86_64" ]]; then
  echo "The processor architecture is 64-bit"
  ARCH_PROC=amd64
elif [[ $(uname -m) == "i686" || $(uname -m) == "i386" ]]; then
  echo "The processor architecture is 32-bit"
  echo "The processor is not AMD or ARM"
elif [[ $(uname -m) == "arm64" ]]; then
  ARCH_PROC=arm64
else
# default...
  ARCH_PROC=amd64
fi

echo "HI!"
echo "ARCH_NAME: ${ARCH_NAME}"
echo "ARCH_PROC: ${ARCH_PROC}"

# todo: actually use the terraform binary we download
mkdir -p run/loki && chmod -R ugo+rwx run/loki
mkdir -p run/velero && chmod -R ugo+rwx run/velero
unzip -o -q tmp/terraform_${1}_${ARCH_NAME}_${ARCH_PROC}.zip -d run
