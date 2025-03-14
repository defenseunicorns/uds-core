# Ambient
Tests were executed on a RHEL8.10 VM running `k3s` and `istio`. System resources were set to 32GB RAM and 12 cores.

```
Capacity:
  cpu:                12
  ephemeral-storage:  64296272Ki
  hugepages-2Mi:      0
  memory:             31878156Ki
  pods:               110
Allocatable:
  cpu:                12
  ephemeral-storage:  62547413353
  hugepages-2Mi:      0
  memory:             31878156Ki
  pods:               110
System Info:
  Machine ID:                 74e0437d08524e8791be3c00c81a857a
  System UUID:                74e0437d-0852-4e87-91be-3c00c81a857a
  Boot ID:                    f8c8dc90-2524-4f18-862e-1ca1ef101fcd
  Kernel Version:             4.18.0-553.44.1.el8_10.x86_64
  OS Image:                   Red Hat Enterprise Linux 8.10 (Ootpa)
  Operating System:           linux
  Architecture:               amd64
```

## Setup

Setup was done by running the [setup script](../../k3s_setup.sh) using 3 known free IPs on the subnet:
```
./k3s_setup.sh --admin-ip <IP> --tenant-ip <IP> --passthrough-ip <IP> --ambient
```
This configured `k3s` with `metallb` then installs UDS Core Base and configures `nginx` to be used as a test application.

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.
ex:
```
/test.sh --target https://nginx.uds.dev --replicas 50 --rate 50
```

### 20 requests per second to a single Pod

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 706.584µs
Latencies     [min, mean, 50, 90, 95, 99, max]  465.438µs, 880.658µs, 845.884µs, 1.137ms, 1.254ms, 1.537ms, 21.97ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        9m        7.67m     46Mi      47Mi      46.17Mi
nginx                  1m        3m        2.00m     10Mi      10Mi      10.00Mi
istio-system           3m        6m        4.93m     107Mi     111Mi     110.03Mi
TOTAL                  5m        18m       14.60m    163Mi     168Mi     166.21Mi
```
Similar to sidecar

### 50 requests per second to a single Pod

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 536.947µs
Latencies     [min, mean, 50, 90, 95, 99, max]  382.5µs, 693.638µs, 659.389µs, 911.766µs, 1.087ms, 1.432ms, 16.234ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        17m       14.91m    47Mi      47Mi      47.00Mi
nginx                  1m        5m        3.79m     10Mi      11Mi      10.22Mi
istio-system           3m        8m        6.33m     111Mi     111Mi     111.00Mi
TOTAL                  5m        30m       25.03m    168Mi     169Mi     168.22Mi
```
Similar to sidecar

### 20 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 942.355µs
Latencies     [min, mean, 50, 90, 95, 99, max]  506.21µs, 939.925µs, 899.61µs, 1.196ms, 1.33ms, 1.771ms, 16.926ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        9m        8.38m     47Mi      49Mi      48.90Mi
nginx                  1m        39m       11.16m    10Mi      101Mi     94.17Mi
istio-system           3m        10m       5.50m     111Mi     116Mi     114.95Mi
TOTAL                  5m        58m       25.03m    168Mi     266Mi     258.02Mi
```
~1/2 sidecar CPU and memory

### 50 requests per second loadbalanced between 10 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 506.723µs
Latencies     [min, mean, 50, 90, 95, 99, max]  411.264µs, 745.339µs, 700.842µs, 974.127µs, 1.117ms, 1.42ms, 19.797ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   2m        18m       15.67m    49Mi      54Mi      53.26Mi
nginx                  10m       10m       10.00m    100Mi     101Mi     100.21Mi
istio-system           4m        9m        7.31m     113Mi     121Mi     119.14Mi
TOTAL                  16m       37m       32.98m    262Mi     276Mi     272.60Mi
```
~1/2 sidecar CPU and memory


### 20 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.215ms
Latencies     [min, mean, 50, 90, 95, 99, max]  555.906µs, 1.011ms, 953.104µs, 1.263ms, 1.41ms, 2.263ms, 17.876ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   1m        11m       9.22m     52Mi      58Mi      56.97Mi
nginx                  10m       162m      54.28m    100Mi     500Mi     471.64Mi
istio-system           3m        56m       8.00m     113Mi     128Mi     124.60Mi
TOTAL                  14m       229m      71.50m    265Mi     686Mi     653.21Mi
```
1/2 sidecar CPU and 1/4 sidecar memory

### 50 requests per second loadbalanced between 50 Pods

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 852.02µs
Latencies     [min, mean, 50, 90, 95, 99, max]  451.65µs, 797.457µs, 744.294µs, 1.035ms, 1.188ms, 1.563ms, 19.845ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   2m        20m       16.81m    53Mi      54Mi      53.60Mi
nginx                  50m       50m       50.00m    499Mi     500Mi     499.05Mi
istio-system           3m        10m       8.00m     123Mi     124Mi     123.10Mi
TOTAL                  55m       80m       74.81m    675Mi     678Mi     675.76Mi
```
1/2 sidecar CPU and 1/4 sidecar memory

### 20 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         6000, 20.00, 20.00
Duration      [total, attack, wait]             5m0s, 5m0s, 1.171ms
Latencies     [min, mean, 50, 90, 95, 99, max]  569.273µs, 1.052ms, 983.636µs, 1.316ms, 1.444ms, 3.036ms, 18.242ms
Bytes In      [total, mean]                     3690000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:6000
Error Set:
```
~30% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   2m        19m       10.60m    55Mi      62Mi      60.97Mi
nginx                  89m       92m       90.02m    860Mi     901Mi     895.43Mi
istio-system           4m        12m       6.55m     135Mi     157Mi     148.93Mi
TOTAL                  95m       123m      107.17m   1050Mi    1120Mi    1105.33Mi
```
1/2 sidecar CPU and 1/5 sidecar memory

### 50 requests per second loadbalanced between 90 Pods (max pods per node default)

```
Requests      [total, rate, throughput]         15000, 50.00, 50.00
Duration      [total, attack, wait]             5m0s, 5m0s, 6.115ms
Latencies     [min, mean, 50, 90, 95, 99, max]  458.776µs, 822.319µs, 762.821µs, 1.08ms, 1.24ms, 1.759ms, 15.948ms
Bytes In      [total, mean]                     9225000, 615.00
Bytes Out     [total, mean]                     0, 0.00
Success       [ratio]                           100.00%
Status Codes  [code:count]                      200:15000
Error Set:
```
~20% lower latency than sidecar

```
Namespace              CPU_min   CPU_max   CPU_avg   Mem_min   Mem_max   Mem_avg
istio-tenant-gateway   2m        20m       18.22m    60Mi      62Mi      60.28Mi
nginx                  90m       90m       90.00m    900Mi     900Mi     900.00Mi
istio-system           4m        10m       8.45m     135Mi     138Mi     136.90Mi
TOTAL                  96m       120m      116.67m   1095Mi    1100Mi    1097.17Mi
```
1/2 sidecar CPU and 1/5 sidecar memory


## Summary / Takeaways

Latency is overall slightly lower on ambient compared to sidecar, especially with more replicas/loadbalancing (peaks / 99% are a fraction of sidecar).

No failures were hit even at small scale with lots of requests.

Istio-system CPU resource usage increases with ambient, although it is still relatively low. Memory stays pretty steady.

Nginx namespace resources decrease by about the expected amount of a sidecar (50Mi memory and 3m CPU).

Ambient resource usage is similar to sidecar on a single pod, but decreases with increased pod counts and requests (1/2, 1/3, 1/4, 1/5).