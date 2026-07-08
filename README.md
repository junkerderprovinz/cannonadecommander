<p align="center">
  <img src="https://raw.githubusercontent.com/junkerderprovinz/cannonadecommand/main/.github/assets/cannonadecommand-banner.png" alt="CannonadeCommand" width="100%">
</p>

<p align="center">
  <a href="https://github.com/junkerderprovinz/cannonadecommand/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/junkerderprovinz/cannonadecommand/build.yml?branch=main&label=Build&style=for-the-badge&logo=githubactions&logoColor=white" alt="Build" height="36"></a>&nbsp;
  <a href="https://github.com/junkerderprovinz/cannonadecommand/actions/workflows/lint.yml"><img src="https://img.shields.io/github/actions/workflow/status/junkerderprovinz/cannonadecommand/lint.yml?branch=main&label=Lint&style=for-the-badge&logo=githubactions&logoColor=white" alt="Lint" height="36"></a>&nbsp;
  <a href="https://github.com/junkerderprovinz/cannonadecommand/releases/latest"><img src="https://img.shields.io/github/v/release/junkerderprovinz/cannonadecommand?style=for-the-badge&logo=github&logoColor=white&label=Release&color=1d99f3" alt="Release" height="36"></a>&nbsp;
  <a href="https://github.com/junkerderprovinz/cannonadecommand/releases"><img src="https://img.shields.io/github/downloads/junkerderprovinz/cannonadecommand/total?style=for-the-badge&logo=github&logoColor=white&label=Downloads&color=1d99f3" alt="Downloads" height="36"></a>&nbsp;
  <a href="https://go.dev"><img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" height="36"></a>&nbsp;
  <a href="https://unraid.net"><img src="https://img.shields.io/badge/Unraid-Plugin-f15a2c?style=for-the-badge&logo=unraid&logoColor=white" alt="Unraid Plugin" height="36"></a>&nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License" height="36"></a>
</p>

<br>

<p align="center">
CannonadeCommand upgrades Unraid's Docker tab into a full container command post:
dependency-aware, health-gated start orchestration, live CPU/RAM/bandwidth limits
with built-in proof diagnostics, one-click actions, and clean, themeable badges —
all injected right into the native page. A small Go engine does the work; nothing
leaves your server.
</p>

<br>

<p align="center">
  <a href="https://buymeacoffee.com/junkerderprovinz">
    <img src=".github/assets/button-buy-me-a-coffee.svg" alt="Buy me a coffee" width="220">
  </a>
</p>

<br>

## Table of Contents

1. [What is this?](#1-what-is-this)
2. [Features](#2-features)
3. [Installation](#3-installation)
4. [The Docker tab](#4-the-docker-tab)
5. [The settings page](#5-the-settings-page)
6. [How it works](#6-how-it-works)
7. [Safety notes](#7-safety-notes)
8. [Uninstall](#8-uninstall)
9. [Development](#9-development)
10. [License](#10-license)
11. [Support this project](#11-support-this-project)

<br>

## 1. What is this?

Unraid's Docker tab starts containers in whatever order they come. CannonadeCommand
replaces guesswork with a **start plan**: containers declare what they depend on,
the engine starts them in dependency order and only releases the next stage when a
container is actually **ready** (not merely "running"). On top of that it brings
per-container **CPU, RAM and bandwidth limits**, a compact **actions column**, and
a badge-based UI that shows live state at a glance — without replacing any Unraid
page. Everything is enhanced in place.

The name says it: it shoots your commands where you need them — and that very
nicely.

<br>

## 2. Features

**Orchestration**
- Start plan with dependencies ("start the app after its database"), computed
  into parallel start stages.
- Readiness probes per container: running (with grace), TCP port, HTTP check,
  log-line match, or a command inside the container.
- Failure policies per node: abort dependents, continue, or degrade.
- Dependencies on containers **outside** the plan just work — the engine resolves
  them implicitly, nothing is written into your plan.
- Watchdog (auto-restart on crash or unhealthy, rate-capped per hour) and time
  schedules (start/stop/restart at fixed times, per weekday).

**Resource limits**
- Live CPU limit, CPU pinning (topology-aware, with P/E-core detection on Intel
  hybrid CPUs) and RAM limit via Docker update — no container restart.
- Upload limit (tbf shaper) and download limit (pure netfilter policing — never
  a tc ingress qdisc) per container, applied inside the container's own network
  namespace. Works for bridge, ipvlan and macvlan networks alike.
- Built-in proof: the bandwidth editor reads the LIVE rule from the container and
  shows either the applied state or the exact failure — a silent no-op is
  impossible.

**UI**
- Actions column: WebUI, log, edit, restart, pause, stop/start and a "…" menu
  with the container's project/support/donate links — harvested from Unraid's
  own page data.
- Clean badges for state, network, IPs (click to copy), ports, volumes, update
  status; live CPU/RAM/bandwidth values with their limit editors attached.
- List view and a card (grid) view with the same controls.
- Theming: one accent colour for everything, or rainbow mode with an editable
  palette; icon colours toggleable; settings sync across origins (IP, hostname,
  domain) via the engine — and they survive cleared browser data.

<br>

## 3. Installation

Unraid → **Plugins → Install Plugin** → paste:

```
https://raw.githubusercontent.com/junkerderprovinz/cannonadecommand/main/plugin/cannonadecommand.plg
```

The plugin installs the UI pages and starts the engine (a single Go daemon
listening on a local unix socket). Updates install the same way; the daemon is
restarted automatically.

<br>

## 4. The Docker tab

- Every row gets its badges, the actions column, and the resource lines
  (CPU / RAM / BW) with a gear each. The gear is filled in your accent colour
  when a limit is set.
- The **plan badge** opens the per-container editor: manage-in-plan toggle,
  dependencies, readiness probe, start delay, failure policy, watchdog and
  schedules — one save button stores it all.
- The **bandwidth gear** opens the up/down limit editor. After saving, the popup
  stays open and verifies the applied rule live inside the container.
- The gear in the table header opens the global menu: list/grid view,
  basic/advanced view, rainbow and icon-colour toggles, filter, badge selection,
  and the running UI + engine versions.

<br>

## 5. The settings page

**Settings → Utilities → CannonadeCommand** holds the appearance settings (accent
colour with an embedded picker, rainbow palette, density, column defaults), the
bandwidth interface (blank = auto-detected from the container's default route),
notifications, and the diagnostics card with the engine's recent limit
operations. Settings are mirrored into the engine config, so every browser and
origin sees the same configuration.

<br>

## 6. How it works

| Piece | What it does |
| --- | --- |
| `cannonadecommand` daemon (Go) | Talks to the Docker socket (list/start/stop/update only), computes start stages, runs probes, applies limits, persists plan + config on the flash |
| Unix socket + PHP proxy | The UI talks to `/api/*` through a same-origin proxy with a strict path allowlist; writes carry Unraid's csrf token |
| Page scripts | Enhance the native Docker tab in place (badges, actions, editors); a settings page under Utilities |

The daemon exposes proof endpoints (`/api/limitlog`, `/api/bwstatus`) so the UI
can always show what REALLY happened — values read back from Docker, live tc and
netfilter state from the container's netns, and the monitor's last apply attempt.

<br>

## 7. Safety notes

- **No tc ingress qdisc, ever.** Download limiting is pure netfilter policing on
  the container's INPUT chain; the `sch_ingress` module (which can freeze some
  Unraid kernels) is never touched — a unit test enforces that the download path
  cannot even emit a tc command.
- Quirk compensation is built in and CI-proven: legacy iptables (≥ 1.8.12)
  applies byte rates as bits — detected and compensated ×8; hashlimit minimum
  burst honoured; every build measures real throughput through the rule in a
  live container netns.
- Shaping is skipped for host-network / shared-netns containers (it would shape
  the host or another container).
- The proxy never passes raw Docker create/exec/build; only read + lifecycle
  verbs are exposed.

<br>

## 8. Uninstall

**Plugins → Remove**. The daemon is stopped by PID and all program files are
removed. The start plan and config on the flash are kept, so a reinstall picks up
where you left off; delete `/boot/config/plugins/cannonadecommand/` if you want
a truly clean slate.

<br>

## 9. Development

```bash
go build ./...          # engine
go test ./internal/...  # unit tests (incl. the qdisc-free download guard)
bash plugin/pkg_build.sh <version>   # build the .txz package (Linux/CI)
```

CI builds the package, lints, and runs three hardware-truth proofs on every push:
real `docker update` limit assertions against dockerd, the netfilter policing
rule applied and verified inside a live container netns, and a real throughput
measurement through the rule.

<br>

## 10. License

[MIT](LICENSE) — do what you like, no warranty.

<br>

## 11. Support this project

<p align="center">
  <a href="https://buymeacoffee.com/junkerderprovinz">
    <img src=".github/assets/button-buy-me-a-coffee.svg" alt="Buy me a coffee" width="220">
  </a>
</p>
