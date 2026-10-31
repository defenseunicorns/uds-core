// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import "context"

func (m *Management) EndUserSessions(ctx context.Context, userID string) error {
	m.mutations.Lock()
	defer m.mutations.Unlock()
	user, err := m.Directory.Get(ctx, userID)
	if err != nil {
		return err
	}
	user.SessionVersion++
	if err := m.Directory.Save(ctx, user); err != nil {
		return err
	}
	return m.Sessions.RevokeUser(ctx, userID)
}
