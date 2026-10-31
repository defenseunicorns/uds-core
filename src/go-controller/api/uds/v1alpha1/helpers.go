// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package v1alpha1

// GetAllow returns the Allow rules from the Network spec, or nil if Network is nil.
func (s Spec) GetAllow() []Allow {
	if s.Network == nil {
		return nil
	}
	return s.Network.Allow
}

// GetExpose returns the Expose rules from the Network spec, or nil if Network is nil.
func (s Spec) GetExpose() []Expose {
	if s.Network == nil {
		return nil
	}
	return s.Network.Expose
}

// GetServiceMeshMode returns the service mesh mode, defaulting to Ambient.
func (s Spec) GetServiceMeshMode() Mode {
	if s.Network != nil && s.Network.ServiceMesh != nil && s.Network.ServiceMesh.Mode != nil {
		return *s.Network.ServiceMesh.Mode
	}
	return Ambient
}
