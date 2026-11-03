# UDS Core testing guide

Core ships the Go operator and native admission policies in base and every derived distribution. Tests validate the same default installation used by applications.

## Source checks

Run the Go unit, differential, lifecycle, and admission tests from the repository root:

```bash
npm run test:unit
go -C src/go-controller vet ./...
node --test src/go-controller/hack/distribution.test.mjs
```

The frozen pre-replacement suite runs outside the checkout as a compatibility oracle. It does not supply production dependencies:

```bash
npm run test:reference -- --output /absolute/new/evidence-directory
```

Run the chart and values assertions through the repository tasks:

```bash
uds run -f tasks/lint.yaml helm-unittest
uds run -f tasks/test.yaml values-tests
```

## Cluster and browser checks

The existing suites under `test/vitest/` validate policy mutation, rejection, exemptions, networking, identity, monitoring, reload, and resource lifecycle. `test/playwright/` validates rendered application flows. Both exercise the regular installed Core without an operator selector.

With an isolated test cluster selected, run the complete task to create fixtures and execute both suites:

```bash
uds run -f tasks/test.yaml e2e-tests
```

For a focused run against prepared fixtures, execute the suite from its package directory:

```bash
cd test/vitest
npm ci
npx vitest run
```

Run browser checks from their package directory:

```bash
cd test/playwright
npm ci
npx playwright test
```

Preserve suite assertions, retries, and deadlines when changing the implementation. Target the owning resource's events or the Core controller in `uds-system` when diagnosing failures.
