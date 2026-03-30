// Copyright 2025 Defense Unicorns
// SPDX-License-Identifier: LicenseRef-Defense-Unicorns-Commercial

// This package imports things required by build scripts, to force `go mod` to see them as dependencies
package tools

import (
	_ "k8s.io/code-generator"
	// https://github.com/kubernetes/kubernetes/pull/138104 should fix it, for now
	// we'll need to import that missing tool directly, also all the tooling will
	// complain about it for now, but you can safely ignore that error
	_ "k8s.io/code-generator/cmd/validation-gen"
)
