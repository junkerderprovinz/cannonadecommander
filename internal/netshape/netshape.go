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

// Iface is the in-container interface to shape. eth0 is the container's primary NIC in
// both bridge and macvlan setups. Overridable so a box with a different name can adapt.
var Iface = "eth0"

// egressArgs builds the nsenter argv that sets (kbit>0) or clears (kbit<=0) an egress
// tbf rate limit on Iface inside the netns of the process `pid`. Split out so the exact
// command is unit-testable without running tc.
func egressArgs(pid, kbit int) []string {
	base := []string{"-t", strconv.Itoa(pid), "-n", "tc", "qdisc"}
	if kbit <= 0 {
		return append(base, "del", "dev", Iface, "root")
	}
	// burst ≈ 0.1s of data (bytes), with a sane floor so small rates still pass traffic.
	burst := kbit * 1000 / 80
	if burst < 4000 {
		burst = 4000
	}
	return append(base, "replace", "dev", Iface, "root", "tbf",
		"rate", strconv.Itoa(kbit)+"kbit", "burst", strconv.Itoa(burst), "latency", "50ms")
}

// Apply sets an egress rate limit (kbit) on the container whose main process is `pid`.
// Idempotent (tc qdisc replace). kbit<=0 clears it.
func Apply(pid, kbit int) error {
	if pid <= 0 {
		return fmt.Errorf("netshape: invalid pid %d", pid)
	}
	if kbit <= 0 {
		return Clear(pid)
	}
	return run(egressArgs(pid, kbit))
}

// Clear removes any egress shaping from the container (ignores "nothing to delete").
func Clear(pid int) error {
	if pid <= 0 {
		return nil
	}
	err := run(egressArgs(pid, 0))
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
