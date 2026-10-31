// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package probes

import (
	"context"
	"encoding/json"
	"fmt"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"reflect"
	"sigs.k8s.io/yaml"
	"sort"
	"strings"
	"sync"
)

const blackboxSecret = "uds-prometheus-blackbox-config"
const ownershipAnnotation = "uds.dev/probe-owners"

var blackboxMu sync.Mutex

func httpModule() map[string]interface{} {
	return map[string]interface{}{"prober": "http", "timeout": "5s", "http": map[string]interface{}{"valid_http_versions": []interface{}{"HTTP/1.1", "HTTP/2.0"}, "follow_redirects": true, "preferred_ip_protocol": "ip4"}}
}

// Modules are scoped by Package UID, so a second Package in the same namespace
// cannot erase the first one's uptime authentication when it reconciles/deletes.
func updateBlackboxConfig(ctx context.Context, client kubernetes.Interface, pkg *udstypes.UDSPackage, credentials map[string]string) error {
	blackboxMu.Lock()
	defer blackboxMu.Unlock()
	secret, err := client.CoreV1().Secrets("monitoring").Get(ctx, blackboxSecret, metav1.GetOptions{})
	creating := apierrors.IsNotFound(err)
	if creating && pkg.DeletionTimestamp != nil {
		return nil
	}
	if creating {
		secret = &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: blackboxSecret, Namespace: "monitoring"}, Data: map[string][]byte{}}
	} else if err != nil {
		return err
	}
	cfg := map[string]interface{}{}
	if data := secret.Data["blackbox.yaml"]; len(data) > 0 {
		converted, err := yaml.YAMLToJSON(data)
		if err != nil {
			return fmt.Errorf("parse blackbox config: %w", err)
		}
		if err := json.Unmarshal(converted, &cfg); err != nil {
			return err
		}
	}
	modules, _ := cfg["modules"].(map[string]interface{})
	if modules == nil {
		modules = map[string]interface{}{}
	}
	if _, exists := modules["http_2xx"]; !exists {
		modules["http_2xx"] = httpModule()
	}
	owners := map[string][]string{}
	if data := secret.Annotations[ownershipAnnotation]; data != "" {
		if err := json.Unmarshal([]byte(data), &owners); err != nil {
			return fmt.Errorf("invalid blackbox ownership: %w", err)
		}
	}
	owner := string(pkg.UID)
	old := owners[owner]
	// Migrate modules installed by Pepr using the status journal, which remains
	// durable even when the original expose/SSO entry has already been removed.
	for _, id := range pkg.Status.SsoClients {
		if strings.HasSuffix(id, "-probe") {
			old = append(old, moduleName(pkg.Namespace, id))
		}
	}
	for _, name := range old {
		delete(modules, name)
	}
	var desired []string
	for id, secret := range credentials {
		name := moduleName(pkg.Namespace, id)
		desired = append(desired, name)
		module := httpModule()
		http := module["http"].(map[string]interface{})
		http["follow_redirects"] = false
		http["oauth2"] = map[string]interface{}{"client_id": id, "client_secret": secret, "token_url": fmt.Sprintf("https://sso.%s/realms/uds/protocol/openid-connect/token", config.Get().Domain), "endpoint_params": map[string]interface{}{"grant_type": "client_credentials"}}
		modules[name] = module
	}
	sort.Strings(desired)
	if len(desired) > 0 {
		owners[owner] = desired
	} else {
		delete(owners, owner)
	}
	cfg["modules"] = modules
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	ownerData, _ := json.Marshal(owners)
	if !creating && reflect.DeepEqual(secret.Data["blackbox.yaml"], data) && secret.Annotations[ownershipAnnotation] == string(ownerData) {
		return nil
	}
	if secret.Data == nil {
		secret.Data = map[string][]byte{}
	}
	secret.Data["blackbox.yaml"] = data
	if secret.Annotations == nil {
		secret.Annotations = map[string]string{}
	}
	secret.Annotations[ownershipAnnotation] = string(ownerData)
	if creating {
		_, err = client.CoreV1().Secrets("monitoring").Create(ctx, secret, metav1.CreateOptions{})
	} else {
		_, err = client.CoreV1().Secrets("monitoring").Update(ctx, secret, metav1.UpdateOptions{})
	}
	return err
}
