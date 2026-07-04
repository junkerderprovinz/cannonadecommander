// Package hostcpu reports the HOST's CPU layout for the CPU-pinning grid. The
// browser's navigator.hardwareConcurrency is the CLIENT machine's core count, not
// the Unraid server's — so the pin grid must come from the daemon, which sees the
// real host topology (like the VM manager's core picker).
package hostcpu

import (
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// Count is the host's logical CPU count (every core + hyperthread). It counts the
// processor entries in /proc/cpuinfo — the TRUE host total — because runtime.NumCPU()
// is affinity-aware: isolcpus (the cores a VM user reserves, exactly the ones the pin
// grid must still show) are dropped from the daemon's affinity mask, so NumCPU() would
// undercount. Falls back to runtime.NumCPU() only when /proc/cpuinfo can't be read
// (e.g. non-Linux dev).
func Count() int {
	if n := procCount(); n > 0 {
		return n
	}
	return runtime.NumCPU()
}

func procCount() int {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return 0
	}
	n := 0
	for _, line := range strings.Split(string(data), "\n") {
		if k, _, ok := strings.Cut(line, ":"); ok && strings.TrimSpace(k) == "processor" {
			n++
		}
	}
	return n
}

// CoreOf returns, per logical CPU index, the id of the PHYSICAL core it belongs to
// (hyperthread siblings share one id), so the grid can group HT pairs like the VM
// core picker. It is nil when /proc/cpuinfo can't be read, doesn't match Count(), or
// carries NO real topology (a machine without physical id / core id, e.g. some ARM /
// VMs) — the frontend then falls back to a flat grid.
func CoreOf() []int {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return nil
	}
	out, hasTopo := parseCoreOf(string(data))
	if !hasTopo || len(out) != Count() {
		return nil
	}
	return out
}

// parseCoreOf turns /proc/cpuinfo into a physical-core group id per logical CPU,
// INDEXED BY THE processor NUMBER (not file order), so out-of-order or gapped listings
// don't mismap. It returns the slice and whether ANY block carried real physical-id /
// core-id topology (so an all-degenerate machine yields hasTopo=false → flat grid, not
// one bogus core). Split out so it is unit-testable without /proc.
func parseCoreOf(data string) ([]int, bool) {
	type entry struct {
		proc int
		key  string
	}
	var entries []entry
	hasTopo := false
	maxProc := -1
	for _, block := range strings.Split(data, "\n\n") {
		if strings.TrimSpace(block) == "" {
			continue
		}
		proc, gotProc := -1, false
		var phys, core string
		for _, line := range strings.Split(block, "\n") {
			k, v, ok := strings.Cut(line, ":")
			if !ok {
				continue
			}
			switch strings.TrimSpace(k) {
			case "processor":
				if n, e := strconv.Atoi(strings.TrimSpace(v)); e == nil {
					proc, gotProc = n, true
				}
			case "physical id":
				phys, hasTopo = strings.TrimSpace(v), true
			case "core id":
				core, hasTopo = strings.TrimSpace(v), true
			}
		}
		if !gotProc {
			continue
		}
		if proc > maxProc {
			maxProc = proc
		}
		entries = append(entries, entry{proc: proc, key: phys + ":" + core})
	}
	if len(entries) == 0 || maxProc < 0 {
		return nil, false
	}
	// place each entry at its processor index; assign group ids in ascending processor order
	sort.Slice(entries, func(i, j int) bool { return entries[i].proc < entries[j].proc })
	out := make([]int, maxProc+1)
	for i := range out {
		out[i] = -1
	}
	groups := map[string]int{}
	for _, e := range entries {
		g, ok := groups[e.key]
		if !ok {
			g = len(groups)
			groups[e.key] = g
		}
		if e.proc >= 0 && e.proc < len(out) {
			out[e.proc] = g
		}
	}
	for _, v := range out {
		if v < 0 { // a gap in the processor numbering → not usable
			return nil, false
		}
	}
	return out, hasTopo
}
