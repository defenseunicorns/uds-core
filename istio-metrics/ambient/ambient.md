# Ambient

## Setup

Run the setup script which will install slim dev + metrics server + nginx (from uds-common). Post-install it will patch several changes to make our test perform better: `./setup.sh`

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.558ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.492ms, 4.169ms, 3.931ms, 6.514ms, 7.461ms, 9.99ms, 82.096ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   5m        29m       24.05m    31Mi      41Mi      34.10Mi
nginx                  1m        7m        5.88m     9Mi       10Mi      9.05Mi
istio-system           7m        13m       10.68m    73Mi      109Mi     84.63Mi
TOTAL                  13m       49m       40.61m    113Mi     160Mi     127.78Mi
```

Similar to sidecar.

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.455ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.164ms, 2.755ms, 2.506ms, 3.895ms, 4.218ms, 4.7ms, 95.925ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        42m       36.15m    31Mi      32Mi      31.05Mi
nginx                  1m        12m       10.54m    9Mi       10Mi      9.92Mi
istio-system           5m        18m       15.05m    71Mi      72Mi      71.61Mi
TOTAL                  12m       72m       61.75m    111Mi     114Mi     112.58Mi
```

Similar to sidecar.

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 5.712ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.477ms, 4.246ms, 3.92ms, 7.185ms, 8.066ms, 10.128ms, 48.126ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   5m        31m       24.61m    32Mi      35Mi      33.27Mi
nginx                  10m       12m       10.27m    91Mi      91Mi      91.00Mi
istio-system           6m        13m       11.05m    73Mi      84Mi      77.22Mi
TOTAL                  21m       56m       45.93m    196Mi     210Mi     201.49Mi
```

A bit over 1/3 the sidecar CPU.

A bit over 1/3 the sidecar memory.

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.09ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.067ms, 2.748ms, 2.544ms, 3.88ms, 4.192ms, 4.619ms, 68.801ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   5m        42m       36.78m    32Mi      32Mi      32.00Mi
nginx                  10m       20m       18.41m    91Mi      91Mi      91.00Mi
istio-system           5m        19m       15.71m    73Mi      80Mi      75.12Mi
TOTAL                  20m       81m       70.90m    196Mi     203Mi     198.12Mi
```

About 1/2 the sidecar CPU.

A bit over 1/4 the sidecar memory.

### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 4.674ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.46ms, 4ms, 3.686ms, 6.155ms, 7.886ms, 9.962ms, 52.688ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        27m       23.93m    35Mi      41Mi      38.71Mi
nginx                  40m       50m       49.83m    451Mi     451Mi     451.00Mi
istio-system           4m        19m       11.51m    86Mi      113Mi     104.66Mi
TOTAL                  48m       96m       85.27m    572Mi     605Mi     594.37Mi
```

Less than 1/4 the sidecar CPU.

Less than 1/4 the sidecar memory.

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.997ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.237ms, 2.67ms, 2.398ms, 3.741ms, 4.115ms, 4.677ms, 73.801ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        42m       37.12m    35Mi      38Mi      37.80Mi
nginx                  50m       50m       50.00m    451Mi     451Mi     451.00Mi
istio-system           8m        19m       16.61m    83Mi      86Mi      84.92Mi
TOTAL                  64m       111m      103.73m   569Mi     575Mi     573.71Mi
```

About 1/4 the sidecar CPU.

About 1/5 the sidecar memory.

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.977ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.453ms, 3.826ms, 3.621ms, 5.124ms, 6.902ms, 9.663ms, 71.238ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        28m       24.80m    41Mi      45Mi      43.05Mi
nginx                  90m       90m       90.00m    811Mi     811Mi     811.00Mi
istio-system           6m        23m       13.59m    93Mi      131Mi     111.68Mi
TOTAL                  102m      141m      128.39m   945Mi     987Mi     965.73Mi
```

About 1/5 the sidecar CPU.

About 1/5 the sidecar memory.

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.248ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.21ms, 2.583ms, 2.338ms, 3.504ms, 3.938ms, 4.548ms, 72.451ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   9m        41m       37.08m    41Mi      51Mi      44.78Mi
nginx                  90m       90m       90.00m    811Mi     811Mi     811.00Mi
istio-system           10m       18m       16.83m    93Mi      103Mi     97.88Mi
TOTAL                  109m      149m      143.92m   945Mi     965Mi     953.66Mi
```

Less than 1/4 the sidecar CPU.

About 1/5 the sidecar memory.

## Summary / Takeaways

Latency is overall slightly lower on ambient compared to sidecar, especially with more replicas/loadbalancing (peaks / 99% are a fraction of sidecar).

No failures were hit even at small scale with lots of requests.

Istio-system CPU resource usage increases with ambient, although it is still relatively low. Memory stays pretty steady.

Nginx namespace resources decrease by about the expected amount of a sidecar (40Mi memory and 8m CPU).

Ambient resource usage is similar to sidecar on a single pod, but decreases exponentially with increased pod counts and requests (1/2, 1/3, 1/4, 1/5).
