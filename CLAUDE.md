# CLAUDE.md

Guidance for working in this repository. Keep it accurate to THIS repo.

## What this is

CannonadeCommand is an **Unraid plugin** that enhances Unraid's native Docker,
Plugins and VM tabs in place (badges, actions column, resource limits, start-plan
orchestration, theming). It ships as a `.txz` package installed via a `.plg`.

Two halves:

- **Go engine** (`cmd/` + `internal/`) — a host supervisor daemon that serves a
  localhost UNIX-socket HTTP API (`/api/*`). It talks to the Docker socket
  (list/start/stop/update only), computes dependency-ordered start stages, runs
  readiness probes, applies CPU/RAM/bandwidth limits, and persists plan + config
  on the flash. Not a container — it runs host-side.
- **WebGUI** (`plugin/src/.../emhttp/plugins/cannonadecommand/`) — plain browser
  JS/CSS/PHP (no bundler) injected into the native pages, plus a same-origin PHP
  proxy that reaches the engine socket behind a strict path allowlist.

There is **no Dockerfile** — this is a plugin, not a container image.

Module: `github.com/junkerderprovinz/cannonadecommand`, Go **1.26**.

## Layout

| Path | What |
| --- | --- |
| `cmd/cannonadecommand/` | `main.go` (subcommands: `serve`, `apply`, `version`, `banner`) + embedded `banner.txt` |
| `internal/api/` | HTTP API server (`/api/health`, `/api/state`, `/api/limits`, `/api/apply`, proof endpoints) |
| `internal/dockercli/` | Docker socket client (inspect/start/stop/update/exec/logs/stats) |
| `internal/orchestrator/` | dependency-ordered, health-gated start stages |
| `internal/readiness/` | readiness probes (running / TCP / HTTP / log-match / exec) |
| `internal/monitor/` | always-on loop: schedules, watchdog, idle-stop, notifications |
| `internal/netshape/` | egress tbf shaper + netfilter download policing (never a tc ingress qdisc) |
| `internal/{store,model,hostcpu,unraidtmpl}/` | plan/config store, model types, CPU topology, Unraid template parsing |
| `plugin/pkg_build.sh` | builds the `.txz` package (Go binary + WebGUI files) |
| `plugin/cannonadecommand.plg` | Unraid plugin manifest (version, CHANGES, install/remove logic, `<SHA256>`) |
| `plugin/src/.../scripts/*.js` | page enhancers (docker/plugins/vms/shares/header/settings) |
| `plugin/test/*.test.js` | Node DOM-shim tests that replay the markup Unraid renders |
| `.github/workflows/` | `build.yml` (tests + package + hardware-truth proofs), `lint.yml` |
| `.github/assets/` | banner/logo SVG masters + `gen-banner.mjs` / `render-png.mjs` generators |

## Build / test / lint (exact commands)

```sh
go build ./...            # engine
go test ./...             # unit tests (incl. the qdisc-free download guard)
gofmt -l .                # must print nothing
go vet ./...
golangci-lint run ./...   # golangci-lint v2 (CI builds it from source with the runner's Go)

# WebGUI (no bundler): syntax + DOM tests
find plugin/src -name '*.js' -print0 | xargs -0 -r -n1 node --check
for t in plugin/test/*.test.js; do node "$t"; done

# package the plugin (Linux/CI; needs bash + go)
bash plugin/pkg_build.sh <version>   # -> plugin/out/cannonadecommand-<version>-x86_64-1.txz (+ .sha256)
```

A `justfile` wraps these; run `just` (or `just --list`) to see recipes. `just check`
runs the full local gate.

### Engine runtime env vars

`CC_SOCK` (API socket), `CC_DATA_DIR` (plan/config dir), `CC_DOCKER_SOCK`,
`CC_TEMPLATES_DIR`. Defaults live in `main.go` (`/var/run/cannonadecommand.sock`,
`/boot/config/plugins/cannonadecommand`, `/var/run/docker.sock`).

## CI gates

- **lint.yml** (push + PR): `gofmt -l`, `go vet`, `golangci-lint run`, `node --check`
  on every WebGUI script, and the Node DOM tests.
- **build.yml** (push to `main`, non-doc paths): `go test ./...`, package the `.txz`,
  a **boot smoke** (start the daemon, curl `/api/health` + `/api/state` over its unix
  socket), and three **hardware-truth proofs against a real dockerd/kernel**: real
  `docker update` limit assertions, netfilter download policing applied+verified in a
  live container netns, and a real throughput measurement through the rule.

Keep both green. `gofmt`/`golangci-lint`/`node --check` are fast to run locally first.

## Release procedure

Versioning: **3-digit SemVer**, tag **`vX.Y.Z`**, release **title = the version only**
(no repo name, no heading). **NEVER cut a release or tag without explicit approval.**

There is no release workflow — releasing is a manual, ordered flow:

1. Bump `<!ENTITY version>` in `plugin/cannonadecommand.plg` and prepend a `### X.Y.Z`
   block to `<CHANGES>` (Unraid renders CHANGES as **markdown** — use `- ` list items,
   no raw `<`/`&`, no leading `#`, or the install aborts / headings explode).
2. Build the asset: `bash plugin/pkg_build.sh X.Y.Z` → the `.txz` (+ `.sha256`).
3. Create the GitHub release tagged `vX.Y.Z`, attach the `.txz`, and set the plg's
   `<SHA256>` to the package hash. **The `<SHA256>` in the plg MUST match the attached
   `.txz`** — a stale hash aborts the install. Verify plg == published == local.
4. Asset FIRST, confirm the download returns 200, flip the version LAST.

The plg pulls the package from `releases/download/vX.Y.Z/cannonadecommand-X.Y.Z-x86_64-1.txz`.

## Repo-specific gotchas

- **LF only.** `.gitattributes` forces `eol=lf`. A CRLF `.page` breaks Unraid's
  PageBuilder (it splits the header on a pure-LF `\n---\n`), and a trailing CR breaks
  shell shebangs. `pkg_build.sh` re-normalises, but keep source files LF.
- **Cache-bust via mtime.** Unraid's `autov()` appends `?v=<filemtime>` to injected
  JS/CSS. `pkg_build.sh` stamps fresh, uniform mtimes so each release reloads fresh;
  an unchanged mtime serves a STALE script ("old toolbar still runs after update").
- **`@@CCVER@@`** in `docker.js`/`settings.js` is replaced with the version at package
  time (shown as "UI vX" next to the engine version) — leave the token in source.
- **No tc ingress qdisc, ever.** Download limiting is pure netfilter policing on the
  container INPUT chain; a unit test enforces the download path cannot emit a tc
  command. Legacy iptables (≥ 1.8.12) applies byte rates as bits — compensated ×8.
- **Proxy allowlist must match the frontend.** The PHP proxy exposes only an explicit
  path allowlist; every `/api/*` endpoint the JS calls must be listed. Writes carry
  Unraid's csrf token.
- **WebGUI tests pin the DOM.** Every release-costing bug here came from ASSUMING a DOM
  shape. Add/keep a `plugin/test/*.test.js` that replays the real markup rather than
  trusting a selector.
- **Async test cleanup can race** on Linux CI (a goroutine cleanup finishing after the
  assertion) — wait for the goroutine, don't sleep. Run `go test -race ./...` when
  touching monitor/orchestrator concurrency.

## Conventions

- Repo content (code, comments, README, commit messages, CHANGES-in-repo) is **English**.
  Chat and the Obsidian vault are German.
- **No AI / assistant attribution** anywhere — commits, code, or docs.
- Keep the README current when behaviour changes.
