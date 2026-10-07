# 12. Set up K0s in Core CI

Date: 2026-10-07

## Status

Proposed

## Context

Core needs a public, repeatable K0s environment before it deploys and tests a candidate build. Existing downstream artifacts and test runners may provide this later, but their availability, ownership, and fit remain under discussion. The current dynamic image rebuild is fragile.

## Decision

For now, Core CI will create the K0s environment in `tasks/setup.yaml` from public, open-source inputs and initialize it with Zarf. The setup must be explicit and self-contained. Do not introduce a shared package until there is a supported public artifact with clear ownership and demand.

UDS Foundations owns this integration until a shared package is accepted.

## Consequences

This approach has the following consequences:

- The CI setup stays reproducible from the public repository.
- Core owns a small amount of distribution bootstrap logic.
- This does not validate downstream images or replace their integration testing.

## Alternatives considered

The following alternatives remain deferred:

1. **Consume a downstream image or test runner.** Deferred because it is not a public, stable dependency for this workflow.
2. **Create a shared package now.** Deferred until multiple consumers need the same developer experience.
