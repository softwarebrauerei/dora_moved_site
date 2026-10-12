# dora_moved_site

A single "Dora has moved" page for the old `*.app.arqh.ai` addresses. It tells
users the new address on `*.dora.cust.sobr-brews.ch` and asks them to update
their bookmarks. Every path on the old host shows the page, and the button keeps
the path, so an old bookmark on `/some/page` leads to `/some/page` on the new host.

| Old address | New address |
| --- | --- |
| `fgg.app.arqh.ai` | `fgg.dora.cust.sobr-brews.ch` |
| `carlsbrgno-staging.app.arqh.ai` | `carlsbrgno-staging.dora.cust.sobr-brews.ch` |

- Image: `ghcr.io/softwarebrauerei/dora_moved_site:1.0.0` (public, `linux/amd64` and `linux/arm64`, no pull secret needed)
- Helm chart: [`charts/dora-moved-site`](charts/dora-moved-site/) (one small deployment per tenant, tenants listed in `values.yaml`)

## Configuration

One container serves one domain pair. It has two settings:

| Variable | Example | Meaning |
| --- | --- | --- |
| `OLD_URL` | `https://fgg.app.arqh.ai` | The address users come from, shown crossed out |
| `NEW_URL` | `https://fgg.dora.cust.sobr-brews.ch` | Where Dora lives now |

Both must be an origin (scheme, host, optional port). `https://` is added if
missing, and a trailing slash is dropped. Anything else, such as a path, stops
the container at start-up with an error in the log.

The container listens on port `8080` as user `101` and works with a read-only
root filesystem if `/tmp` is writable. `GET /healthz` returns `ok`.

## Deployment guide (AKS cluster serving `*.app.arqh.ai`)

The chart defaults match the `arqh-stamp` chart on that cluster: ingress-nginx
(`ingress.className: nginx`) and the cert-manager ClusterIssuer
`letsencrypt-prod`. DNS for the old hosts stays as it is.

**1. Get the chart**

```bash
git clone https://github.com/softwarebrauerei/dora_moved_site.git
cd dora_moved_site
```

**2. Check the tenants**

The tenants are in `charts/dora-moved-site/values.yaml`. Each key gets its own
Deployment, Service and Ingress named `dora-moved-site-<key>`:

```yaml
tenants:
  fgg:
    oldUrl: https://fgg.app.arqh.ai
    newUrl: https://fgg.dora.cust.sobr-brews.ch
  carlsbrgno-staging:
    oldUrl: https://carlsbrgno-staging.app.arqh.ai
    newUrl: https://carlsbrgno-staging.dora.cust.sobr-brews.ch
```

To add a tenant, add an entry, either there or in your own values file passed
with `-f`. Helm merges maps, so a tenant from `values.yaml` is only dropped with
`enabled: false`. Optional per tenant: `host` (Ingress host, if it differs from
`oldUrl`) and `tlsSecretName`. A URL with a path or a misspelled key fails at
`helm install`, before anything is deployed. Preview the result:

```bash
helm template dora-moved-site charts/dora-moved-site -n dora-moved-site
```

**3. Optional: avoid a certificate warning**

cert-manager issues a new certificate per host (HTTP-01). This usually takes
under a minute, and until then browsers show a certificate warning. To avoid
that gap, copy the current certificate into the new namespace while the old
Ingress still exists. nginx serves the copy while cert-manager replaces it with
its own:

```bash
kubectl create namespace dora-moved-site
kubectl -n <namespace> get secret <old-tls-secret> -o json \
  | jq '{apiVersion, kind, type, data, metadata: {name: "dora-moved-site-fgg-tls", namespace: "dora-moved-site"}}' \
  | kubectl apply -f -
# same for each tenant, as secret dora-moved-site-<key>-tls
```

**4. Free the old hosts**

An Ingress for each old host already exists (the `frontend` Ingress of the Dora
stamp). Two Ingresses cannot share the same host and path, so remove the old
ones, then install right away:

```bash
kubectl get ingress -A | grep -E 'fgg\.app\.arqh\.ai|carlsbrgno-staging\.app\.arqh\.ai'
kubectl -n <namespace> delete ingress <name>   # or set frontend.ingress.enabled=false in the stamp
```

**5. Install**

```bash
helm upgrade --install dora-moved-site charts/dora-moved-site \
  -n dora-moved-site --create-namespace --wait
```

The output lists each tenant and the commands to check it.

**6. Check**

```bash
kubectl -n dora-moved-site get pods,ingress,certificate
curl -s https://fgg.app.arqh.ai/healthz      # ok
curl -s https://fgg.app.arqh.ai/ | grep -o 'https://fgg.dora.cust.sobr-brews.ch' | head -1
```

Then open `https://fgg.app.arqh.ai/` and `https://carlsbrgno-staging.app.arqh.ai/` in a browser.

**Other settings** (`values.yaml`): `replicaCount` per tenant (default 1),
`resources`, `nodeSelector`, `tolerations` and `affinity`. For a different
ingress setup, change `ingress.className` and `ingress.annotations`. Set
`ingress.tls: false` when TLS ends in front of the cluster. Or set
`ingress.enabled: false` and route each old host to Service
`dora-moved-site-<key>` port `80` in your own way.

**Remove everything later:** `helm uninstall dora-moved-site -n dora-moved-site`

**Without Kubernetes:**

```bash
docker run -d --restart unless-stopped -p 8080:8080 \
  -e OLD_URL=https://fgg.app.arqh.ai \
  -e NEW_URL=https://fgg.dora.cust.sobr-brews.ch \
  ghcr.io/softwarebrauerei/dora_moved_site:1.0.0
```

## Development

The page lives in `site/` (plain HTML, CSS and JS, styled like dora-web). nginx
fills in the placeholders `__OLD_HOST__`, `__NEW_HOST__` and `__NEW_URL__` at
request time (`nginx/default.conf.template`). They come from
`docker-entrypoint.d/05-moved-site.envsh`, which checks the two variables.

```bash
docker build -t dora-moved-site .
docker run --rm -p 8080:8080 -e OLD_URL=https://fgg.app.arqh.ai \
  -e NEW_URL=https://fgg.dora.cust.sobr-brews.ch dora-moved-site
# http://localhost:8080/  and any deep link, e.g. http://localhost:8080/orders?id=1
scripts/smoke-test.sh dora-moved-site

helm lint --strict charts/dora-moved-site
helm template dora-moved-site charts/dora-moved-site
```

**Release:** CI (`.github/workflows/image.yml`) builds and smoke-tests every
push. It publishes `:main` from `main` and `:X.Y.Z`, `:X.Y` and `:latest` from
a `vX.Y.Z` tag. After a release, set `appVersion` (the image tag) in
`charts/dora-moved-site/Chart.yaml`, bump the chart `version`, and ask the
vendor to run the `helm upgrade --install` command again.

Third-party assets: Geist and Geist Mono fonts (SIL OFL 1.1, see
`site/assets/fonts/LICENSE-Geist.txt`) and Phosphor icons (MIT), inlined as SVG.
