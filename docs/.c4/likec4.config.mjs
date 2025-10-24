/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig } from 'likec4/config'

export default defineConfig({
  name: 'uds-core-arch-diagrams',
  sources: ['./docs/.c4'],
  outDir: './docs/.c4/diagrams',
})
