# Sidecar baseline

## Setup

Run the setup script which will install slim dev + metrics server + nginx (from uds-common). Post-install it will patch several changes to make our test perform better: `./setup.sh`

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.971ms
Latencies     [min, mean, 50, 90, 95, 99, max]  2.089ms, 5.529ms, 4.953ms, 7.572ms, 9.11ms, 18.509ms, 79.87ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        23m       19.29m    32Mi      33Mi      32.15Mi
nginx                  11m       29m       25.59m    46Mi      46Mi      46.00Mi
istio-system           2m        4m        2.59m     48Mi      49Mi      48.10Mi
TOTAL                  17m       56m       47.47m    126Mi     128Mi     126.25Mi
```

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.351ms
Latencies     [min, mean, 50, 90, 95, 99, max]  2.107ms, 3.829ms, 3.443ms, 4.799ms, 5.366ms, 9.268ms, 85.349ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        33m       29.71m    32Mi      32Mi      32.00Mi
nginx                  13m       43m       35.92m    46Mi      46Mi      46.00Mi
istio-system           1m        3m        2.08m     48Mi      49Mi      48.31Mi
TOTAL                  18m       79m       67.71m    126Mi     127Mi     126.31Mi
```

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.484ms
Latencies     [min, mean, 50, 90, 95, 99, max]  2.128ms, 4.825ms, 3.92ms, 6.173ms, 6.827ms, 24.864ms, 233.875ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        19m       16.75m    33Mi      34Mi      33.10Mi
nginx                  88m       128m      104.92m   450Mi     452Mi     451.68Mi
istio-system           2m        4m        2.85m     54Mi      54Mi      54.00Mi
TOTAL                  96m       151m      124.51m   537Mi     540Mi     538.78Mi
```

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 3.159ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.997ms, 3.486ms, 3.111ms, 4.035ms, 4.533ms, 8.275ms, 100.909ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        39m       32.92m    44Mi      46Mi      45.61Mi
nginx                  86m       121m      106.19m   537Mi     586Mi     569.49Mi
istio-system           2m        70m       7.41m     81Mi      130Mi     108.07Mi
TOTAL                  92m       230m      146.51m   662Mi     762Mi     723.17Mi
```

### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.594ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.941ms, 3.349ms, 2.945ms, 3.698ms, 4.261ms, 9.325ms, 107.642ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   3m        18m       15.15m    43Mi      46Mi      43.20Mi
nginx                  318m      401m      353.39m   2494Mi    2594Mi    2513.63Mi
istio-system           2m        9m        3.88m     97Mi      120Mi     102.22Mi
TOTAL                  323m      428m      372.42m   2634Mi    2760Mi    2659.05Mi
```

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 3.606ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.746ms, 3.204ms, 2.612ms, 3.219ms, 3.645ms, 19.326ms, 264.563ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   3m        34m       29.64m    44Mi      47Mi      45.76Mi
nginx                  311m      454m      364.73m   2545Mi    2744Mi    2627.32Mi
istio-system           2m        25m       4.90m     98Mi      133Mi     124.51Mi
TOTAL                  316m      513m      399.27m   2687Mi    2924Mi    2797.59Mi
```

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.175ms
Latencies     [min, mean, 50, 90, 95, 99, max]  2.453ms, 4.547ms, 3.504ms, 4.397ms, 5.098ms, 41.798ms, 155.676ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   3m        18m       13.39m    41Mi      41Mi      41.00Mi
nginx                  511m      703m      597.64m   4429Mi    4451Mi    4440.93Mi
istio-system           4m        11m       6.27m     132Mi     135Mi     133.73Mi
TOTAL                  518m      732m      617.31m   4602Mi    4627Mi    4615.66Mi
```

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.63ms
Latencies     [min, mean, 50, 90, 95, 99, max]  2.162ms, 4.179ms, 3.139ms, 4.033ms, 4.991ms, 37.28ms, 207.979ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   3m        33m       26.97m    38Mi      41Mi      40.75Mi
nginx                  509m      707m      581.97m   4385Mi    4432Mi    4401.90Mi
istio-system           3m        13m       6.27m     123Mi     130Mi     124.19Mi
TOTAL                  515m      753m      615.20m   4546Mi    4603Mi    4566.83Mi
```

## Summary / Takeaways

Latency generally is unaffected by more pods/requests (max latency is higher with more pods but overall results are similar).

No failures were hit even at small scale with lots of requests.

Istio namespaces generally remain stable in resource usage past a few pods.

Generally per-pod resources used were ~8 millicores of CPU, and ~50Mi of memory (total per nginx pod).
