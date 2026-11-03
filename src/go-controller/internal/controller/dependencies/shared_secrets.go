// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"encoding/json"
	"reflect"
	"slices"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/cache"
	"sigs.k8s.io/yaml"
)

func (c *Controller) watchSharedSecrets(informer cache.SharedIndexInformer) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { c.sharedSecretChanged(nil, secretObject(obj)) },
		DeleteFunc: func(obj interface{}) { c.sharedSecretChanged(secretObject(obj), nil) },
		UpdateFunc: func(old, current interface{}) { c.sharedSecretChanged(secretObject(old), secretObject(current)) },
	})
}

func secretObject(obj interface{}) *corev1.Secret {
	if deleted, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = deleted.Obj
	}
	secret, _ := obj.(*corev1.Secret)
	return secret
}

func (c *Controller) sharedSecretChanged(old, current *corev1.Secret) {
	if c.packages == nil {
		return
	}
	identity := current
	if identity == nil {
		identity = old
	}
	if identity == nil {
		return
	}
	switch identity.Namespace + "/" + identity.Name {
	case "authservice/authservice-uds":
		if current == nil {
			c.queue.Add("config")
			c.packages.RequeueAll()
			return
		}
		before, beforeOK := jsonObject(secretData(old, "config.json"))
		after, afterOK := jsonObject(secretData(current, "config.json"))
		beforeOK = beforeOK && (old == nil || len(secretData(old, "config.json")) > 0)
		afterOK = afterOK && len(secretData(current, "config.json")) > 0
		oldChains, oldOK := namedChains(before["chains"])
		newChains, newOK := namedChains(after["chains"])
		if !beforeOK || !afterOK || !oldOK || !newOK {
			c.queue.Add("config")
			c.packages.RequeueAll()
			return
		}
		if ids := changedNames(oldChains, newChains); len(ids) > 0 {
			c.packages.RequeueSSOClients(ids)
		}
		delete(before, "chains")
		delete(after, "chains")
		if !reflect.DeepEqual(before, after) {
			c.queue.Add("config")
		}
	case "monitoring/uds-prometheus-blackbox-config":
		if current == nil {
			c.packages.RequeueAll()
			return
		}
		before, beforeOK := blackboxModules(old)
		after, afterOK := blackboxModules(current)
		oldOwners, oldOK := probeOwners(old)
		newOwners, newOK := probeOwners(current)
		if !beforeOK || !afterOK || !oldOK || !newOK || !reflect.DeepEqual(before["http_2xx"], after["http_2xx"]) {
			c.packages.RequeueAll()
			return
		}
		var affected []types.UID
		for uid, names := range oldOwners {
			if !reflect.DeepEqual(names, newOwners[uid]) || modulesChanged(names, before, after) {
				affected = append(affected, types.UID(uid))
			}
		}
		for uid, names := range newOwners {
			if !reflect.DeepEqual(names, oldOwners[uid]) || modulesChanged(names, before, after) {
				affected = append(affected, types.UID(uid))
			}
		}
		slices.Sort(affected)
		if len(affected) > 0 {
			c.packages.RequeueUIDs(slices.Compact(affected))
		}
	}
}

func secretData(secret *corev1.Secret, key string) []byte {
	if secret == nil {
		return nil
	}
	return secret.Data[key]
}

func jsonObject(data []byte) (map[string]interface{}, bool) {
	if len(data) == 0 {
		return map[string]interface{}{}, true
	}
	var object map[string]interface{}
	if json.Unmarshal(data, &object) != nil || object == nil {
		return nil, false
	}
	return object, true
}

func namedChains(value interface{}) (map[string]interface{}, bool) {
	result := map[string]interface{}{}
	if value == nil {
		return result, true
	}
	chains, ok := value.([]interface{})
	if !ok {
		return nil, false
	}
	for _, value := range chains {
		chain, ok := value.(map[string]interface{})
		if !ok {
			return nil, false
		}
		name, ok := chain["name"].(string)
		if !ok || name == "" || result[name] != nil {
			return nil, false
		}
		result[name] = chain
	}
	return result, true
}

func changedNames(before, after map[string]interface{}) []string {
	var names []string
	for name, value := range before {
		if !reflect.DeepEqual(value, after[name]) {
			names = append(names, name)
		}
	}
	for name, value := range after {
		if !reflect.DeepEqual(value, before[name]) {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	return slices.Compact(names)
}

func blackboxModules(secret *corev1.Secret) (map[string]interface{}, bool) {
	if secret == nil {
		return map[string]interface{}{}, true
	}
	data, err := yaml.YAMLToJSON(secret.Data["blackbox.yaml"])
	if err != nil {
		return nil, false
	}
	object, ok := jsonObject(data)
	if !ok {
		return nil, false
	}
	modules, ok := object["modules"].(map[string]interface{})
	return modules, ok
}

func probeOwners(secret *corev1.Secret) (map[string][]string, bool) {
	owners := map[string][]string{}
	if secret == nil || secret.Annotations["uds.dev/probe-owners"] == "" {
		return owners, true
	}
	if json.Unmarshal([]byte(secret.Annotations["uds.dev/probe-owners"]), &owners) != nil || owners == nil {
		return nil, false
	}
	for uid, names := range owners {
		if uid == "" {
			return nil, false
		}
		slices.Sort(names)
		owners[uid] = slices.Compact(names)
	}
	return owners, true
}

func modulesChanged(names []string, before, after map[string]interface{}) bool {
	for _, name := range names {
		if !reflect.DeepEqual(before[name], after[name]) {
			return true
		}
	}
	return false
}
