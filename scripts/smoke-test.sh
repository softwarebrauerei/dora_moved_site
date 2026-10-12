#!/bin/sh
# Starts the image the way Kubernetes runs it (read-only root filesystem,
# writable /tmp) and checks the rendered page.
# Usage: scripts/smoke-test.sh <image>
set -eu

image=${1:?usage: $0 <image>}
port=${PORT:-18080}
name=dora-moved-site-smoke-$$
base=http://127.0.0.1:$port

cleanup() { docker rm -f "$name" "$name-bad" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    docker logs "$name" >&2 2>&1 || true
    exit 1
}

docker run -d --name "$name" --read-only --tmpfs /tmp -p "127.0.0.1:$port:8080" \
    -e OLD_URL=https://fgg.app.arqh.ai \
    -e NEW_URL=fgg.dora.cust.sobr-brews.ch/ \
    "$image" >/dev/null

i=0
until curl -fsS "$base/healthz" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 30 ] || fail "/healthz did not come up"
    sleep 0.5
done

page=$(curl -fsS "$base/some/old/bookmark?id=7") || fail "deep link did not return 200"
case "$page" in *__OLD_HOST__* | *__NEW_HOST__* | *__NEW_URL__*) fail "placeholder left in page" ;; esac
case "$page" in *'href="https://fgg.dora.cust.sobr-brews.ch"'*) ;; *) fail "new URL missing" ;; esac
case "$page" in *'fgg.app.arqh.ai'*) ;; *) fail "old host missing" ;; esac

curl -fsS -o /dev/null "$base/assets/app.js" || fail "/assets/app.js not served"
headers=$(curl -fsSI "$base/")
case "$headers" in *[Cc]ontent-[Ss]ecurity-[Pp]olicy:*) ;; *) fail "CSP header missing" ;; esac

# A value that is not a bare origin must stop the container.
docker run -d --name "$name-bad" --read-only --tmpfs /tmp \
    -e 'OLD_URL=https://fgg.app.arqh.ai/"><script>alert(1)</script>' \
    -e NEW_URL=https://fgg.dora.cust.sobr-brews.ch \
    "$image" >/dev/null
sleep 2
[ "$(docker inspect -f '{{.State.Running}}' "$name-bad")" = false ] || fail "invalid OLD_URL was accepted"

echo "smoke test passed: $image"
