---
title: Overview
---

#### What This Section Does and Why

This overview page serves as the roadmap for production deployments. Unlike the demo path (which is simple and linear), production deployments are complex and benefit from seeing the entire journey upfront before diving into details.

**What it accomplishes:**
- Sets expectations for time investment (2-4 hours vs. 15 minutes for demo)
- Provides high-level checklist of all steps
- Shows decision points (cloud vs. on-prem vs. air-gap)
- Links to each detailed step while keeping the big picture visible
- Helps platform engineers plan their deployment and gather prerequisites

**Why it needs an overview:** Production deployments involve coordinating multiple systems (K8s cluster, DNS, certificates, IdP, storage, etc.) and stakeholders (ops team, network team, security team). The overview helps platform engineers understand the full scope before committing to the process, and serves as a checklist they can return to track progress.

**Contrast with Demo Path:** The demo path goes directly to "Step 1: Basic Requirements" because it's simple (install Docker, run one command). Production needs context and planning first.

**Industry precedent:** Kubernetes, AWS EKS, Azure AKS, and other complex platform docs all have "deployment overview" pages before the actual steps.

#### Source Material from Previous Docs

This overview synthesizes content from:
- `src/content/docs-old/getting-started/install-and-deploy-uds.md` (deployment overview sections)
- `src/content/docs-old/tutorials/deploy-with-uds-core.md` (production considerations)
- `src/content/docs-old/tutorials/deploy-uds-on-rke2.md` (production workflow patterns)
- `src/content/docs-old/overview/prerequisites.md` (high-level requirements)
- `src/content/docs-old/reference/uds-core/overview.mdx` (platform architecture context)

The detailed steps (Prerequisites, Build Bundle, Deploy) then expand on each phase with concrete instructions.