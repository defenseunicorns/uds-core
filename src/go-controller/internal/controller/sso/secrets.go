// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

import (
	"context"
	"encoding/json"

	"fmt"
	"io"
	"log/slog"
	"net/http"

	"strings"

	"reflect"

	"encoding/xml"
	"regexp"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func createClientSecret(ctx context.Context, coreClient corev1client.CoreV1Interface, ssoSpec udstypes.Sso, client Client, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference) error {
	secretName := fmt.Sprintf("sso-client-%s", utils.SanitizeResourceName(client.ClientID))
	if ssoSpec.SecretName != nil {
		secretName = *ssoSpec.SecretName
	}
	if ssoSpec.SecretConfig != nil && ssoSpec.SecretConfig.Name != nil {
		secretName = *ssoSpec.SecretConfig.Name
	}
	secretName = utils.SanitizeResourceName(secretName)

	labels := map[string]string{
		"uds/package":    pkgName,
		"uds/generation": generation,
	}

	// Merge additional labels
	if ssoSpec.SecretLabels != nil {
		for k, v := range ssoSpec.SecretLabels {
			labels[k] = v
		}
	}
	if ssoSpec.SecretConfig != nil {
		for k, v := range ssoSpec.SecretConfig.Labels {
			labels[k] = v
		}
	}

	annotations := make(map[string]string)
	if ssoSpec.SecretAnnotations != nil {
		for k, v := range ssoSpec.SecretAnnotations {
			annotations[k] = v
		}
	}
	if ssoSpec.SecretConfig != nil {
		for k, v := range ssoSpec.SecretConfig.Annotations {
			annotations[k] = v
		}
	}

	// Build secret data
	data := map[string][]byte{}
	if ssoSpec.SecretConfig != nil && len(ssoSpec.SecretConfig.Template) > 0 {
		// Template mode
		for key, tmpl := range ssoSpec.SecretConfig.Template {
			value := resolveTemplate(tmpl, client)
			data[key] = []byte(value)
		}
	} else if ssoSpec.SecretTemplate != nil && len(ssoSpec.SecretTemplate) > 0 {
		// Deprecated template mode
		for key, tmpl := range ssoSpec.SecretTemplate {
			value := resolveTemplate(tmpl, client)
			data[key] = []byte(value)
		}
	} else {
		encoded, _ := json.Marshal(client)
		fields := map[string]interface{}{}
		_ = json.Unmarshal(encoded, &fields)
		for key, value := range fields {
			data[key] = []byte(secretValue(value))
		}

	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:            secretName,
			Namespace:       namespace,
			Labels:          labels,
			Annotations:     annotations,
			OwnerReferences: ownerRefs,
		},
		Data: data,
	}

	existing, err := coreClient.Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		_, err = coreClient.Secrets(namespace).Create(ctx, secret, metav1.CreateOptions{})
	} else if err == nil {
		for _, owner := range existing.OwnerReferences {
			if owner.APIVersion != "uds.dev/v1alpha1" || owner.Kind != "Package" {
				continue
			}
			matched := false
			for _, desired := range ownerRefs {
				matched = matched || owner.UID == desired.UID
			}
			if !matched {
				return fmt.Errorf("SSO Secret %s/%s is owned by another Package UID", namespace, secretName)
			}
		}
		secret.ResourceVersion = existing.ResourceVersion
		if reflect.DeepEqual(existing.Data, secret.Data) && reflect.DeepEqual(existing.Labels, secret.Labels) && reflect.DeepEqual(existing.Annotations, secret.Annotations) && reflect.DeepEqual(existing.OwnerReferences, secret.OwnerReferences) {
			return nil
		}
		_, err = coreClient.Secrets(namespace).Update(ctx, secret, metav1.UpdateOptions{})
	}
	return err
}

func purgeOrphanSecrets(ctx context.Context, coreClient corev1client.CoreV1Interface, namespace, pkgName, generation string, packageUID types.UID) error {
	if packageUID == "" {
		return fmt.Errorf("cannot purge SSO Secrets without Package UID")
	}
	secrets, err := coreClient.Secrets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uds/package=%s", pkgName),
	})
	if err != nil {
		return err
	}
	for _, s := range secrets.Items {
		if !resources.OwnedByPackage(&s, packageUID) {
			continue
		}
		if s.Labels["uds/generation"] != generation {
			slog.Debug("Deleting orphaned secret", "name", s.Name, "namespace", namespace)
			uid, version := s.UID, s.ResourceVersion
			if err := coreClient.Secrets(namespace).Delete(ctx, s.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil {
				if !apierrors.IsNotFound(err) {
					return err
				}
			}
		}
	}
	return nil
}

var secretTemplatePattern = regexp.MustCompile(`clientField\(([a-zA-Z]+)\)(?:\["?([\w]+)"?\]|(\.json\(\)))?`)

func resolveTemplate(template string, client Client) string {
	data, _ := json.Marshal(client)
	fields := map[string]interface{}{}
	_ = json.Unmarshal(data, &fields)
	return secretTemplatePattern.ReplaceAllStringFunc(template, func(match string) string {
		parts := secretTemplatePattern.FindStringSubmatch(match)
		value := fields[parts[1]]
		if parts[2] != "" {
			if object, ok := value.(map[string]interface{}); ok {
				value = object[parts[2]]
			} else {
				value = nil
			}
		}
		if parts[3] != "" {
			encoded, _ := json.Marshal(value)
			return string(encoded)
		}
		if value == nil {
			return ""
		}
		return secretValue(value)
	})
}
func secretValue(value interface{}) string {
	switch value.(type) {
	case map[string]interface{}, []interface{}:
		data, _ := json.Marshal(value)
		return string(data)
	}
	return fmt.Sprint(value)
}
func getSamlCertificate(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, keycloakBaseURL+"/realms/uds/protocol/saml/descriptor", nil)
	if err != nil {
		return "", err
	}
	response, err := managementHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("SAML descriptor request failed (%d)", response.StatusCode)
	}
	decoder := xml.NewDecoder(io.LimitReader(response.Body, 2<<20))
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "KeyDescriptor" {
			continue
		}
		signing := false
		for _, attribute := range start.Attr {
			if attribute.Name.Local == "use" && attribute.Value == "signing" {
				signing = true
			}
		}
		if !signing {
			continue
		}
		var descriptor struct {
			Certificate string `xml:"KeyInfo>X509Data>X509Certificate"`
		}
		if err := decoder.DecodeElement(&descriptor, &start); err != nil {
			return "", err
		}
		certificate := strings.Join(strings.Fields(descriptor.Certificate), "")
		if certificate == "" {
			return "", fmt.Errorf("SAML signing descriptor has no certificate")
		}
		return certificate, nil
	}
	return "", fmt.Errorf("SAML IdP descriptor has no signing X509Certificate")
}
