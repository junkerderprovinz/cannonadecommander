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

Four pieces:

- A **host supervisor** (a small Go daemon) that owns the dependency graph, talks
  to the Docker socket, and serves a localhost **unix-socket API**.
- Unraid's **own container list, enhanced in place** — no bar or panel of our own.
  Each row gets clean badges (the state doubles as a start/stop switch) and a chain
  chip that opens a compact editor for that container's dependencies, readiness
  probe and failure policy. A single **gear in the table header** holds every global
  control: toggleable columns (update / network / IP / port / CPU / RAM and an
  advanced set), a List/Grid switch, a filter, and **Save** / **Start in order**.
- A **same-origin PHP proxy**: the browser only ever talks to the proxy, never to
  the Docker socket.
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

Pre-1.0 MVP. Shipping: dependency-ordered, health-gated **start** orchestration +
read-only live state. Planned next: per-container schedules, a resource-limit
editor (memory/CPU/IO with a dual-write into the template so it survives *apply*),
and a per-container bandwidth view.

## Build from source

```bash
go test ./...                 # unit tests
bash plugin/pkg_build.sh 0.1.0 # builds the linux binary + the .txz package
```

The supervisor is pure Go standard library (no external dependencies).
