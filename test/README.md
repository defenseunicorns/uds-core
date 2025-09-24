# UDS Core Testing Guide

This guide explains how UDS Core approaches testing, the types of tests used, where they live, and how to run them—both locally and in CI. It is intended for developers contributing to UDS Core.

---

## Testing Philosophy

UDS Core maintains a clear distinction between:

- **Unit Tests**: Fast, isolated, colocated with the code they test. No cluster or external dependencies required.
- **Non-Unit Tests**: All other tests (integration, e2e, journey, system, etc.) that require a cluster, multiple components, or end-to-end flows. These are grouped in the `test/` directory.

This separation ensures clarity, fast feedback for code changes, and scalable test management.

---

## Test Locations

- **Unit Tests**:
  - Located directly next to the code in `src/pepr/**` (e.g., `src/pepr/foo/foo.spec.ts`).
  - Only test the logic of the module, using mocks as needed.

- **Non-Unit Tests**:
  - Located in the `test/` directory.
  - Includes integration, e2e, journey, and system tests.
  - Subdirectories may include:
    - `test/playwright/` — Browser-driven E2E tests
    - `test/vitest/` — Cluster-level integration/system tests

---

## How Tests Are Run

### Unit Tests

- **Via UDS Task (CI & Local):**
  - Run the `validate` task for Pepr:
    ```sh
    uds run -f src/pepr/tasks.yaml validate
    ```
  - This runs `npx vitest src/pepr` and executes all unit tests colocated in `src/pepr`.

- **Directly with Vitest (Local):**
  - From the root of the repo:
    ```sh
    npx vitest run
    ```
  - The root `vitest.config.js` is configured to only include unit tests in `src/pepr` and to exclude tests in `test/`.

### Non-Unit Tests (`test/` directory)

- **Via UDS Task (CI & Local):**
  - Run the `e2e-tests` task:
    ```sh
    uds run -f tasks/test.yaml e2e-tests
    ```
  - This will run all tests in the `test/` directory.

- **Directly with Vitest (Local):**
  - From within the `test/vitest` directory:
    ```sh
    npx vitest run
    ```
  - This runs only the vitest tests.

- **Directly with Playwright (Local):**
  - From within the `test/playwright` directory:
    ```sh
    npx playwright test
    ```
  - This runs all playwright tests.

### Running Individual Test Files

- **Vitest (Unit or Integration):**
  ```sh
  npx vitest run path/to/file.spec.ts
  ```
- **Playwright:**
  ```sh
  npx playwright test path/to/file.test.ts
  ```
