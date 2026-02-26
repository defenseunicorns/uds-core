---
title: Publish a bundle to UDS Registry
sidebar:
  order: 3
---

# Packaging Applications
This section teaches application developers and platform engineers how to package their applications for deployment with UDS Core. It addresses the critical need for customers and partners (like the Foundry team) to package their own applications, not just deploy pre-packaged Core components.

**Key topics covered:**
- Understanding UDS packages vs. Zarf packages vs. Helm charts
- Creating packages from scratch
- Packaging existing Helm charts
- Integrating packages with UDS Core features (SSO, networking, monitoring)
- Publishing and versioning packages
- Building bundles that combine multiple packages
- Advanced topics: overrides, external dependencies, air-gap packaging

**Why it's critical:** This enables the UDS ecosystem to scale beyond Defense Unicorns-provided packages. Customers can package their own applications, integrators can package third-party tools, and the Foundry team can document packaging best practices for their customers.

**Target audience:** 
- Application developers packaging their apps for UDS
- Platform engineers creating custom bundles
- Partners and customers extending UDS with their own packages

#### Source Material from Previous Docs

This section draws on:
- `src/content/docs-old/structure/packages.md` (conceptual understanding of packages)
- `src/content/docs-old/structure/bundles.md` (how bundles work)
- `src/content/docs-old/tutorials/create-uds-package.md` (hands-on package creation)
- `src/content/docs-old/tutorials/add-package-to-bundle.md` (bundle integration)
- `src/content/docs-old/reference/bundles/overview.md` (bundle structure details)
- `src/content/docs-old/reference/bundles/overrides.md` (configuration patterns)
- `src/content/docs-old/reference/configuration/uds-operator/package.md` (Package CR reference)

**Note:** This section will likely grow significantly as the Foundry team contributes packaging patterns and customer-facing guidance.
