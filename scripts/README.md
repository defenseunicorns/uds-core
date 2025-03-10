This folder has some of the logic generated for [this design doc](https://www.notion.so/Renovate-Readiness-Automation-1aee512f24fc8079af84fb4be18d133f) as well as some examples to show the code.

To get image lists and test on your own:
```console
npx ts-node getImagesAndCharts.ts --path ../src/<folder>
```

This will produce an `extract` folder under `../src/<folder>`. To perform a comparison, make two of these extract folders (move them as needed) and then run:
```console
npx ts-node compareImagesAndCharts.ts --old <path-to-old-extract> --new <path-to-new-extract>
```
