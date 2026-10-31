// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

type Group struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Path  string `json:"path"`
	Realm string `json:"-"`
}

type groupRecord struct {
	Group Group  `json:"group"`
	Realm string `json:"realm"`
}

func (m *Management) groups(ctx context.Context, realm string) ([]Group, error) {
	raw, err := m.Store.List(ctx, "group")
	if err != nil {
		return nil, err
	}
	groups := []Group{}
	for _, item := range raw {
		var record groupRecord
		if err := json.Unmarshal(item, &record); err != nil {
			return nil, err
		}
		if record.Realm == realm {
			record.Group.Realm = realm
			groups = append(groups, record.Group)
		}
	}
	return groups, nil
}

func (m *Management) SeedGroup(ctx context.Context, realm, path string) error {
	path = "/" + strings.Trim(path, "/")
	id := uuid.NewSHA1(uuid.NameSpaceURL, []byte(realm+":"+path)).String()
	parts := strings.Split(path, "/")
	return m.Store.Put(ctx, "group", realm+"/"+id, groupRecord{Group: Group{ID: id, Name: parts[len(parts)-1], Path: path}, Realm: realm})
}

func (m *Management) routeGroups(writer http.ResponseWriter, request *http.Request, realm string, parts []string) {
	groups, err := m.groups(request.Context(), realm)
	if err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	if parts[0] == "group-by-path" {
		path, err := url.PathUnescape(strings.Join(parts[1:], "/"))
		if err != nil {
			apiError(writer, 400, "invalid_group")
			return
		}
		for _, group := range groups {
			if group.Path == "/"+strings.Trim(path, "/") {
				jsonResponse(writer, 200, group)
				return
			}
		}
		apiError(writer, 404, "group_not_found")
		return
	}
	if len(parts) == 1 {
		switch request.Method {
		case http.MethodGet:
			jsonResponse(writer, 200, groups)
		case http.MethodPost:
			var group Group
			if readJSON(request, &group) != nil || group.Name == "" || strings.Contains(group.Name, "/") {
				apiError(writer, 400, "invalid_group")
				return
			}
			path := "/" + group.Name
			for _, item := range groups {
				if item.Path == path {
					apiError(writer, 409, "group_exists")
					return
				}
			}
			if err := m.SeedGroup(request.Context(), realm, path); err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
			writer.Header().Set("Location", "/admin/realms/"+realm+"/groups/"+uuid.NewSHA1(uuid.NameSpaceURL, []byte(realm+":"+path)).String())
			writer.WriteHeader(201)
		default:
			writer.WriteHeader(405)
		}
		return
	}
	for _, group := range groups {
		if group.ID != parts[1] {
			continue
		}
		if len(parts) == 3 && parts[2] == "children" && request.Method == http.MethodPost {
			var child Group
			if readJSON(request, &child) != nil || child.Name == "" || strings.Contains(child.Name, "/") {
				apiError(writer, 400, "invalid_group")
				return
			}
			path := group.Path + "/" + child.Name
			if err := m.SeedGroup(request.Context(), realm, path); err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
			writer.Header().Set("Location", "/admin/realms/"+realm+"/groups/"+uuid.NewSHA1(uuid.NameSpaceURL, []byte(realm+":"+path)).String())
			writer.WriteHeader(201)
			return
		}
		if request.Method == http.MethodGet {
			jsonResponse(writer, 200, group)
			return
		}
		apiError(writer, 405, "unsupported_group_operation")
		return
	}
	apiError(writer, 404, "group_not_found")
}

func (m *Management) userGroups(writer http.ResponseWriter, request *http.Request, realm string, user User, rest []string) {
	groups, err := m.groups(request.Context(), realm)
	if err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	if len(rest) == 0 && request.Method == http.MethodGet {
		result := []Group{}
		for _, group := range groups {
			for _, membership := range user.Groups {
				if group.Path == membership {
					result = append(result, group)
				}
			}
		}
		jsonResponse(writer, 200, result)
		return
	}
	if len(rest) != 1 || (request.Method != http.MethodPut && request.Method != http.MethodDelete) {
		writer.WriteHeader(405)
		return
	}
	for _, group := range groups {
		if group.ID != rest[0] {
			continue
		}
		memberships := []string{}
		for _, path := range user.Groups {
			if path != group.Path {
				memberships = append(memberships, path)
			}
		}
		if request.Method == http.MethodPut {
			memberships = append(memberships, group.Path)
		}
		user.Groups = memberships
		if err := m.Directory.Save(request.Context(), user); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		operation := "DELETE"
		if request.Method == http.MethodPut {
			operation = "CREATE"
		}
		m.event(realm, operation, "GROUP_MEMBERSHIP", "users/"+user.ID+"/groups/"+group.ID, map[string]string{"username": user.Username, "groupPath": group.Path})
		writer.WriteHeader(204)
		return
	}
	apiError(writer, 404, "group_not_found")
}
