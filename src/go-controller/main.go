// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"log/slog"
	"os"

	"github.com/spf13/cobra"
	"k8s.io/apiserver/pkg/server"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller"
)

func main() {
	cmd := &cobra.Command{
		Use:   "controller",
		Short: "UDS Go-base controller",
		Run: func(cmd *cobra.Command, args []string) {
			logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
			slog.SetDefault(logger)
			ctx := server.SetupSignalContext()

			ctrl, err := controller.NewController(ctx)
			if err != nil {
				slog.Error(err.Error())
				os.Exit(1)
			}
			if err := ctrl.Run(ctx); err != nil {
				slog.Error(err.Error())
				os.Exit(1)
			}
		},
	}

	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
