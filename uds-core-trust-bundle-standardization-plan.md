# UDS Core Trust Bundle Standardization Plan

**Goal**: Ensure all UDS Core applications automatically mount and make available the UDS Core CA bundle by default, with trust by default where components honor standard trust mechanisms.

**Created**: 2026-02-02  
**Status**: 🟡 Planning Phase  
**Last Updated**: 2026-02-02

---

## Executive Summary

Today, only Keycloak and Grafana automatically mount the UDS Core trust bundle, creating inconsistent behavior across applications. This plan standardizes trust bundle mounting across all UDS Core applications while maintaining flexibility for overrides and respecting container image flavor differences.

---

## Current State Analysis

### ✅ Completed Analysis

**Applications that auto-mount trust bundle:**
- **Keycloak**: Mounts `uds-trust-bundle` at `/tmp/ca-certs` with `truststorePaths` configuration
- **Grafana**: Mounts `uds-trust-bundle` at `/etc/ssl/certs/ca.pem` via `extraConfigmapMounts`

**Applications that DON'T auto-mount trust bundle:**
- **Falco**: No trust bundle mounting in values.yaml
- **Loki**: No trust bundle mounting in values.yaml  
- **Vector**: No trust bundle mounting in values.yaml
- **Velero**: No trust bundle mounting in values.yaml
- **Prometheus-stack**: No trust bundle mounting in values.yaml
- **Metrics-server**: No trust bundle mounting in values.yaml

**Platform Components** (already handled by UDS Operator):
- **Authservice**: Gets bundle via UDS Operator configuration
- **Istio**: Gets bundle via UDS Operator configuration

### 🎯 Key Decision: Container Flavor Considerations

**Important**: UDS Core supports multiple image flavors with different CA bundle paths:
- **Upstream**: Debian/Ubuntu-based (`/etc/ssl/certs/ca-certificates.crt`)
- **Registry1**: RedHat-based (`/etc/pki/tls/certs/ca-bundle.crt`)
- **Unicorn**: Various base images

**Decision**: Prefer Go standard path `/etc/ssl/certs/ca.pem` for distro-agnostic mounting where possible.

---

## Implementation Plan

### Phase 1: Standardize Auto-Mounting Pattern
**Status**: ⏳ Not Started  
**Priority**: High

**Target Applications** (need trust bundle for external TLS connections):
- [ ] **Velero** (backup storage services)
- [ ] **Loki** (object storage backends) 
- [ ] **Vector** (external data sources)
- [ ] **Falco** (external alert destinations)
- [ ] **Prometheus-stack** (external datasources - see considerations below)

**Deferred Applications** (validate need before implementation):
- [ ] **Metrics-server** (default: no external TLS usage expected)

**Implementation Pattern** (Go standard path):
```yaml
extraVolumes:
  - name: ca-certs
    configMap:
      name: uds-trust-bundle
      optional: true

extraVolumeMounts:
  - name: ca-certs
    mountPath: /etc/ssl/certs/ca.pem  # Go standard, distro-agnostic
    readOnly: true
    subPath: ca-bundle.pem
```

**ConfigMap key**: `ca-bundle.pem` (PEM bundle)

**Default semantics**: "Provide UDS bundle as an additional CA file (does not modify system CA store)."

**Alternative Pattern** (system CA replacement, use sparingly):
```yaml
extraVolumeMounts:
  - name: ca-certs
    mountPath: /etc/ssl/certs/ca-certificates.crt  # Debian/Ubuntu
    readOnly: true
    subPath: ca-bundle.pem
```

**Note**: This is a replacement strategy that overwrites the system CA store and should only be used when applications don't respect additional CA files.

### Phase 2: Documentation Updates
**Status**: ⏳ Not Started  
**Priority**: High

**Documentation Files to Update:**
- [ ] `/docs/reference/configuration/trust-management/private-pki.md`
- [ ] `/docs/reference/configuration/trust-management/central-trust-bundle-management.md`

**Key Changes:**
- Remove language implying auto-mounting is special to Keycloak/Grafana
- Add clear statement: "All UDS Core applications automatically mount the UDS Core CA trust bundle by default"
- Update component-specific sections to reflect default behavior
- Add override guidance and flavor-specific considerations

### Phase 3: Override Protection
**Status**: ⏳ Not Started  
**Priority**: Medium

**Safeguards to Add:**
- Document that overriding volume mounts disables auto-mounting
- Provide examples of merging custom mounts with defaults
- Add warnings about breaking automatic trust when overriding

### Phase 4: Testing Strategy
**Status**: ⏳ Not Started  
**Priority**: High

**Testing Requirements:**
- [ ] Test TLS connections with private PKI for each application
- [ ] Verify override behavior works correctly
- [ ] Test optional mounting doesn't break deployments without trust bundle
- [ ] Validate across all image flavors (upstream, registry1, unicorn)
- [ ] Verify documentation examples are accurate

### Phase 5: Migration Path
**Status**: ⏳ Not Started  
**Priority**: Medium

**Backward Compatibility:**
- All changes are additive (new default mounts)
- Existing overrides continue to work but disable auto-mounting
- Clear upgrade path documentation for users with existing overrides

---

## Important Decisions & Notes

### 🎯 Decision: Go Standard Path Preference
**Date**: 2026-02-02  
**Rationale**: 
- Distro-agnostic (works across Debian/Ubuntu and RedHat)
- Non-destructive (doesn't replace system CA bundle)
- Go ecosystem standard (most UDS Core apps are Go-based)
- Minimal risk compared to system CA replacement

### 🎯 Decision: Flavor-Aware Implementation
**Date**: 2026-02-02  
**Rationale**: Must respect different container base images and their CA bundle locations.

### 🎯 Assumption: Single Source of Truth
**Date**: 2026-02-02  
**Statement**: `uds-trust-bundle` ConfigMap remains the single, canonical source of trusted CAs in UDS Core. All applications should reference this ConfigMap rather than creating duplicate trust sources.

### 📝 Note: Trust Availability vs Trust Usage
Auto-mounting ensures the UDS Core CA bundle is **available** to applications. Some components may still require:
- Environment variables (e.g. `SSL_CERT_FILE`)
- Application-level TLS configuration

to actively **use** the mounted trust bundle. This distinction protects against future bug reports framed as "the plan doesn't work."

### 📝 Note: Prometheus-stack Considerations
Prometheus-stack contains multiple subcomponents that may require validation:
- **Prometheus**: external scrape targets, remote_write
- **Alertmanager**: webhook destinations  
- **Thanos** (if enabled): object storage backends

Each subcomponent may require validation that it consumes the mounted CA bundle.

### 📝 Note: Metrics-server Priority
**Default**: No external TLS usage expected  
**Action**: Validate need before adding mount  
**Status**: Not required for initial standardization success

---

## Implementation Checklist

### Velero
- [ ] Add trust bundle mounting to values.yaml
- [ ] Test successful backup to S3-compatible endpoint with private PKI
- [ ] Verify across image flavors

### Loki
- [ ] Add trust bundle mounting to values.yaml
- [ ] Test successful object-store operations (init + read/write) using private PKI
- [ ] Verify across image flavors

### Vector
- [ ] Add trust bundle mounting to values.yaml
- [ ] Test successful sink/source connection over TLS to private-PKI endpoint
- [ ] Verify across image flavors

### Falco
- [ ] Add trust bundle mounting to values.yaml
- [ ] Test successful webhook delivery over TLS to private-PKI endpoint
- [ ] Verify across image flavors

### Prometheus-stack
- [ ] Add trust bundle mount to Prometheus, Alertmanager, and Thanos (if enabled)
- [ ] Test external scrape targets with private PKI (Prometheus)
- [ ] Test webhook delivery over TLS to private-PKI endpoint (Alertmanager)
- [ ] Test object-store operations with private PKI (Thanos, if enabled)
- [ ] Verify across image flavors

### Metrics-server
- [ ] Assess if external TLS connections needed
- [ ] Add trust bundle mounting if required
- [ ] Test across image flavors
- [ ] **Status**: Deferred - validate need before implementation

---

## Documentation Tasks

### Private PKI Documentation
- [ ] Update intro to reflect universal auto-mounting
- [ ] Update each component section
- [ ] Add flavor-specific guidance
- [ ] Add override protection warnings

### Central Trust Bundle Documentation
- [ ] Add section on automatic application mounting
- [ ] Clarify default behavior across all applications

---

## Testing Checklist

### Functional Testing
- [ ] Private PKI TLS connections work
- [ ] Public PKI still works
- [ ] DoD certs work when enabled
- [ ] Optional mounting works without trust bundle

### Flavor Testing
- [ ] Upstream images (Debian/Ubuntu)
- [ ] Registry1 images (RedHat)
- [ ] Unicorn images (various bases)

### Override Testing
- [ ] Custom volume mounts work
- [ ] Merge with defaults examples work
- [ ] Clear error messages when misconfigured

---

## Risk Assessment

### Low Risk
- Additive changes only
- Backward compatible
- Optional mounting prevents breakage

### Medium Risk
- Override behavior changes
- Documentation accuracy critical
- Flavor-specific testing required

### Mitigation Strategies
- Comprehensive testing across all scenarios
- Clear documentation and examples
- Gradual rollout with verification

---

## Success Criteria

1. ✅ All UDS Core applications auto-mount trust bundle by default
2. ✅ Consistent behavior across all applications
3. ✅ Documentation clearly states universal auto-mounting
4. ✅ Users can override when needed with clear guidance
5. ✅ Works across all image flavors
6. ✅ Backward compatibility maintained

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Initial plan creation | Cascade |
| 2026-02-02 | Added refinements: Trust availability vs usage distinction, Prometheus-stack subcomponents, Metrics-server de-prioritization, Single source of truth assumption | Cascade |
| 2026-02-02 | Added tightening refinements: Explicit ConfigMap key, append vs replace semantics, explicit Prometheus-stack targets, validation methods per component, precise goal wording | Cascade | |

---

## Next Steps

1. **Review and approve this plan** with stakeholders
2. **Begin Phase 1 implementation** starting with Velero (highest impact)
3. **Update documentation** as changes are made
4. **Test thoroughly** across all scenarios
5. **Communicate changes** to users and update release notes

---

*Refer back to this plan throughout the implementation process. Update it with any new decisions, issues discovered, or changes in approach.*
