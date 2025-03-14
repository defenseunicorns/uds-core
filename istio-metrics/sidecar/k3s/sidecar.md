# Sidecar k3s baseline
These tests were ran on a RHEL 8.10 VM with `k3s` which shows more accurate request latency for Istio itself.

## Setup

Setup was done by running the [setup script](../../k3s_setup.sh) using 3 known free IPs on the subnet:
```
./k3s_setup.sh --admin-ip <IP> --tenant-ip <IP> --passthrough-ip <IP>
```
This configured `k3s` with `metallb` then installs UDS Core Base and configures `nginx` to be used as a test application.

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.217ms
Latencies     [min, mean, 50, 90, 95, 99, max]  588.001µs, 1.036ms, 996.513µs, 1.325ms, 1.47ms, 1.822ms, 21ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        8m        7.14m     47Mi      50Mi      48.38Mi
nginx                  1m        9m        8.21m     55Mi      55Mi      55.00Mi
istio-system           1m        3m        1.19m     80Mi      90Mi      84.41Mi
TOTAL                  3m        20m       16.53m    182Mi     195Mi     187.79Mi
```

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 731.945µs
Latencies     [min, mean, 50, 90, 95, 99, max]  509.695µs, 879.616µs, 838.414µs, 1.121ms, 1.315ms, 1.737ms, 23.104ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        15m       13.43m    47Mi      48Mi      47.93Mi
nginx                  1m        18m       15.79m    55Mi      56Mi      55.24Mi
istio-system           1m        3m        1.22m     80Mi      84Mi      81.98Mi
TOTAL                  3m        36m       30.45m    182Mi     188Mi     185.16Mi
```

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.528ms
Latencies     [min, mean, 50, 90, 95, 99, max]  642.163µs, 1.19ms, 1.135ms, 1.49ms, 1.609ms, 2.081ms, 25.016ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        9m        7.52m     48Mi      53Mi      51.69Mi
nginx                  1m        193m      29.57m    55Mi      534Mi     503.74Mi
istio-system           1m        32m       2.52m     84Mi      90Mi      89.28Mi
TOTAL                  3m        234m      39.60m    187Mi     677Mi     644.71Mi
```

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 894.384µs
Latencies     [min, mean, 50, 90, 95, 99, max]  549.433µs, 998.381µs, 954.131µs, 1.288ms, 1.432ms, 1.76ms, 19.307ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        16m       14.10m    52Mi      53Mi      52.10Mi
nginx                  12m       40m       35.22m    516Mi     520Mi     517.78Mi
istio-system           1m        3m        1.71m     84Mi      84Mi      84.00Mi
TOTAL                  14m       59m       51.03m    652Mi     657Mi     653.88Mi
```

### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.121ms
Latencies     [min, mean, 50, 90, 95, 99, max]  671.919µs, 1.263ms, 1.164ms, 1.522ms, 1.681ms, 2.95ms, 27.517ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   9m        15m       9.45m     52Mi      59Mi      57.82Mi
nginx                  13m       100m      93.47m    522Mi     2744Mi    2638.44Mi
istio-system           1m        10m       2.67m     84Mi      178Mi     168.13Mi
TOTAL                  23m       125m      105.60m   658Mi     2981Mi    2864.38Mi
```

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 807.097µs
Latencies     [min, mean, 50, 90, 95, 99, max]  605.613µs, 1.055ms, 984.379µs, 1.344ms, 1.506ms, 1.977ms, 23.838ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        20m       15.76m    55Mi      60Mi      59.33Mi
nginx                  50m       101m      96.84m    2691Mi    2720Mi    2709.10Mi
istio-system           2m        5m        2.26m     144Mi     156Mi     150.55Mi
TOTAL                  53m       126m      114.86m   2890Mi    2936Mi    2918.98Mi
```

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.032ms
Latencies     [min, mean, 50, 90, 95, 99, max]  804.441µs, 1.353ms, 1.24ms, 1.648ms, 1.836ms, 3.176ms, 48.889ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        12m       9.74m     53Mi      60Mi      57.47Mi
nginx                  54m       319m      169.90m   2720Mi    5166Mi    4946.55Mi
istio-system           2m        147m      12.16m    144Mi     240Mi     213.98Mi
TOTAL                  57m       478m      191.79m   2917Mi    5466Mi    5218.00Mi
```

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.098ms
Latencies     [min, mean, 50, 90, 95, 99, max]  658.031µs, 1.117ms, 1.054ms, 1.434ms, 1.575ms, 1.888ms, 20.059ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   2m        19m       17.33m    53Mi      54Mi      53.05Mi
nginx                  114m      183m      175.72m   4883Mi    4967Mi    4926.17Mi
istio-system           2m        5m        2.88m     195Mi     211Mi     206.07Mi
TOTAL                  118m      207m      195.93m   5131Mi    5232Mi    5185.29Mi
```

## Summary / Takeaways

Latency generally is unaffected by more pods/requests (max latency is higher with more pods but overall results are similar).

No failures were hit even at small scale with lots of requests.

Istio namespaces generally remain stable in resource usage past a few pods.

Generally per-pod resources used were ~3 millicores of CPU, and ~50Mi of memory (total per nginx pod).