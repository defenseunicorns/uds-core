<h1>Service Mesh Performance Comparison: Linkerd vs. Istio (Ambient & Sidecar)</h1>
<p>This document presents the results of a performance benchmark comparing three service mesh implementations: <strong>Linkerd</strong>, <strong>Istio Ambient</strong>, and <strong>Istio with Sidecars</strong>. The tests were conducted using a consistent methodology, varying request rates and the number of service pods to simulate different load and scaling scenarios.  Key performance indicators (KPIs) measured include <strong>Mean Latency</strong> (average request response time), <strong>Average CPU Usage</strong>, and <strong>Average Memory Usage</strong>.  The best-performing value for each metric in each test is highlighted in <span style="color:green">green</span>.</p>
<table>
<thead>
<tr>
<th>Test Scenario</th>
<th>Metric</th>
<th>Linkerd (Value)</th>
<th>Istio Ambient (Value)</th>
<th>Istio Sidecar (Value)</th>
</tr>
</thead>
<tbody>
<tr>
    <td>20 Requests/Sec, Single Pod</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.45ms</span></td>
    <td>4.17ms</td>
    <td>5.53ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">8.25m</span></td>
    <td>40.61m</td>
    <td>47.47m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>196.00Mi</td>
    <td><span style="color:green">127.78Mi</span></td>
    <td>126.25Mi</td>
</tr>
<tr>
    <td>50 Requests/Sec, Single Pod</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.35ms</span></td>
    <td>2.76ms</td>
    <td>3.83ms</td>
</tr>
<tr>
<td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">11.20m</span></td>
    <td>61.75m</td>
    <td>67.71m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>196.20Mi</td>
    <td><span style="color:green">112.58Mi</span></td>
    <td>126.31Mi</td>
</tr>
<tr>
    <td>20 Requests/Sec, 10 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.45ms</span></td>
    <td>4.25ms</td>
    <td>4.83ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">16.54m</span></td>
    <td>45.93m</td>
    <td>124.51m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>445.02Mi</td>
    <td><span style="color:green">201.49Mi</span></td>
    <td>538.78Mi</td>
</tr>
<tr>
    <td>50 Requests/Sec, 10 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.36ms</span></td>
    <td>2.75ms</td>
    <td>3.49ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">20.07m</span></td>
    <td>70.90m</td>
    <td>146.51m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>321.19Mi</td>
    <td><span style="color:green">198.12Mi</span></td>
    <td>723.17Mi</td>
</tr>
<tr>
    <td>20 Requests/Sec, 50 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.50ms</span></td>
    <td>4.00ms</td>
    <td>3.35ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">56.22m</span></td>
    <td>85.27m</td>
    <td>372.42m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>823.81Mi</td>
    <td><span style="color:green">594.37Mi</span></td>
    <td>2659.05Mi</td>
</tr>
<tr>
    <td>50 Requests/Sec, 50 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.38ms</span></td>
    <td>2.67ms</td>
    <td>3.20ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">61.71m</span></td>
    <td>103.73m</td>
    <td>399.27m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>860.00Mi</td>
    <td><span style="color:green">573.71Mi</span></td>
    <td>2797.59Mi</td>
</tr>
<tr>
    <td>20 Requests/Sec, 90 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.50ms</span></td>
    <td>3.83ms</td>
    <td>4.55ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">125.56m</span></td>
    <td>128.39m</td>
    <td>617.31m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>1413.19Mi</td>
    <td><span style="color:green">965.73Mi</span></td>
    <td>4615.66Mi</td>
</tr>
<tr>
    <td>50 Requests/Sec, 90 Pods</td>
    <td>Mean Latency</td>
    <td><span style="color:green">0.38ms</span></td>
    <td>2.58ms</td>
    <td>4.18ms</td>
</tr>
<tr>
    <td></td>
    <td>Avg CPU</td>
    <td><span style="color:green">102.37m</span></td>
    <td>143.92m</td>
    <td>615.20m</td>
</tr>
<tr>
    <td></td>
    <td>Avg Memory</td>
    <td>1468.93Mi</td>
    <td><span style="color:green">953.66Mi</span></td>
    <td>4566.83Mi</td>
</tr>
</tbody>
</table>