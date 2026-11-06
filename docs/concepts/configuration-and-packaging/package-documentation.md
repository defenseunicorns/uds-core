---
title: Package Documentation
description: Standard documentation keys for UDS Packages, including configuration guidance and changelogs or curated release notes.
sidebar:
  order: 4.006
---

This page defines standard documentation keys for UDS Packages. These keys provide consistent locations for package information, regardless of the source filenames.

> [!NOTE]
> This page uses [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt) terminology. The `dev.uds.*` documentation keys are UDS-specific conventions, not additional Zarf schema fields or metadata annotations. Zarf packages the referenced files through its existing top-level [`documentation` map](https://docs.zarf.dev/schema/v1alpha1-package/#ZarfPackage).

Define these entries under `documentation` in your root `zarf.yaml` package config:

```yaml title="zarf.yaml"
documentation:
  # Recommended configuration and dependency documentation.
  dev.uds.configuration: docs/configuration.md
  # A cumulative changelog or curated release notes can use this same key.
  dev.uds.release-notes: CHANGELOG.md
```

## Standard documentation keys

You **MUST** include `dev.uds.release-notes` and **SHOULD** include `dev.uds.configuration` in your package. The keys identify the document's purpose; the values point to source files rather than defining required filenames.

| Documentation key | Description | Example source |
| --- | --- | --- |
| `dev.uds.configuration` | Supported configuration, defaults, dependencies, and deployment prerequisites | `docs/configuration.md` |
| `dev.uds.release-notes` | Package release information, provided as a cumulative changelog or curated release notes | `CHANGELOG.md` |

Reference the [Zarf package schema](https://docs.zarf.dev/schema/v1alpha1-package/#ZarfPackage) for the `documentation` field.

## Implementation guidelines

These guidelines define the content and source locations for each entry. Packaged documentation **MUST** include essential information directly so readers can use it without internet access. External links **MAY** supplement that information, but must not replace it.

### Configuration (`dev.uds.configuration`)

Configuration and dependency documentation **SHOULD** live in a root-level `docs` directory. Use `docs/configuration.md` as the recommended entry point, or reference an existing file in that directory.

The configuration document **SHOULD** describe supported settings and defaults, required dependencies, and deployment prerequisites. Follow the [Package Values](/concepts/configuration-and-packaging/package-values/) guidance for exposing and validating configuration.

### Release information (`dev.uds.release-notes`)

Use this entry for either a cumulative changelog or curated release notes. You **MAY** reference an existing root-level `CHANGELOG.md` directly; no separate release notes file is required. If you maintain curated release notes, you can reference a file such as `docs/release-notes.md` instead.

The release document **MUST** identify the packaged version and describe its changes, including any breaking changes or required upgrade actions.

## Related documentation

- [UDS Package Requirements](/concepts/configuration-and-packaging/package-requirements/) - pre-publish checklist for required capabilities and standards.
- [Create a UDS Package](/how-to-guides/packaging-applications/create-uds-package/) - end-to-end guide for packaging an application as a UDS Package.
