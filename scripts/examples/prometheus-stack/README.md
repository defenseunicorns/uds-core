```console
npx ts-node compareImagesAndCharts.ts --old examples/prometheus-stack/old-extract --new examples/prometheus-stack/new-extract
```

This example should produce waiting on ironbank as well as a major helm update. Specifically the prometheus Ironbank image is on 3.1.0 but should have  a 3.2.0 update.
