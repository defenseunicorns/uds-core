// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import apierrors "k8s.io/apimachinery/pkg/api/errors"

func isNotFound(err error) bool { return apierrors.IsNotFound(err) }
