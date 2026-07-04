// Package netshape applies a per-container EGRESS network rate limit. Docker has no
// native bandwidth API, so we shape traffic with tc's tbf qdisc INSIDE the container's
// network namespace (entered via nsenter using the container PID). This only shapes
// upload (egress) on the container's own interface; it is bounded and safe — a tbf
// qdisc is a rate shaper, not a firewall, and a failure just means "no shaping",
// never broken networking. The rules are ephemeral (gone on container restart), so the
// monitor re-applies them while a limited container runs.
package netshape

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// DefaultIface is the in-container interface to shape when none is configured. eth0 is
// the container's primary NIC in both bridge and macvlan setups.
const DefaultIface = "eth0"

// ifaceOr returns the chosen interface, or DefaultIface when the (Settings-configured)
// name is blank. The iface is threaded through every call rather than held in a mutable
// global so a config change can never race with an in-flight tick.
func ifaceOr(iface string) string {
	if iface = strings.TrimSpace(iface); iface != "" {
		return iface
	}
	return DefaultIface
}

// egressArgs builds the nsenter argv that sets (kbit>0) or clears (kbit<=0) an egress
// tbf rate limit on `iface` inside the netns of the process `pid`. Split out so the exact
// command is unit-testable without running tc.
func egressArgs(iface string, pid, kbit int) []string {
	dev := ifaceOr(iface)
	base := []string{"-t", strconv.Itoa(pid), "-n", "tc", "qdisc"}
	if kbit <= 0 {
		return append(base, "del", "dev", dev, "root")
	}
	// burst ≈ 0.1s of data (bytes), with a sane floor so small rates still pass traffic.
	burst := kbit * 1000 / 80
	if burst < 4000 {
		burst = 4000
	}
	return append(base, "replace", "dev", dev, "root", "tbf",
		"rate", strconv.Itoa(kbit)+"kbit", "burst", strconv.Itoa(burst), "latency", "50ms")
}

// Apply sets an egress rate limit (kbit) on `iface` inside the container whose main
// process is `pid`. Idempotent (tc qdisc replace). kbit<=0 clears it.
func Apply(iface string, pid, kbit int) error {
	if pid <= 0 {
		return fmt.Errorf("netshape: invalid pid %d", pid)
	}
	if kbit <= 0 {
		return Clear(iface, pid)
	}
	return run(egressArgs(iface, pid, kbit))
}

// Clear removes any egress shaping from the container (ignores "nothing to delete").
func Clear(iface string, pid int) error {
	if pid <= 0 {
		return nil
	}
	err := run(egressArgs(iface, pid, 0))
	if err != nil && strings.Contains(err.Error(), "No such file or directory") {
		return nil // no qdisc there to delete
	}
	return err
}

func run(args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "nsenter", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("nsenter tc: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
