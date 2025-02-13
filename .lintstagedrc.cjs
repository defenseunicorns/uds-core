/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

module.exports = {
    '*': 'codespell',
    '*.ts': (stagedFiles) => [
        'npx pepr format --validate-only'
    ]
}
