// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package controller

import (
	"context"
	"fmt"
	"math"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"

	"k8s.io/client-go/rest"
)

type RunOptions struct {
	KubernetesAPIQPS   float32
	KubernetesAPIBurst int
}

func DefaultRunOptions() RunOptions {
	return RunOptions{KubernetesAPIQPS: 20, KubernetesAPIBurst: 40}
}

func (o RunOptions) Validate() error {
	qps := float64(o.KubernetesAPIQPS)
	if math.IsNaN(qps) || math.IsInf(qps, 0) || qps < 1 || qps > 200 {
		return fmt.Errorf("Kubernetes API QPS must be between 1 and 200")
	}
	if o.KubernetesAPIBurst < 1 || o.KubernetesAPIBurst > 400 {
		return fmt.Errorf("Kubernetes API burst must be between 1 and 400")
	}
	return nil
}

func NewControllerWithOptions(ctx context.Context, options RunOptions) (*Controller, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	if err := featureflags.Load().ValidateOwnership(); err != nil {
		return nil, err
	}
	base, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get in-cluster config: %w", err)
	}
	return &Controller{config: optionsClientConfig(base, options)}, nil
}

func optionsClientConfig(base *rest.Config, options RunOptions) *rest.Config {
	config := rest.CopyConfig(base)
	if config.QPS == 0 {
		config.QPS = options.KubernetesAPIQPS
	}
	if config.Burst == 0 && config.QPS > 0 {
		config.Burst = options.KubernetesAPIBurst
	}
	config = controllerClientConfig(config)
	return config
}
