// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package admission

import (
	"reflect"

	compiled "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"
)

// WatchParameters repairs the protected output even when its absence prevents
// admission of another Exemption event. Only the elected compiler runs the queue.
func (c *Compiler) WatchParameters(informer cache.SharedIndexInformer) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: c.parametersChanged,
		UpdateFunc: func(old, current interface{}) {
			before, oldOK := old.(*unstructured.Unstructured)
			after, newOK := current.(*unstructured.Unstructured)
			if !oldOK || !newOK || before.GetUID() != after.GetUID() || !reflect.DeepEqual(before.Object["spec"], after.Object["spec"]) {
				c.parametersChanged(current)
			}
		},
		DeleteFunc: c.parametersChanged,
	})
}

func (c *Compiler) parametersChanged(value interface{}) {
	if deleted, ok := value.(cache.DeletedFinalStateUnknown); ok {
		value = deleted.Obj
	}
	parameters, ok := value.(*unstructured.Unstructured)
	if ok && parameters.GetNamespace() == compiled.ProtectedNamespace && parameters.GetName() == "uds-native-grants" {
		c.Enqueue()
	}
}
