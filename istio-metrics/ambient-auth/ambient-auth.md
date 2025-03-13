# Ambient (w/ L4 Auth Policies)

These tests include a few example authorization policies (4 ALLOW policies) to simulate what it might be like if L4 auth policies were implemented to "patch the holes" in network policies. These policies are manually crafted/applied, but should represent approximately what might be created for the average package (somewhere around 2-4 ingresses allowed from namespace -> port).

## Setup

Run the setup script which will install slim dev + metrics server + nginx (from uds-common). Post-install it will patch several changes to make our test perform better: `./setup.sh`

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 9.47ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.571ms, 4.375ms, 3.089ms, 7.305ms, 9.226ms, 19.099ms, 96.483ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        28m       23.93m    32Mi      40Mi      33.76Mi
nginx                  1m        13m       5.88m     9Mi       10Mi      9.14Mi
istio-system           5m        14m       10.85m    69Mi      96Mi      72.37Mi
TOTAL                  10m       55m       40.66m    110Mi     146Mi     115.27Mi
```

Very similar/identical to ambient without auth policies.

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.209ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.251ms, 3.056ms, 2.445ms, 4.202ms, 5.824ms, 13.058ms, 107.592ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        44m       37.68m    32Mi      33Mi      32.05Mi
nginx                  1m        13m       9.92m     9Mi       10Mi      9.92Mi
istio-system           4m        21m       15.42m    69Mi      69Mi      69.00Mi
TOTAL                  11m       78m       63.02m    110Mi     112Mi     110.97Mi
```

Very similar/identical to ambient without auth policies.

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.428ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.516ms, 4.435ms, 3.317ms, 7.658ms, 9.59ms, 15.384ms, 71.545ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        27m       23.05m    34Mi      36Mi      35.00Mi
nginx                  10m       12m       10.27m    91Mi      91Mi      91.00Mi
istio-system           5m        14m       10.53m    73Mi      86Mi      79.25Mi
TOTAL                  19m       53m       43.85m    198Mi     213Mi     205.25Mi
```

Very similar/identical to ambient without auth policies.

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.925ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.435ms, 2.732ms, 2.4ms, 2.896ms, 3.117ms, 11.835ms, 115.03ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        40m       33.27m    37Mi      41Mi      40.39Mi
nginx                  10m       15m       12.51m    91Mi      91Mi      91.00Mi
istio-system           8m        18m       15.44m    76Mi      81Mi      79.14Mi
TOTAL                  24m       73m       61.22m    204Mi     213Mi     210.53Mi
```

Very similar/identical to ambient without auth policies.

### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 3.13ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.57ms, 3.282ms, 2.585ms, 4.564ms, 6.306ms, 15.301ms, 95.791ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   4m        35m       19.54m    39Mi      42Mi      41.08Mi
nginx                  50m       66m       50.27m    451Mi     451Mi     451.00Mi
istio-system           5m        56m       10.93m    81Mi      110Mi     95.49Mi
TOTAL                  59m       157m      80.75m    571Mi     603Mi     587.58Mi
```

Very similar/identical to ambient without auth policies.

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.003ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.391ms, 2.702ms, 2.404ms, 2.915ms, 3.179ms, 10.602ms, 73.137ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   5m        40m       34.58m    38Mi      40Mi      39.83Mi
nginx                  50m       51m       50.05m    451Mi     451Mi     451.00Mi
istio-system           6m        19m       16.22m    81Mi      83Mi      82.73Mi
TOTAL                  61m       110m      100.85m   570Mi     574Mi     573.56Mi
```

Very similar/identical to ambient without auth policies.

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 7.393ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.622ms, 3.375ms, 2.613ms, 5.349ms, 6.711ms, 12.553ms, 67.852ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   8m        26m       20.93m    42Mi      49Mi      46.58Mi
nginx                  90m       92m       90.20m    811Mi     811Mi     811.00Mi
istio-system           9m        22m       12.47m    88Mi      128Mi     112.31Mi
TOTAL                  107m      140m      123.61m   941Mi     988Mi     969.88Mi
```

Very similar/identical to ambient without auth policies.

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 2.478ms
Latencies     [min, mean, 50, 90, 95, 99, max]  1.458ms, 2.715ms, 2.391ms, 2.921ms, 3.136ms, 9.529ms, 80.374ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000  
Error Set:
```

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   6m        44m       35.64m    42Mi      53Mi      47.95Mi
nginx                  90m       92m       90.31m    811Mi     811Mi     811.00Mi
istio-system           7m        20m       16.44m    88Mi      94Mi      91.22Mi
TOTAL                  103m      156m      142.39m   941Mi     958Mi     950.17Mi
```

Very similar/identical to ambient without auth policies.

## Summary / Takeaways

Ambient with a few Authorization Policies performs essentially identical to ambient without any authorization policies.

Latency appeared similar between the two (no significant difference at averages, slightly higher at peaks).
