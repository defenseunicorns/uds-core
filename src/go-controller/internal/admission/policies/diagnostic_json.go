// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/dop251/goja"
)

// JSON syntax validation precedes decoding. This decoder retains UTF-16 code
// units, IEEE-754 overflow and property insertion order lost by Go/Goja's JSON
// decoder. It constructs only data values and never evaluates source text.
type diagnosticJSON struct {
	text string
	pos  int
	vm   *goja.Runtime
}

func decodeDiagnosticJSON(vm *goja.Runtime, text string) (goja.Value, error) {
	if !json.Valid([]byte(text)) {
		return nil, fmt.Errorf("invalid JSON syntax")
	}
	decoder := &diagnosticJSON{text: text, vm: vm}
	return decoder.value(), nil
}

func (d *diagnosticJSON) whitespace() {
	for d.pos < len(d.text) && strings.ContainsRune(" \t\r\n", rune(d.text[d.pos])) {
		d.pos++
	}
}

func (d *diagnosticJSON) value() goja.Value {
	d.whitespace()
	switch d.text[d.pos] {
	case '"':
		return d.string()
	case '[':
		return d.array()
	case '{':
		return d.object()
	case 'n':
		d.pos += 4
		return goja.Null()
	case 't':
		d.pos += 4
		return d.vm.ToValue(true)
	case 'f':
		d.pos += 5
		return d.vm.ToValue(false)
	default:
		start := d.pos
		for d.pos < len(d.text) && !strings.ContainsRune(" \t\r\n,]}", rune(d.text[d.pos])) {
			d.pos++
		}
		// ErrRange retains +/-Infinity, matching JSON.parse. JSON.stringify
		// subsequently emits null rather than rejecting a valid JSON number.
		number, _ := strconv.ParseFloat(d.text[start:d.pos], 64)
		return d.vm.ToValue(number)
	}
}

func (d *diagnosticJSON) string() goja.String {
	d.pos++
	units := []uint16{}
	for d.text[d.pos] != '"' {
		if d.text[d.pos] == '\\' {
			d.pos++
			if d.text[d.pos] == 'u' {
				unit, _ := strconv.ParseUint(d.text[d.pos+1:d.pos+5], 16, 16)
				units = append(units, uint16(unit))
				d.pos += 5
				continue
			}
			escapes := map[byte]uint16{'"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t'}
			units = append(units, escapes[d.text[d.pos]])
			d.pos++
			continue
		}
		character, length := utf8.DecodeRuneInString(d.text[d.pos:])
		units = append(units, utf16.Encode([]rune{character})...)
		d.pos += length
	}
	d.pos++
	return goja.StringFromUTF16(units)
}

func (d *diagnosticJSON) array() *goja.Object {
	d.pos++
	d.whitespace()
	items := []interface{}{}
	for d.text[d.pos] != ']' {
		items = append(items, d.value())
		d.whitespace()
		if d.text[d.pos] == ',' {
			d.pos++
		}
	}
	d.pos++
	return d.vm.NewArray(items...)
}

func (d *diagnosticJSON) object() *goja.Object {
	d.pos++
	d.whitespace()
	object := d.vm.NewObject()
	define, _ := goja.AssertFunction(d.vm.Get("Object").ToObject(d.vm).Get("defineProperty"))
	for d.text[d.pos] != '}' {
		key := d.string()
		d.whitespace()
		d.pos++ // Colon, already verified by json.Valid.
		value := d.value()
		descriptor := d.vm.NewObject()
		_ = descriptor.Set("value", value)
		_ = descriptor.Set("enumerable", true)
		_ = descriptor.Set("writable", true)
		_ = descriptor.Set("configurable", true)
		// Built-in defineProperty treats __proto__ as ordinary data and keeps
		// UTF-16 property keys, matching JSON.parse rather than object literals.
		_, _ = define(goja.Undefined(), object, key, descriptor)
		d.whitespace()
		if d.text[d.pos] == ',' {
			d.pos++
			d.whitespace()
		}
	}
	d.pos++
	return object
}
