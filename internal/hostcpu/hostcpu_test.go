package hostcpu

import (
	"reflect"
	"testing"
)

func TestParseCoreOf(t *testing.T) {
	// a 2-physical-core, hyperthreaded CPU: logical 0/2 share core 0, logical 1/3 share core 1.
	cpuinfo := `processor	: 0
physical id	: 0
core id		: 0
model name	: Test

processor	: 1
physical id	: 0
core id		: 1
model name	: Test

processor	: 2
physical id	: 0
core id		: 0
model name	: Test

processor	: 3
physical id	: 0
core id		: 1
model name	: Test
`
	got, hasTopo := parseCoreOf(cpuinfo)
	want := []int{0, 1, 0, 1} // cpu0->core0, cpu1->core1, cpu2->core0(HT of 0), cpu3->core1(HT of 1)
	if !hasTopo || !reflect.DeepEqual(got, want) {
		t.Fatalf("parseCoreOf = %v (topo=%v), want %v (topo=true)", got, hasTopo, want)
	}
}

func TestParseCoreOfOutOfOrder(t *testing.T) {
	// processors listed out of order must still map to their true index.
	cpuinfo := "processor : 2\nphysical id : 0\ncore id : 0\n\nprocessor : 0\nphysical id : 0\ncore id : 0\n\nprocessor : 1\nphysical id : 0\ncore id : 1\n\nprocessor : 3\nphysical id : 0\ncore id : 1\n"
	got, hasTopo := parseCoreOf(cpuinfo)
	want := []int{0, 1, 0, 1}
	if !hasTopo || !reflect.DeepEqual(got, want) {
		t.Fatalf("out-of-order parseCoreOf = %v (topo=%v), want %v", got, hasTopo, want)
	}
}

func TestParseCoreOfNoTopology(t *testing.T) {
	// a machine (some ARM / VMs) without physical id / core id: hasTopo must be false
	// so CoreOf() returns nil and the frontend uses a flat grid.
	cpuinfo := "processor : 0\nmodel name : ARM\n\nprocessor : 1\nmodel name : ARM\n"
	got, hasTopo := parseCoreOf(cpuinfo)
	if hasTopo {
		t.Fatalf("no physical/core id should mean hasTopo=false, got topo=true (%v)", got)
	}
}

func TestParseCoreOfEmpty(t *testing.T) {
	if got, topo := parseCoreOf(""); topo || len(got) != 0 {
		t.Fatalf("empty cpuinfo should yield (nil,false), got (%v,%v)", got, topo)
	}
}

func TestCountPositive(t *testing.T) {
	if Count() < 1 {
		t.Fatalf("Count() must be >= 1, got %d", Count())
	}
}
