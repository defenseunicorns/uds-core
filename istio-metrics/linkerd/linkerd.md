# Linkerd

## Setup

Tests were executed on a RHEL8.10 VM running RKE2 and Linkerd. System resources were set to 16GB RAM and 12 cores.

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 533.161µs
Latencies     [min, mean, 50, 90, 95, 99, max]  197.806µs, 453.79µs, 439.072µs, 624.522µs, 697.363µs, 893.877µs, 3.109ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        4m        3.20m     175Mi     175Mi     175.00Mi
nginx       1m        6m        5.05m     21Mi      21Mi      21.00Mi
TOTAL       4m        10m       8.25m     196Mi     196Mi     196.00Mi
```

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 394.856µs
Latencies     [min, mean, 50, 90, 95, 99, max]  160.582µs, 346.816µs, 313.66µs, 502.271µs, 561.917µs, 718.018µs, 3.264ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        3m        3.00m     175Mi     175Mi     175.00Mi
nginx       1m        11m       8.20m     21Mi      22Mi      21.20Mi
TOTAL       4m        14m       11.20m    196Mi     197Mi     196.20Mi
```

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 538.813µs
Latencies     [min, mean, 50, 90, 95, 99, max]  208.834µs, 447.657µs, 433.031µs, 616.115µs, 688.504µs, 885.44µs, 3.059ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        4m        3.20m     251Mi     261Mi     257.44Mi
nginx       1m        15m       13.34m    21Mi      210Mi     187.58Mi
TOTAL       4m        19m       16.54m    272Mi     471Mi     445.02Mi
```

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 659.345µs
Latencies     [min, mean, 50, 90, 95, 99, max]  159.775µs, 359.984µs, 337.105µs, 519.652µs, 575.024µs, 735.571µs, 2.795ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        3m        3.00m     178Mi     179Mi     178.36Mi
nginx       10m       19m       17.07m    142Mi     143Mi     142.83Mi
TOTAL       13m       22m       20.07m    320Mi     322Mi     321.19Mi
```

### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 573.162µs
Latencies     [min, mean, 50, 90, 95, 99, max]  204.315µs, 499.228µs, 482.638µs, 684.515µs, 766.126µs, 1.006ms, 3.414ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        10m       4.93m     179Mi     201Mi     195.61Mi
nginx       10m       56m       51.29m    213Mi     672Mi     628.20Mi
TOTAL       13m       66m       56.22m    392Mi     873Mi     823.81Mi
```

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 434.45µs
Latencies     [min, mean, 50, 90, 95, 99, max]  159.159µs, 376.824µs, 348.849µs, 545.76µs, 606.331µs, 768.428µs, 4.747ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        4m        3.07m     191Mi     191Mi     191.00Mi
nginx       50m       60m       58.64m    667Mi     670Mi     669.00Mi
TOTAL       53m       64m       61.71m    858Mi     861Mi     860.00Mi
```

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 369.982µs
Latencies     [min, mean, 50, 90, 95, 99, max]  195.332µs, 499.35µs, 477.582µs, 678.756µs, 766.428µs, 956.972µs, 6.397ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        60m       27.51m    208Mi     223Mi     214.53Mi
nginx       95m       108m      98.05m    1147Mi    1221Mi    1198.66Mi
TOTAL       98m       168m      125.56m   1355Mi    1444Mi    1413.19Mi
```

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 660.692µs
Latencies     [min, mean, 50, 90, 95, 99, max]  170.332µs, 381.338µs, 344.331µs, 564.639µs, 632.547µs, 800.107µs, 7.35ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace   CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
linkerd     3m        4m        3.19m     216Mi     216Mi     216.00Mi
nginx       90m       101m      99.19m    1245Mi    1270Mi    1252.93Mi
TOTAL       93m       105m      102.37m   1461Mi    1486Mi    1468.93Mi
```

## Summary / Takeaways

Linkerd has consistently lower latency (by 10x order of magnitude) than both Istio modes. CPU usage also is significantly (~5x) lower. Memory is comparable to Ambient for low workload numbers but Ambient wins out at higher workload numbers. 

If request latency is the highest priority then Linkerd is the clear choice especially for anything requiring consistent sub 1mS latency. If total memor is the highest priority then Istio Ambient is the clear choice as its memory doesn't scale with higher workloads and the ambient ztunnel performance is consistent even at very high loads.