# Service Mesh Performance Comparison: Linkerd vs. Istio (Ambient & Sidecar)

This document presents the results of a performance benchmark comparing three service mesh implementations: **Linkerd**, **Istio Ambient**, and **Istio with Sidecars**. The tests were conducted using a consistent methodology, varying request rates and the number of service pods to simulate different load and scaling scenarios. Key performance indicators (KPIs) measured include **Mean Latency** (average request response time), **Average CPU Usage**, and **Average Memory Usage**. The best-performing (lowest) value for each metric in each test is indicated with **bold italics**.

| Test Scenario                  | Metric      | Linkerd (Value) | Istio Ambient (Value) | Istio Sidecar (Value) |
|--------------------------------|-------------|-----------------|-----------------------|-----------------------|
| 20 Requests/Sec, Single Pod    | Mean Latency  | ***0.453ms*** | 0.880ms               | 1.036ms               |
|                                | Avg CPU       | ***8.25m***   | 14.60m                | 16.53m                |
|                                | Avg Memory    | 196.00Mi      | ***166.21Mi***        | 187.79Mi              |
| 50 Requests/Sec, Single Pod    | Mean Latency  | ***0.346ms*** | 0.693ms               | 0.879ms               |
|                                | Avg CPU       | ***11.20m***  | 25.03m                | 30.45m                |
|                                | Avg Memory    | 196.20Mi      | ***168.22Mi***        | 185.16Mi              |
| 20 Requests/Sec, 10 Pods       | Mean Latency  | ***0.447ms*** | 0.939ms               | 1.19ms                |
|                                | Avg CPU       | ***16.54m***  | 25.03m                | 39.60m                |
|                                | Avg Memory    | 445.02Mi      | ***258.02Mi***        | 644.71Mi              |
| 50 Requests/Sec, 10 Pods       | Mean Latency  | ***0.359ms*** | 0.745ms               | 0.998ms               |
|                                | Avg CPU       | ***20.07m***  | 32.98m                | 51.03m                |
|                                | Avg Memory    | 321.19Mi      | ***272.60Mi***        | 653.88Mi              |
| 20 Requests/Sec, 50 Pods       | Mean Latency  | ***0.499ms*** | 1.011ms               | 1.263ms               |
|                                | Avg CPU       | ***56.22m***  | 71.50m                | 105.60m               |
|                                | Avg Memory    | 823.81Mi      | ***653.21Mi***        | 2864.38Mi             |
| 50 Requests/Sec, 50 Pods       | Mean Latency  | ***0.376ms*** | 0.797ms               | 1.055ms               |
|                                | Avg CPU       | ***61.71m***  | 74.81m                | 114.86m               |
|                                | Avg Memory    | 860.00Mi      | ***675.76Mi***        | 2918.98Mi             |
| 20 Requests/Sec, 90 Pods       | Mean Latency  | ***0.499ms*** | 1.052ms               | 1.353ms               |
|                                | Avg CPU       | 125.56m       | ***107.17m***         | 191.79m               |
|                                | Avg Memory    | 1413.19Mi     | ***1105.33Mi***       | 5218.00Mi             |
| 50 Requests/Sec, 90 Pods       | Mean Latency  | ***0.381ms*** | 0.822ms               | 1.117ms               |
|                                | Avg CPU       | ***102.37m*** | 116.67m               | 195.93m               |
|                                | Avg Memory    | 1468.93Mi     | ***1097.17Mi***       | 5185.29Mi             |


# Summary

Linkerd consistenly performs with the lowest latency and average CPU usage. Istio Ambient outperforms both Linkerd and Istio Sidecar on memory usage by a clear margin which only continues to grow as the workloads scale.

# Differences Between Scenarios
The Linkerd tests were performed in the most optimized scenario of `http` traffic being sent to a NodePort that is connected directly to the test workloads service. This contributed significantly the the low request latency. 
The Istio tests were performed with `https` traffic being sent to an Istio Gateway. The additional network hop and overhead of TLS added to the request latency observed for both Sidecar and Ambient

Additional testing should be done around purely service to service traffic as well as Istio behind a NodePort with `http` traffic for true latency comparisons.