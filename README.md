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
- Kubernetes manifests: [`k8s/`](k8s/) (kustomize, one instance per domain)

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

The manifests match the `arqh-stamp` chart on that cluster: ingress-nginx
(`ingressClassName: nginx`) and the cert-manager ClusterIssuer
`letsencrypt-prod`. DNS for the old hosts stays as it is.

**1. Get the manifests**

```bash
git clone https://github.com/softwarebrauerei/dora_moved_site.git
cd dora_moved_site
kubectl kustomize k8s/    # optional: review what will be created
```

This creates a namespace `dora-moved-site` with, per domain, a Deployment
(2 small nginx pods), a Service and an Ingress.

**2. Optional: avoid a certificate warning**

cert-manager issues a new certificate per host (HTTP-01). This usually takes
under a minute, and until then browsers show a certificate warning. To avoid
that gap, copy the current certificate into the new namespace while the old
Ingress still exists. nginx serves the copy while cert-manager replaces it with
its own:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n <namespace> get secret <old-tls-secret> -o json \
  | jq '{apiVersion, kind, type, data, metadata: {name: "dora-moved-site-fgg-tls", namespace: "dora-moved-site"}}' \
  | kubectl apply -f -
# same for carlsbrgno-staging, as secret dora-moved-site-carlsbrgno-staging-tls
```

**3. Free the old hosts**

An Ingress for `fgg.app.arqh.ai` and `carlsbrgno-staging.app.arqh.ai` already
exists (the `frontend` Ingress of the Dora stamp). Two Ingresses cannot share the
same host and path, so remove the old ones, then deploy right away:

```bash
kubectl get ingress -A | grep -E 'fgg\.app\.arqh\.ai|carlsbrgno-staging\.app\.arqh\.ai'
kubectl -n <namespace> delete ingress <name>   # or set frontend.ingress.enabled=false in the stamp
```

**4. Deploy**

```bash
kubectl apply -k k8s/
```

To deploy only one domain, create the namespace once and apply its folder:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -k k8s/fgg
```

**5. Check**

```bash
kubectl -n dora-moved-site get pods,ingress,certificate
curl -s https://fgg.app.arqh.ai/healthz      # ok
curl -s https://fgg.app.arqh.ai/ | grep -o 'https://fgg.dora.cust.sobr-brews.ch' | head -1
```

Then open `https://fgg.app.arqh.ai/` and `https://carlsbrgno-staging.app.arqh.ai/` in a browser.

**Different ingress setup?** Change `ingressClassName` and the cert-manager
annotation in `k8s/base/ingress.yaml`. Or delete the Ingress and route the old
host to Service `dora-moved-site-<name>` port `80` in your own way.

**Another domain?** Copy `k8s/fgg/` to a new folder and change the suffix,
label, URLs, host and TLS secret name. Then add the folder to
`k8s/kustomization.yaml`.

**Remove everything later:** `kubectl delete -k k8s/`

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
```

**Release:** CI (`.github/workflows/image.yml`) builds and smoke-tests every
push. It publishes `:main` from `main` and `:X.Y.Z`, `:X.Y` and `:latest` from
a `vX.Y.Z` tag. After a release, bump `newTag` in `k8s/base/kustomization.yaml`
and ask the vendor to run `kubectl apply -k k8s/` again.

Third-party assets: Geist and Geist Mono fonts (SIL OFL 1.1, see
`site/assets/fonts/LICENSE-Geist.txt`) and Phosphor icons (MIT), inlined as SVG.
