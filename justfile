# CannonadeCommand task runner. Recipes mirror the real CI gates (build.yml + lint.yml)
# and pkg_build.sh. Run `just` or `just --list` to see everything.
set shell := ["sh", "-cu"]

# Show the recipe list
default:
    @just --list

# --- Go engine ---------------------------------------------------------------

# Build the engine
build:
    go build ./...

# Run the unit tests (incl. the qdisc-free download guard)
test:
    go test ./...

# Run the unit tests with the race detector (use when touching monitor/orchestrator)
test-race:
    go test -race ./...

# Format all Go sources in place
fmt:
    gofmt -w .

# Fail if any Go source is not gofmt-clean (the CI gate)
fmt-check:
    @out="$(gofmt -l .)"; if [ -n "$out" ]; then echo "gofmt needed on:"; echo "$out"; exit 1; fi

# go vet
vet:
    go vet ./...

# golangci-lint v2 (install once with `just lint-install` if missing)
lint:
    golangci-lint run ./...

# Build golangci-lint v2 from source with the local Go (matches CI)
lint-install:
    go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest

# --- WebGUI (plain browser JS, no bundler) -----------------------------------

# node --check every injected script (the CI syntax gate)
js-check:
    find plugin/src -name '*.js' -print0 | xargs -0 -r -n1 node --check

# Run the Node DOM-shim tests that replay Unraid's real markup
js-test:
    for t in plugin/test/*.test.js; do echo "== $t"; node "$t" || exit 1; done

# --- Aggregate gate ----------------------------------------------------------

# Full local gate before pushing: fmt + vet + lint + go tests + JS syntax + JS tests
check: fmt-check vet lint test js-check js-test

# --- Packaging ---------------------------------------------------------------

# Build the plugin .txz (+ .sha256) into plugin/out/ (Linux/CI; needs bash + go).
# VERSION defaults to today's date; pass X.Y.Z for a real package.
pkg version="":
    bash plugin/pkg_build.sh {{version}}

# Boot smoke: build the daemon, start it, and curl its socket (mirrors build.yml; needs Linux + curl)
smoke:
    bash plugin/pkg_build.sh 0.0.0-dev
    BIN=plugin/src/cannonadecommand/usr/local/emhttp/plugins/cannonadecommand/bin/cannonadecommand; \
    "$BIN" version; \
    CC_SOCK=/tmp/cc-dev.sock CC_DATA_DIR=/tmp/ccdata-dev CC_DOCKER_SOCK=/tmp/nope.sock "$BIN" serve & \
    PID=$!; \
    for _ in $(seq 1 20); do [ -S /tmp/cc-dev.sock ] && break; sleep 0.5; done; \
    curl -fsS --unix-socket /tmp/cc-dev.sock http://localhost/api/health | grep -q ok && echo "health ok"; \
    kill "$PID" 2>/dev/null || true

# --- Assets ------------------------------------------------------------------

# Regenerate the README banners from the SVG masters (needs global opentype.js + @resvg/resvg-js)
banner:
    node .github/assets/gen-banner.mjs

# --- Housekeeping ------------------------------------------------------------

# Scan the working tree for committed secrets
secrets:
    gitleaks detect --no-banner --redact

# Remove build outputs
clean:
    rm -rf plugin/out
