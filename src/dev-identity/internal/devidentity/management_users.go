// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type userRepresentation struct {
	ID              string   `json:"id,omitempty"`
	Username        string   `json:"username"`
	Email           string   `json:"email,omitempty"`
	FirstName       string   `json:"firstName,omitempty"`
	LastName        string   `json:"lastName,omitempty"`
	Enabled         *bool    `json:"enabled,omitempty"`
	EmailVerified   *bool    `json:"emailVerified,omitempty"`
	Groups          []string `json:"groups,omitempty"`
	RequiredActions []string `json:"requiredActions,omitempty"`
	Credentials     []struct {
		Type, Value string
		Temporary   bool
	} `json:"credentials,omitempty"`
}

func publicUser(user User) userRepresentation {
	enabled := user.Enabled
	verified := user.EmailVerified
	return userRepresentation{ID: user.ID, Username: user.Username, Email: user.Email, FirstName: user.Name, Enabled: &enabled, EmailVerified: &verified, Groups: append([]string(nil), user.Groups...)}
}

func (m *Management) realmUsers(ctx context.Context, realm string) ([]User, error) {
	users, err := m.Directory.List(ctx)
	if err != nil {
		return nil, err
	}
	result := []User{}
	for _, user := range users {
		if user.Realm == realm || (user.Realm == "" && realm == "uds") {
			result = append(result, user)
		}
	}
	return result, nil
}

func (m *Management) routeDirectory(writer http.ResponseWriter, request *http.Request, realm string, parts []string) {
	if parts[0] != "users" {
		m.routeGroups(writer, request, realm, parts)
		return
	}
	if len(parts) == 1 {
		m.userCollection(writer, request, realm)
		return
	}
	users, err := m.realmUsers(request.Context(), realm)
	if err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	var user User
	for _, item := range users {
		if item.ID == parts[1] {
			user = item
			break
		}
	}
	if user.ID == "" {
		apiError(writer, 404, "user_not_found")
		return
	}
	if len(parts) > 2 {
		m.userSubresource(writer, request, realm, user, parts[2:])
		return
	}
	switch request.Method {
	case http.MethodGet:
		jsonResponse(writer, 200, publicUser(user))
	case http.MethodPut:
		var data userRepresentation
		if readJSON(request, &data) != nil {
			apiError(writer, 400, "invalid_user")
			return
		}
		if len(data.RequiredActions) != 0 {
			apiError(writer, 400, "unsupported_required_authentication_action")
			return
		}
		if data.Username != "" {
			user.Username = data.Username
		}
		if data.Email != "" {
			user.Email = data.Email
		}
		if data.FirstName != "" || data.LastName != "" {
			user.Name = strings.TrimSpace(data.FirstName + " " + data.LastName)
		}
		if data.Enabled != nil {
			user.Enabled = *data.Enabled
		}
		if data.EmailVerified != nil {
			user.EmailVerified = *data.EmailVerified
		}
		if data.Groups != nil {
			user.Groups = data.Groups
		}
		if err := m.Directory.Save(request.Context(), user); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		if !user.Enabled {
			if err := m.Sessions.RevokeUser(request.Context(), user.ID); err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
		}
		m.event(realm, "UPDATE", "USER", "users/"+user.ID, publicUser(user))
		writer.WriteHeader(204)
	case http.MethodDelete:
		if err := m.Directory.Delete(request.Context(), user.ID); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		if err := m.Sessions.RevokeUser(request.Context(), user.ID); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		m.event(realm, "DELETE", "USER", "users/"+user.ID, publicUser(user))
		writer.WriteHeader(204)
	default:
		writer.WriteHeader(405)
	}
}

func (m *Management) userCollection(writer http.ResponseWriter, request *http.Request, realm string) {
	users, err := m.realmUsers(request.Context(), realm)
	if err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	switch request.Method {
	case http.MethodGet:
		result := []userRepresentation{}
		for _, user := range users {
			filter := request.URL.Query().Get("username")
			if filter == "" || (request.URL.Query().Get("exact") == "true" && user.Username == filter) || (request.URL.Query().Get("exact") != "true" && strings.Contains(strings.ToLower(user.Username), strings.ToLower(filter))) {
				result = append(result, publicUser(user))
			}
		}
		jsonResponse(writer, 200, result)
	case http.MethodPost:
		var data userRepresentation
		if readJSON(request, &data) != nil || data.Username == "" {
			apiError(writer, 400, "invalid_user")
			return
		}
		if len(data.RequiredActions) != 0 {
			apiError(writer, 400, "unsupported_required_authentication_action")
			return
		}
		for _, user := range users {
			if strings.EqualFold(user.Username, data.Username) {
				apiError(writer, 409, "user_exists")
				return
			}
		}
		user := User{ID: uuid.NewString(), Realm: realm, Username: data.Username, Email: data.Email, Name: strings.TrimSpace(data.FirstName + " " + data.LastName), Enabled: data.Enabled != nil && *data.Enabled, EmailVerified: data.EmailVerified != nil && *data.EmailVerified, Groups: data.Groups}
		for _, credential := range data.Credentials {
			if credential.Type != "password" || credential.Temporary || credential.Value == "" {
				apiError(writer, 400, "unsupported_credential")
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(credential.Value), bcrypt.DefaultCost)
			if err != nil {
				apiError(writer, 400, "invalid_password")
				return
			}
			user.PasswordHash = hash
		}
		if err := m.Directory.Save(request.Context(), user); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		writer.Header().Set("Location", "/admin/realms/"+realm+"/users/"+user.ID)
		m.event(realm, "CREATE", "USER", "users/"+user.ID, publicUser(user))
		writer.WriteHeader(201)
	default:
		writer.WriteHeader(405)
	}
}

func (m *Management) userSubresource(writer http.ResponseWriter, request *http.Request, realm string, user User, rest []string) {
	switch rest[0] {
	case "reset-password":
		if request.Method != http.MethodPut {
			writer.WriteHeader(405)
			return
		}
		var credential struct {
			Type, Value string
			Temporary   bool
		}
		if readJSON(request, &credential) != nil || credential.Type != "password" || credential.Value == "" || credential.Temporary {
			apiError(writer, 400, "unsupported_credential")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(credential.Value), bcrypt.DefaultCost)
		if err != nil {
			apiError(writer, 400, "invalid_password")
			return
		}
		user.PasswordHash = hash
		if err := m.Directory.Save(request.Context(), user); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		if err := m.Sessions.RevokeUser(request.Context(), user.ID); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		m.event(realm, "UPDATE", "USER", "users/"+user.ID+"/reset-password", map[string]string{"username": user.Username})
		writer.WriteHeader(204)
	case "logout":
		if request.Method != http.MethodPost {
			writer.WriteHeader(405)
			return
		}
		user.SessionVersion++
		if err := m.Directory.Save(request.Context(), user); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		if err := m.Sessions.RevokeUser(request.Context(), user.ID); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		writer.WriteHeader(204)
	case "groups":
		m.userGroups(writer, request, realm, user, rest[1:])
	default:
		apiError(writer, 404, "resource_not_found")
	}
}
