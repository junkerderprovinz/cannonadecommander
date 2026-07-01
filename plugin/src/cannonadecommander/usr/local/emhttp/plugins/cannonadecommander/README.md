# CannonadeCommander

Dependency-aware, health-gated Docker start orchestration for Unraid.

Declare "start postgres, wait until it is healthy, then start nextcloud", or
"bring up gluetun before the containers that route through it", right from the
Docker tab, then fire it in order. It fixes the classic "app started before its
database was ready" and "arr leaked before the VPN came up" problems that
Unraid's blind wait-N-seconds autostart cannot.

Most Community-Apps images ship no HEALTHCHECK, so readiness can also be a TCP
port opening or the container simply running, not only Docker health. It runs as
a host plugin because only the host can orchestrate the array-start sequence a
sandboxed container never could, and the browser never touches the Docker socket.
