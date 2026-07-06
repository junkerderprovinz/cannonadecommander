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

// MemTotal is the host's total RAM in bytes (from /proc/meminfo). Docker cannot UNSET
// a memory limit through a live update, so the editor's "remove RAM limit" sets it to
// this host total — effectively unlimited, applied live without recreating. 0 if the
// value can't be read.
func MemTotal() int64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	return parseMemTotal(string(data))
}

// parseMemTotal reads the "MemTotal: N kB" line of /proc/meminfo into bytes. Split out
// so it is unit-testable without /proc.
func parseMemTotal(data string) int64 {
	for _, line := range strings.Split(data, "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			f := strings.Fields(line)
			if len(f) >= 2 {
				if kb, e := strconv.ParseInt(f[1], 10, 64); e == nil {
					return kb * 1024
				}
			}
		}
	}
	return 0
}

// HybridPE returns the logical CPUs that are Intel hybrid P-cores and E-cores, read from
// /sys/devices/cpu_core/cpus (P) and /sys/devices/cpu_atom/cpus (E) — the sysfs interface
// hybrid CPUs (12th gen+) expose. Both nil on a non-hybrid machine (either file absent or
// empty), so the pin grid only draws P/E tags when the distinction really exists.
func HybridPE() (p, e []int) {
	p = readCPUList("/sys/devices/cpu_core/cpus")
	e = readCPUList("/sys/devices/cpu_atom/cpus")
	if len(p) == 0 || len(e) == 0 {
		return nil, nil
	}
	return p, e
}

func readCPUList(path string) []int {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return parseCPUList(string(data))
}

// parseCPUList parses a kernel cpulist ("0-15,32,34-35") into the individual CPU numbers.
// Split out so it is unit-testable without /sys. nil on any malformed part.
func parseCPUList(s string) []int {
	var out []int
	for _, part := range strings.Split(strings.TrimSpace(s), ",") {
		if part == "" {
			continue
		}
		if lo, hi, ok := strings.Cut(part, "-"); ok {
			a, e1 := strconv.Atoi(strings.TrimSpace(lo))
			b, e2 := strconv.Atoi(strings.TrimSpace(hi))
			if e1 != nil || e2 != nil || b < a || b-a > 4096 {
				return nil
			}
			for i := a; i <= b; i++ {
				out = append(out, i)
			}
			continue
		}
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return nil
		}
		out = append(out, n)
	}
	return out
}

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
