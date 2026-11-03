// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"encoding/json"
	"flag"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/buildinfo"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	options := controller.DefaultRunOptions()
	qps := flag.Float64("kube-api-qps", float64(options.KubernetesAPIQPS), "Reconciliation Kubernetes API request budget per second (1-200)")
	flag.IntVar(&options.KubernetesAPIBurst, "kube-api-burst", options.KubernetesAPIBurst, "Reconciliation Kubernetes API request burst (1-400)")
	infoOnly := flag.Bool("build-info", false, "Print compiler flavor and FIPS state without starting the controller")
	flag.Parse()
	if err := buildinfo.Check(); err != nil {
		slog.Error("invalid controller crypto mode", "error", err)
		os.Exit(1)
	}
	if *infoOnly {
		_ = json.NewEncoder(os.Stdout).Encode(buildinfo.Current())
		return
	}
	slog.Info("Controller build", "build", buildinfo.Current())
	options.KubernetesAPIQPS = float32(*qps)
	level := slog.LevelInfo
	switch os.Getenv("UDS_LOG_LEVEL") {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctrl, err := controller.NewControllerWithOptions(ctx, options)
	if err == nil {
		err = ctrl.Run(ctx)
	}
	if err != nil {
		slog.Error("controller stopped", "error", err)
		os.Exit(1)
	}
}
