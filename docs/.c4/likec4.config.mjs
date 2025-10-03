/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig } from 'likec4/config'

export default defineConfig({
  name: 'uds-core-arch-diagrams',
  sources: ['./docs/.c4'],
  outDir: './docs/.c4/diagrams',
  styles: {
    theme: {
      colors: {
        system: '#144a8f',
        namespace: '#24b0ff',
        pod: '#e6e6e6',
        cluster: '#9e9e9e',
        actor: '#0b1329',
        storage: '#323336',
        external: '#d18484',
        cloud: '#ffffff',
      }
    },
    defaults: {
      border: 'solid',
      opacity: 100,
      relationship: {
        color: 'gray',
        line: 'solid',
        arrow: 'open'
      }
    }
  }
})
