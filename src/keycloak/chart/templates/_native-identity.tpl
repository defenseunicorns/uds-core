{{/* Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial */}}

{{/* The native provider implements the explicitly selected development
password fixture. Never accept required production auth settings it cannot
enforce, even when unused Keycloak values remain in the surrounding chart. */}}
{{- define "keycloak.nativeIdentity.authenticationGuard" -}}
{{- if ne .Values.realm "uds" -}}
{{- fail "Native development identity supports only realm=uds" -}}
{{- end -}}
{{- if and .Values.nativeIdentity.coreAudiencePairsEnabled (eq .Values.nativeIdentity.controllerNamespace "pepr-system") (eq .Values.nativeIdentity.controllerServiceAccount "pepr-uds-core") -}}
{{- fail "paired CLI audiences require a verified provenance producer; the original Pepr provider does not supply it" -}}
{{- end -}}
{{- if ne .Values.nativeIdentity.authenticationProfile "password-only" -}}
{{- fail "Native identity supports only the explicit password-only development profile" -}}
{{- end -}}

{{- if not .Values.realmAuthFlows.USERNAME_PASSWORD_AUTH_ENABLED -}}
{{- fail "Native password-only identity requires USERNAME_PASSWORD_AUTH_ENABLED=true" -}}
{{- end -}}
{{- range $requirement := list "OTP_ENABLED" "X509_AUTH_ENABLED" "SOCIAL_AUTH_ENABLED" "WEBAUTHN_ENABLED" "X509_MFA_ENABLED" -}}
{{- if index $.Values.realmAuthFlows $requirement -}}
{{- fail (printf "Native development identity cannot enforce %s; explicitly disable it for the password-only test profile" $requirement) -}}
{{- end -}}
{{- end -}}
{{- range $requirement := list "GOOGLE_IDP_ENABLED" "EMAIL_VERIFICATION_ENABLED" "TERMS_AND_CONDITIONS_ENABLED" -}}
{{- if eq (lower (printf "%v" (index $.Values.realmInitEnv $requirement))) "true" -}}
{{- fail (printf "Native development identity cannot enforce required %s" $requirement) -}}
{{- end -}}
{{- end -}}
{{- range $requirement := list "PASSWORD_POLICY" "SECURITY_HARDENING_ADDITIONAL_PROTOCOL_MAPPERS" "SECURITY_HARDENING_ADDITIONAL_CLIENT_SCOPES" -}}
{{- if index $.Values.realmInitEnv $requirement -}}
{{- fail (printf "Native development identity cannot enforce custom %s" $requirement) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "keycloak.nativeIdentity.fleetEnabled" -}}
{{- $value := lower (printf "%v" (.Values.realmInitEnv.FLEET_CLIENT_ENABLED | default "false")) -}}
{{- if not (has $value (list "true" "false")) -}}
{{- fail "Native Fleet management requires FLEET_CLIENT_ENABLED to be an explicit true or false" -}}
{{- end -}}
{{- $value -}}
{{- end -}}
