# Unicorn registry authentication

The `unicorn` flavor images are hosted on `cgr.dev/defenseunicorns.com`, a private Chainguard organization. Working with the unicorn flavor locally requires authentication to pull images from this registry.

Use `chainctl` as a Docker credential helper. This approach exchanges short-lived OIDC tokens at pull time and requires no stored credentials. Do not create a static pull token for local development: tokens expire, require manual rotation, and expand your credential surface.

## Prerequisites

You must have `chainctl` installed and be a member of the `defenseunicorns.com` Chainguard organization. Install `chainctl` using the method appropriate for your OS from the [Chainguard documentation](https://edu.chainguard.dev/chainguard/administration/iam-organizations/how-to-install-chainctl/). Then log in:

```bash
chainctl auth login
```

## Configure the credential helper

Register `chainctl` as the credential helper for `cgr.dev`:

```bash
chainctl auth configure-docker
```

This adds a `cgr.dev` entry to your `~/.docker/config.json` credential helper map. Any Docker-compatible tool that reads this config (Docker, Zarf, `crane`, `uds`) will automatically call `chainctl` for authentication when accessing `cgr.dev`.

Verify access by pulling a unicorn image:

```bash
docker pull cgr.dev/defenseunicorns.com/keycloak-fips:26.6.1
```

## How it works

When a tool needs credentials for `cgr.dev`, Docker calls `chainctl` as a subprocess to get a short-lived token backed by your SSO session. No password is stored. Your access is determined by your Chainguard organization membership, not by a credential you manage.

## Troubleshooting

**`unauthorized` or `403` error when pulling:** Run `chainctl auth login` to refresh your session, then retry.

**`chainctl: command not found`:** Install `chainctl` and ensure it is on your `PATH`.
