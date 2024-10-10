# README.md

**NAME** - request-authenication-and-auth-policies-configured

**INPUT** - This validation collects RequestAuthentication and AuthorizationPolicy resources from all namespaces in the Kubernetes cluster.

**POLICY** - This policy checks that both RequestAuthentication and AuthorizationPolicy resources are configured correctly in the cluster.

**NOTES** - Ensure that the RequestAuthentication and AuthorizationPolicy resources are correctly specified in the policy. The policy will fail if any of these resources are missing or improperly configured.