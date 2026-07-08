package netshape

import (
	"reflect"
	"strings"
	"testing"
)

func TestEgressArgs_Set(t *testing.T) {
	got := egressArgs("", 4242, 10000) // blank iface → DefaultIface (eth0)
	want := []string{"-t", "4242", "-n", "tc", "qdisc", "replace", "dev", "eth0", "root", "tbf",
		"rate", "10000kbit", "burst", "125000", "latency", "50ms"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("egressArgs set =\n %v\nwant\n %v", got, want)
	}
}

func TestEgressArgs_CustomIface(t *testing.T) {
	got := egressArgs("br0.20", 4242, 10000)
	want := []string{"-t", "4242", "-n", "tc", "qdisc", "replace", "dev", "br0.20", "root", "tbf",
		"rate", "10000kbit", "burst", "125000", "latency", "50ms"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("egressArgs custom iface =\n %v\nwant\n %v", got, want)
	}
}

func TestEgressArgs_BurstFloor(t *testing.T) {
	got := strings.Join(egressArgs("eth0", 100, 100), " ") // tiny rate → burst floored at 4000
	if !strings.Contains(got, "burst 4000") {
		t.Fatalf("small rate should floor burst at 4000, got %q", got)
	}
}

func TestEgressArgs_Clear(t *testing.T) {
	got := egressArgs("eth0", 4242, 0)
	want := []string{"-t", "4242", "-n", "tc", "qdisc", "del", "dev", "eth0", "root"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("egressArgs clear = %v, want %v", got, want)
	}
}

// Apply must NEVER create an ingress qdisc (the sch_ingress kernel-crash trigger). With a
// bad pid it returns an error without running anything; the important guarantee — no
// `handle ffff: ingress` command exists in the package — still holds: download limiting
// exists again, but ONLY as netfilter policing (iptables hashlimit) — see the qdisc-free
// guard below.
func TestApply_NoIngress_BadPID(t *testing.T) {
	if err := Apply("eth0", 0, 5000, 9000); err == nil {
		t.Fatalf("Apply with pid 0 should error")
	}
}

func TestDlRuleSpec(t *testing.T) {
	got := dlRuleSpec(8000) // 8000 kbit/s → 1,000,000 B/s; burst = 2s of rate; NATIVE byte unit
	want := []string{"-m", "hashlimit", "--hashlimit-above", "1000000b/s", "--hashlimit-burst", "2000000b", "--hashlimit-name", "ccdl", "-j", "DROP"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dlRuleSpec =\n %v\nwant\n %v", got, want)
	}
}

func TestDlRateAndBurstFloors(t *testing.T) {
	if r := dlRateBytes(0); r != 125 { // tiny rate must still pass a positive byte rate
		t.Fatalf("dlRateBytes(0) = %d, want 125", r)
	}
	if b := dlBurstBytes(100); b != 2*dlRateBytes(100) { // legacy iptables demands ~1.5x rate
		t.Fatalf("dlBurstBytes(100) = %d, want %d (== 2x rate)", b, 2*dlRateBytes(100))
	}
}

func TestIptArgs(t *testing.T) {
	got := iptArgs(4242, "-F", dlChain)
	want := []string{"-t", "4242", "-n", "iptables", "-w", "-F", "CC_DL"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("iptArgs = %v, want %v", got, want)
	}
}

// The download path must never emit a tc command at all — and in particular no ingress
// qdisc (`ffff:`/"ingress"). This guards the kernel-crash trigger out of existence.
func TestDownloadPathIsQdiscFree(t *testing.T) {
	all := strings.Join(iptArgs(1, dlRuleSpec(5000)...), " ")
	if strings.Contains(all, "tc ") || strings.Contains(all, "ingress") || strings.Contains(all, "ffff:") {
		t.Fatalf("download policing must be pure netfilter, got %q", all)
	}
	if !strings.Contains(all, "iptables") || !strings.Contains(all, "hashlimit") {
		t.Fatalf("download policing should use iptables hashlimit, got %q", all)
	}
}
