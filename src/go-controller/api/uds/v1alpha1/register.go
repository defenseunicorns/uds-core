// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: LicenseRef-Defense-Unicorns-Commercial

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	// GroupName defines the API group name for the cluster resources.
	GroupName = "uds.dev"
	// SchemeGroupVersion is group version used to register these objects.
	SchemeGroupVersion = schema.GroupVersion{Group: GroupName, Version: "v1alpha1"}
)

// Kind takes an unqualified kind and returns back a Group qualified GroupKind.
func Kind(kind string) schema.GroupKind {
	return SchemeGroupVersion.WithKind(kind).GroupKind()
}

// Resource takes an unqualified resource and returns a Group qualified GroupResource.
func Resource(resource string) schema.GroupResource {
	return SchemeGroupVersion.WithResource(resource).GroupResource()
}

var (
	// SchemeBuilder initializes a scheme builder.
	SchemeBuilder = runtime.NewSchemeBuilder(addKnownTypes)
	// AddToScheme is a global function that registers this API group & version to a scheme.
	AddToScheme = SchemeBuilder.AddToScheme
)

// Adds the list of known types to api.Scheme.
func addKnownTypes(scheme *runtime.Scheme) error {
	// Use AddKnownTypeWithName for UDSPackage/UDSPackageList because the Go struct names
	// have a "UDS" prefix (to avoid the reserved word "package"), but the CRD declares
	// kind: Package / listKind: PackageList. The scheme must match the CRD kind names so
	// that API server responses can be decoded correctly.
	scheme.AddKnownTypeWithName(SchemeGroupVersion.WithKind("Package"), &UDSPackage{})
	scheme.AddKnownTypeWithName(SchemeGroupVersion.WithKind("PackageList"), &UDSPackageList{})
	scheme.AddKnownTypeWithName(SchemeGroupVersion.WithKind("ClusterConfig"), &ClusterConfig{})
	scheme.AddKnownTypeWithName(SchemeGroupVersion.WithKind("ClusterConfigList"), &ClusterConfigList{})
	metav1.AddToGroupVersion(scheme, SchemeGroupVersion)

	return nil
}
