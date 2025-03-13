# Service Mesh Performance Comparison: Linkerd vs. Istio (Ambient & Sidecar)

This document presents the results of a performance benchmark comparing three service mesh implementations: **Linkerd**, **Istio Ambient**, and **Istio with Sidecars**. The tests were conducted using a consistent methodology, varying request rates and the number of service pods to simulate different load and scaling scenarios. Key performance indicators (KPIs) measured include **Mean Latency** (average request response time), **Average CPU Usage**, and **Average Memory Usage**.  The best-performing (lowest) value for each metric in each test is indicated with **bold italics**.

| Test Scenario                                    | Metric         | Linkerd (Value)        | Istio Ambient (Value) | Istio Sidecar (Value) |
| :----------------------------------------------- | :------------- | :--------------------- | :-------------------- | :--------------------- |
| 20 Requests/Sec, Single Pod                     | Mean Latency   | ***0.45ms***          | 4.17ms                | 5.53ms                  |
|                                                  | Avg CPU        | ***8.25m***           | 40.61m               | 47.47m                 |
|                                                  | Avg Memory     | 196.00Mi               | ***127.78Mi***              | 126.25Mi                |
| 50 Requests/Sec, Single Pod                     | Mean Latency   | ***0.35ms***          | 2.76ms                | 3.83ms                  |
|                                                  | Avg CPU        | ***11.20m***          | 61.75m               | 67.71m                 |
|                                                  | Avg Memory     | 196.20Mi        | ***112.58Mi***              | 126.31Mi                |
| 20 Requests/Sec, 10 Pods                        | Mean Latency   | ***0.45ms***          | 4.25ms                | 4.83ms                  |
|                                                  | Avg CPU        | ***16.54m***          | 45.93m               | 124.51m                |
|                                                  | Avg Memory     | 445.02Mi               | ***201.49Mi***              | 538.78Mi                |
| 50 Requests/Sec, 10 Pods                        | Mean Latency   | ***0.36ms***         | 2.75ms                | 3.49ms                  |
|                                                  | Avg CPU        | ***20.07m***         | 70.90m               | 146.51m                |
|                                                  | Avg Memory     | 321.19Mi        | ***198.12Mi***              | 723.17Mi                |
| 20 Requests/Sec, 50 Pods                        | Mean Latency   | ***0.50ms***          | 4.00ms                | 3.35ms                  |
|                                                  | Avg CPU        | ***56.22m***          | 85.27m               | 372.42m                |
|                                                  | Avg Memory     | 823.81Mi               | ***594.37Mi***              | 2659.05Mi               |
| 50 Requests/Sec, 50 Pods                        | Mean Latency   | ***0.38ms***          | 2.67ms                | 3.20ms                  |
|                                                  | Avg CPU        | ***61.71m***          | 103.73m               | 399.27m                |
|                                                  | Avg Memory     | 860.00Mi       | ***573.71Mi***       | 2797.59Mi                 |
| 20 Requests/Sec, 90 Pods                         | Mean Latency   | ***0.50ms***       | 3.83ms       |  4.55ms                       |
|                                                   | Avg CPU   |   ***125.56m***            |        128.39m   |      617.31m                   |
|                                                  | Avg Memory        |   1413.19Mi              |   ***965.73Mi***          |          4615.66Mi          |
| 50 Requests/Sec, 90 Pods                        | Mean Latency   |   ***0.38ms***    |    2.58ms     |      4.18ms                 |
|                                            | Avg CPU            |    ***102.37m***          |      143.92m     |    615.20m      |
|                                                  | Avg Memory  |     1468.93Mi        |   ***953.66Mi***        |       4566.83Mi               |