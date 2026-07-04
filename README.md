# CannonadeCommander

[![Build](https://github.com/junkerderprovinz/cannonadecommander/actions/workflows/build.yml/badge.svg)](https://github.com/junkerderprovinz/cannonadecommander/actions/workflows/build.yml)
[![Lint](https://github.com/junkerderprovinz/cannonadecommander/actions/workflows/lint.yml/badge.svg)](https://github.com/junkerderprovinz/cannonadecommander/actions/workflows/lint.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Dependency-aware, health-gated Docker start orchestration for Unraid, right in the Docker tab.

> Working name — branding is intentionally deferred until the name is final.

Declare *"start postgres, wait until it is healthy, then start nextcloud"*, or
*"bring up gluetun before the containers that route through it"*, then fire it in
order. CannonadeCommander fixes the classic *"the app started before its database
was ready"* and *"the \*arr leaked before the VPN came up"* problems that Unraid's
blind *wait N seconds* autostart cannot express.

## Contents

1. [Why](#why)
2. [How it works](#how-it-works)
3. [Readiness probes](#readiness-probes)
4. [Install](#install)
5. [Safety](#safety)
6. [Status](#status)
7. [Build from source](#build-from-source)

## Why

Unraid's native container autostart is a flat list plus a blind *wait N seconds*
delay: no dependency graph, no health gate. So an app can start before its
database is accepting connections, and a download client can start (and leak your
real IP) before its VPN container is up. The common workaround is a hand-written
User Scripts cron hack. CannonadeCommander does it properly, and it does it from
the **host** because only the host can orchestrate the array-start sequence — a
sandboxed container has a chicken-and-egg problem (it would have to start itself
first).

## How it works

The pieces:

- A **host supervisor** (a small Go daemon) that owns the dependency graph, talks
  to the Docker socket, and serves a localhost **unix-socket API**.
- Unraid's **own container list, enhanced in place** — no bar or panel of our own.
  Every datum becomes a clean, consistent **material badge**: the state doubles as a
  start/stop switch, the chain chip opens a compact per-container editor for its
  dependencies / readiness probe / failure policy **plus its automation** (below)
  and the **Save** / **Start in order** actions. Live **CPU / RAM** show as badges
  (in the Simple view too), each with a gear that edits its **limit** — and CPU
  adds **graphical pinning** — a clickable grid of the **host's** cores (from the
  daemon, not the browser), grouped one physical core per row like the VM core picker —
  applied live via Docker container-update, no restart. The gear turns green when a
  limit is set; the CPU / RAM / network badges carry a small dot (**filled = a limit /
  custom network is set, hollow = defaults**), and a **Volumes** badge lists the mounts
  (shown even for a stopped container).
- **Automation, per container**: **schedules** (start / stop / restart at a
  wall-clock time on chosen weekdays), a **watchdog** (auto-restart on unhealthy or
  a real crash — a clean/manual stop is left alone — with a per-hour cap), and
  **notifications** (Unraid's own notifications and/or a webhook). Schedules and the
  watchdog live in the chain-chip editor; notifications on the Settings page.
- A **Settings page** (Settings → Utilities → CannonadeCommander): badge accent
  colour and rainbow mode, container-icon tint (each colour set with a visual picker
  or a hex field; optionally the VM-tab icons too), which columns show in the Simple
  vs Advanced view, the default view + row density, and the **notification** settings.
- A **same-origin PHP proxy**: the browser only ever talks to the proxy, never to
  the Docker socket. The supervisor exposes only read + safe lifecycle + resource
  limits — never create / exec / build.
- **Event hooks**: on `docker_started` (the daemon is confirmed up) the supervisor
  applies your plan, starting each stage and waiting for readiness before the next.

The dependency graph is topologically sorted into parallel stages; cycles and
unknown dependencies are rejected before a plan is ever saved.

## Readiness probes

Most Community-Apps images ship **no** `HEALTHCHECK`, so "ready" is more than
Docker health:

| Probe | Ready when |
| --- | --- |
| `health` | the image's own `HEALTHCHECK` reports healthy (falls back to *running* if there is none) |
| `running` | the container is running, plus an optional grace period |
| `tcp` | a TCP port accepts a connection (dialed on the container's IP) |
| `http` | an HTTP `GET` on the container returns OK (2xx/3xx), for a chosen port + path |

On failure, per container: **abort** skips everything that depends on it,
**continue** / **degrade** start dependents anyway.

## Install

Plugins tab → *Install Plugin*, paste:

```
https://raw.githubusercontent.com/junkerderprovinz/cannonadecommander/main/plugin/cannonadecommander.plg
```

## Safety

The write-capable Docker socket is host-root-equivalent, so CannonadeCommander is
deliberately conservative: the supervisor exposes only `list / inspect / stats /
start / stop`, never `create / exec / build`; the API listens on a **unix socket**
(no TCP port), and every container reference is validated against the live list
before any action. The browser reaches the engine only through the WebGUI's
same-origin PHP proxy.

## Status

Pre-1.0. Shipping: dependency-ordered, health-gated **start** orchestration,
read-only live state, per-container **CPU / RAM limits**, and the **automation**
subsystem (schedules, watchdog, notifications). Planned next: a resource-limit
dual-write into the template so caps survive *apply*, and a per-container
bandwidth view.

## Build from source

```bash
go test ./...                 # unit tests
bash plugin/pkg_build.sh 0.1.0 # builds the linux binary + the .txz package
```

The supervisor is pure Go standard library (no external dependencies).
