#!/bin/bash
# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# fix.sh
# One-time script to update resource summaries with per-namespace min, max, and average metrics,
# and then add a TOTAL row that sums the values of the per-namespace rows.
#
# Assumptions:
# - Each folder (e.g., "20_1", "20_10", etc.) contains a file named "resource-usage.log".
# - The header in the log might have 6 columns, but the data lines can be either:
#     4 fields: Timestamp, Namespace, CPU, Memory
#     6 fields: Timestamp, Namespace, Total CPU(mCPU), Max CPU(mCPU), Total Memory(MiB), Max Memory(MiB)
#   For 4-field lines, CPU = $3 and Memory = $4.
#   For 6-field lines, CPU = $3 and Memory = $5.
#
# CPU values are suffixed with "m" and Memory values with "Mi".
#
# The script pretty prints the summary using the column command.

for dir in *; do
  if [[ -d "$dir" && -f "$dir/resource-usage.log" ]]; then
    echo "Processing folder: $dir"
    awk -F',' '
    NR==1 { next }  # Skip header
    {
      ns = $2;
      gsub(/^[ \t]+|[ \t]+$/, "", ns);
      if (NF == 4) {
         cpu = $3 + 0;
         mem = $4 + 0;
      } else if (NF >= 6) {
         cpu = $3 + 0;
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
      count = 0;
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
         count++;
      }
      # Print TOTAL row as the sum of the per-namespace rows
      printf "TOTAL, %dm, %dm, %.2fm, %dMi, %dMi, %.2fMi\n", total_cpu_min, total_cpu_max, total_cpu_avg, total_mem_min, total_mem_max, total_mem_avg;
    }
    ' "$dir/resource-usage.log" > "$dir/namespace-metrics-summary.txt"
    echo "Updated summary for folder: $dir"
  fi
done

# Pretty print all updated summaries
echo -e "\nPretty Printed Summaries:\n"
for dir in *; do
  if [[ -d "$dir" && -f "$dir/namespace-metrics-summary.txt" ]]; then
    echo "=============================="
    echo "Folder: $dir"
    echo "=============================="
    column -t -s',' "$dir/namespace-metrics-summary.txt"
    echo ""
  fi
done

echo "All done, bro!"
