#!/bin/bash
# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial


# This is the same as the test script for sidecar, just placed here for convenience

# Configurations - different tests types
VEGETA_RATE="20"      # Requests per second
NGINX_REPLICAS=1    # Number of replicas for the test
VEGETA_TARGET=""

# Function to display help message
help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --rate <number>     Requests per second (default: $VEGETA_RATE)"
  echo "  --replicas <number> Number of Nginx replicas (default: $NGINX_REPLICAS)"
  echo "  --target <url>      Target URL (required)"
  echo "  --help              Display this help message"
  exit 0
}

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rate)
      VEGETA_RATE="$2"
      shift 2
      ;;
    --replicas)
      NGINX_REPLICAS="$2"
      shift 2
      ;;
    --target)
      VEGETA_TARGET="$2"
      shift 2
      ;;
    --help)
      help
      ;;
    *)
      echo "Unknown parameter: $1"
      help
      ;;
  esac
done
# Check if --target was provided
if [[ -z "$VEGETA_TARGET" ]]; then
  echo "Error: --target is required."
  exit 1
fi
# Verify target response
if ! curl -s -o /dev/null -w "%{http_code}" "$VEGETA_TARGET" | grep -E "^[23][0-9]{2}$"; then
  echo "Error: Target $VEGETA_TARGET did not respond with a 2xx or 3xx HTTP code."
  exit 1
fi
VEGETA_DURATION="300s" # Load test duration
METRICS_INTERVAL=5    # Sampling frequency (seconds)

# Configurations - different targets/collection namespaces/files
NAMESPACES=("nginx" "linkerd")
DIRECTORY="${VEGETA_RATE}_${NGINX_REPLICAS}"
LOG_FILE="${DIRECTORY}/resource-usage.log"
VEGETA_OUTPUT="${DIRECTORY}/vegeta-results.bin"
METRICS_FILE="${DIRECTORY}/namespace-metrics-summary.txt"

# Ensure cleanup on script exit
cleanup() {
  echo "🛑 Stopping background metrics collection..."
  kill "$METRICS_PID" 2>/dev/null
  wait "$METRICS_PID" 2>/dev/null
}
trap cleanup EXIT

# Function to collect CPU & Memory usage per namespace
collect_metrics() {
  local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
  for ns in "${NAMESPACES[@]}"; do
    kubectl top pods -n "$ns" --no-headers --use-protocol-buffers | awk -v ts="$timestamp" -v ns="$ns" '
    {
      total_cpu[ns] += $2 + 0;  # Sum CPU across all pods in the namespace
      total_mem[ns] += $3 + 0;  # Sum Memory across all pods in the namespace
    }
    END {
      for (n in total_cpu) {
        print ts "," n "," total_cpu[n] "," total_mem[n];  # Output total CPU & Memory per namespace
      }
    }' >> "$LOG_FILE"
  done
}

mkdir -p ${DIRECTORY}

# Scale deployment to desired pod count
echo "🚀 Scaling deployment to $NGINX_REPLICAS replicas..."
kubectl scale deployment nginx -n nginx --replicas=${NGINX_REPLICAS}
kubectl rollout status deployment nginx -n nginx --timeout=300s

# Start Metrics Collection in the background
echo "Timestamp, Namespace, Total CPU(mCPU), Total Memory(MiB)" > "$LOG_FILE"
echo "📊 Starting CPU & Memory collection every $METRICS_INTERVAL seconds..."
(
  while true; do
    collect_metrics
    sleep "$METRICS_INTERVAL"
  done
) &

METRICS_PID=$!

# Run Vegeta Load Test
echo "🚀 Starting Vegeta load test: $VEGETA_RATE requests/sec for $VEGETA_DURATION on ${NGINX_REPLICAS} pod(s)"
echo "GET http://$VEGETA_TARGET/" | vegeta attack -rate="$VEGETA_RATE" -duration="$VEGETA_DURATION" | tee "$VEGETA_OUTPUT" | vegeta report

# Summarize Total Resource Usage by Namespace
echo "📊 Analyzing resource usage with min, max, and average metrics..."
awk -F',' '
NR==1 { next }  # Skip header line
{
  ns = $2;
  gsub(/^[ \t]+|[ \t]+$/, "", ns);
  if (NF == 4) {
    cpu = $3 + 0;  # For 4-field lines: timestamp, ns, CPU, Memory
    mem = $4 + 0;
  } else if (NF >= 6) {
    cpu = $3 + 0;  # For 6-field lines: timestamp, ns, CPU, ..., Memory, ...
    mem = $5 + 0;
  } else {
    next;
  }
  
  # Update per-namespace metrics
  if (!(ns in cpu_min) || cpu < cpu_min[ns]) { cpu_min[ns] = cpu }
  if (!(ns in cpu_max) || cpu > cpu_max[ns]) { cpu_max[ns] = cpu }
  cpu_sum[ns] += cpu;
  cpu_count[ns]++;

  if (!(ns in mem_min) || mem < mem_min[ns]) { mem_min[ns] = mem }
  if (!(ns in mem_max) || mem > mem_max[ns]) { mem_max[ns] = mem }
  mem_sum[ns] += mem;
  mem_count[ns]++;
}
END {
  print "Namespace, CPU_min, CPU_max, CPU_avg, Mem_min, Mem_max, Mem_avg";
  total_cpu_min = 0; total_cpu_max = 0; total_cpu_avg = 0;
  total_mem_min = 0; total_mem_max = 0; total_mem_avg = 0;
  for (ns in cpu_sum) {
    cpu_avg = cpu_sum[ns] / cpu_count[ns];
    mem_avg = mem_sum[ns] / mem_count[ns];
    printf "%s, %dm, %dm, %.2fm, %dMi, %dMi, %.2fMi\n", ns, cpu_min[ns], cpu_max[ns], cpu_avg, mem_min[ns], mem_max[ns], mem_avg;
    total_cpu_min += cpu_min[ns];
    total_cpu_max += cpu_max[ns];
    total_cpu_avg += cpu_avg;
    total_mem_min += mem_min[ns];
    total_mem_max += mem_max[ns];
    total_mem_avg += mem_avg;
  }
  printf "TOTAL, %dm, %dm, %.2fm, %dMi, %dMi, %.2fMi\n", total_cpu_min, total_cpu_max, total_cpu_avg, total_mem_min, total_mem_max, total_mem_avg;
}
' "$LOG_FILE" | column -t -s',' > "${METRICS_FILE}"

echo "✅ Load test and resource monitoring complete!"
echo "🔹 Detailed logs: $LOG_FILE"
echo "🔹 Namespace resource summary: ${METRICS_FILE}"

# Display summary
cat ${METRICS_FILE}
