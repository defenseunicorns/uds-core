// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

// Kubelet status_manager finalizes only its fully terminated, already-deleting
// Pod, with a zero grace period and UID precondition. The surrounding predicate
// limits this to infrastructure namespaces; Node authorizer/RBAC still apply.
func nodePodRetirement(owned string) string {
	return "((!has(request.resource.group)||request.resource.group=='')" +
		"&&request.resource.resource=='pods'" +
		"&&(!has(request.subResource)||request.subResource=='')" +
		"&&request.operation=='DELETE'&&object==null&&oldObject!=null" +
		"&&has(oldObject.metadata)&&has(oldObject.metadata.uid)&&oldObject.metadata.uid!=''" +
		"&&has(oldObject.metadata.name)&&has(request.name)&&request.name==oldObject.metadata.name" +
		"&&has(oldObject.metadata.namespace)&&has(request.namespace)&&request.namespace==oldObject.metadata.namespace" +
		"&&has(oldObject.metadata.deletionTimestamp)&&oldObject.metadata.deletionTimestamp!=null" +
		"&&has(oldObject.status)&&has(oldObject.status.phase)&&oldObject.status.phase in ['Succeeded','Failed']" +
		"&&has(oldObject.spec)&&has(oldObject.spec.nodeName)&&oldObject.spec.nodeName!=''" +
		"&&request.userInfo.username=='system:node:'+oldObject.spec.nodeName" +
		"&&" + owned +
		"&&has(request.options)&&request.options!=null&&has(request.options.preconditions)" +
		"&&request.options.preconditions!=null&&has(request.options.preconditions.uid)" +
		"&&request.options.preconditions.uid==oldObject.metadata.uid" +
		"&&has(request.options.gracePeriodSeconds)&&request.options.gracePeriodSeconds==0)"
}
