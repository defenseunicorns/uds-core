// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package resources validates the current Core custom-resource contracts.
package resources

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Object retains raw JSON, including label insertion order used by Core's
// Object.values-based generated names. Kubernetes schema validation owns types.
type Object map[string]json.RawMessage

func Decode(raw []byte) (Object, error) {
	var object Object
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, fmt.Errorf("invalid resource object: %v", err)
	}
	return object, nil
}

func (o Object) Has(key string) bool { _, found := o[key]; return found }
func (o Object) String(key string) string {
	var value string
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Bool(key string) bool {
	var value bool
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Number(key string) float64 {
	var value float64
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Numbers(key string) []float64 {
	var value []float64
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Object(key string) Object {
	var value Object
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) List(key string) []Object {
	var value []Object
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Strings(key string) []string {
	var value []string
	_ = json.Unmarshal(o[key], &value)
	return value
}
func (o Object) Truthy(key string) bool {
	raw := o[key]
	return len(raw) > 0 && string(raw) != "null" && string(raw) != "false" && string(raw) != "0" && string(raw) != `""`
}
func (o Object) Value(key string) string {
	raw := o[key]
	if len(raw) == 0 {
		return "undefined"
	}
	if len(raw) > 0 && raw[0] == '"' {
		return o.String(key)
	}
	return string(raw)
}

func values(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return []string{"all pods"}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	_, err := decoder.Token()
	if err != nil {
		return nil
	}
	var result []string
	for decoder.More() {
		if _, err := decoder.Token(); err != nil {
			break
		}
		var value string
		if err := decoder.Decode(&value); err != nil {
			break
		}
		result = append(result, value)
	}
	return result
}

func compactJSON(raw json.RawMessage) string {
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		return string(raw)
	}
	return compact.String()
}

func decodeExisting(raw []byte) ([]Object, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	var objects []Object
	if err := decoder.Decode(&objects); err != nil && err != io.EOF {
		return nil, err
	}
	return objects, nil
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func joinedNonEmpty(values []string) string {
	var result []string
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return strings.Join(result, "-")
}

func marshalObject(object Object) (json.RawMessage, error) { return json.Marshal(object) }

func objectKeys(raw json.RawMessage) []string {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		return nil
	}
	var result []string
	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			break
		}
		var ignored json.RawMessage
		if err := decoder.Decode(&ignored); err != nil {
			break
		}
		if key, ok := key.(string); ok {
			result = append(result, key)
		}
	}
	return result
}
