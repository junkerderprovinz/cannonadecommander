package monitor

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

type fakeDocker struct {
	list       []model.Container
	actions    []string
	restartErr error // when set, Restart records the attempt then returns this error
}

func (f *fakeDocker) List(context.Context) ([]model.Container, error) { return f.list, nil }
func (f *fakeDocker) Start(_ context.Context, n string) error {
	f.actions = append(f.actions, "start:"+n)
	return nil
}
func (f *fakeDocker) Stop(_ context.Context, n string) error {
	f.actions = append(f.actions, "stop:"+n)
	return nil
}
func (f *fakeDocker) Restart(_ context.Context, n string) error {
	f.actions = append(f.actions, "restart:"+n)
	return f.restartErr
}

type fakeCfg struct{ c model.Config }

func (f fakeCfg) LoadConfig() (model.Config, error) { return f.c, nil }

type fakeNotifier struct{ n []string }

func (f *fakeNotifier) Notify(_ context.Context, _ model.Notify, subject, _, _ string) {
	f.n = append(f.n, subject)
}

type fakePidder struct{ pids map[string]int }

func (f fakePidder) PID(_ context.Context, name string) (int, error) {
	if p, ok := f.pids[name]; ok {
		return p, nil
	}
	return 0, errors.New("no pid")
}

type fakeShaper struct {
	applied map[int]int    // last EGRESS kbit per pid
	ingress map[int]int    // last INGRESS kbit per pid
	ifaces  map[int]string // last iface seen per pid, to assert the configured iface is threaded through
	calls   []string       // ordered "iface:pid:egress:ingress" log, to assert an old-iface clear happened
	err     error          // when set, Apply records the call then returns this (partial-failure sim)
}

func (f *fakeShaper) DetectIface(pid int) string { return "" }
func (f *fakeShaper) Apply(iface string, pid, egressKbit, ingressKbit int) error {
	if f.applied == nil {
		f.applied = map[int]int{}
		f.ingress = map[int]int{}
		f.ifaces = map[int]string{}
	}
	f.applied[pid] = egressKbit
	f.ingress[pid] = ingressKbit
	f.ifaces[pid] = iface
	f.calls = append(f.calls, fmt.Sprintf("%s:%d:%d:%d", iface, pid, egressKbit, ingressKbit))
	return f.err
}

func hasCall(calls []string, want string) bool {
	for _, c := range calls {
		if c == want {
			return true
		}
	}
	return false
}

func TestBandwidthAppliedToRunningOnly(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{
		{Name: "up", State: "running", Network: "br0.20"},
		{Name: "down", State: "exited"},
		{Name: "hostnet", State: "running", Network: "host"}, // shares host netns → must NOT be shaped
	}}
	sh := &fakeShaper{}
	nt := &fakeNotifier{}
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{ShapeIface: "br0.20", Bandwidths: []model.Bandwidth{
			{Name: "up", EgressKbit: 5000, IngressKbit: 2000}, // both directions
			{Name: "down", EgressKbit: 3000},                  // stopped → skipped
			{Name: "hostnet", EgressKbit: 2000},               // host netns → skipped (would throttle the whole host)
		}}},
		Pidder:   fakePidder{pids: map[string]int{"up": 4242, "down": 99, "hostnet": 7}},
		Shaper:   sh,
		Notifier: nt,
		Now:      time.Now,
	}
	m.Tick(context.Background())
	if len(sh.applied) != 1 || sh.applied[4242] != 5000 || sh.ingress[4242] != 2000 {
		t.Fatalf("only the running bridge container should be shaped (egress 5000 + ingress 2000), got eg=%v in=%v", sh.applied, sh.ingress)
	}
	if sh.ifaces[4242] != "br0.20" { // the Settings-configured interface must reach the shaper
		t.Fatalf("configured ShapeIface must be threaded to the shaper, got %q", sh.ifaces[4242])
	}
	if len(nt.n) != 1 { // the host-network container must produce a "not applied" notification
		t.Fatalf("host-network container should notify once, got %v", nt.n)
	}
}

func TestBandwidthClearedOnRemoval(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{{Name: "up", State: "running", Network: "br0.20"}}}
	sh := &fakeShaper{}
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{Bandwidths: []model.Bandwidth{{Name: "up", EgressKbit: 5000}}}},
		Pidder: fakePidder{pids: map[string]int{"up": 4242}},
		Shaper: sh,
		Now:    time.Now,
	}
	m.Tick(context.Background()) // applies 5000
	if sh.applied[4242] != 5000 {
		t.Fatalf("expected 5000 applied, got %v", sh.applied)
	}
	m.Config = fakeCfg{c: model.Config{}} // entry removed
	m.Tick(context.Background())
	if sh.applied[4242] != 0 { // must be cleared (Apply with 0)
		t.Fatalf("removing the entry must clear the rule (apply 0), got %v", sh.applied)
	}
}

// A container whose Apply ERRORED (e.g. egress applied but the ingress police filter
// failed) must still be tracked, so a later removal clears the direction that DID apply —
// otherwise it leaks with no way to remove it from the UI.
func TestBandwidthClearedEvenAfterApplyError(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{{Name: "up", State: "running", Network: "br0.20"}}}
	sh := &fakeShaper{err: errors.New("ingress filter: act_police missing")}
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{ShapeIface: "eth0", Bandwidths: []model.Bandwidth{{Name: "up", EgressKbit: 5000}}}},
		Pidder: fakePidder{pids: map[string]int{"up": 4242}},
		Shaper: sh,
		Now:    time.Now,
	}
	m.Tick(context.Background()) // Apply errors, but "up" must still be tracked as shaped
	sh.err = nil                 // the box recovers / the failing direction is retried
	m.Config = fakeCfg{c: model.Config{}}
	m.Tick(context.Background())
	if !hasCall(sh.calls, "eth0:4242:0:0") {
		t.Fatalf("a container whose apply errored must still be cleared on removal, calls=%v", sh.calls)
	}
}

// Changing the Settings shaping interface (eth0 → eth1) must CLEAR the stale qdisc on
// the OLD interface (not leave it throttling) and re-apply on the new one. The clear
// must target the iface the container was actually shaped on, not the new setting.
func TestBandwidthReshapedOnInterfaceChange(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{{Name: "up", State: "running", Network: "br0.20"}}}
	sh := &fakeShaper{}
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{ShapeIface: "eth0", Bandwidths: []model.Bandwidth{{Name: "up", EgressKbit: 5000}}}},
		Pidder: fakePidder{pids: map[string]int{"up": 4242}},
		Shaper: sh,
		Now:    time.Now,
	}
	m.Tick(context.Background()) // shapes on eth0
	if sh.ifaces[4242] != "eth0" || sh.applied[4242] != 5000 {
		t.Fatalf("expected shape on eth0 @5000, got iface=%q kbit=%d", sh.ifaces[4242], sh.applied[4242])
	}
	// admin changes the shaping interface to eth1 (container still configured)
	m.Config = fakeCfg{c: model.Config{ShapeIface: "eth1", Bandwidths: []model.Bandwidth{{Name: "up", EgressKbit: 5000}}}}
	m.Tick(context.Background())
	if !hasCall(sh.calls, "eth0:4242:0:0") { // the OLD iface must be cleared (both directions)
		t.Fatalf("changing the interface must clear the old iface (eth0:4242:0:0), calls=%v", sh.calls)
	}
	if sh.ifaces[4242] != "eth1" || sh.applied[4242] != 5000 { // and the new one shaped
		t.Fatalf("expected reshape on eth1 @5000, got iface=%q kbit=%d", sh.ifaces[4242], sh.applied[4242])
	}
}

func TestScheduleFiresOncePerMinute(t *testing.T) {
	fd := &fakeDocker{}
	clock := time.Date(2026, 7, 3, 3, 0, 0, 0, time.Local) // 03:00
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{Schedules: []model.Schedule{
			{Name: "db", Action: "restart", Time: "03:00", Enabled: true},
			{Name: "off", Action: "start", Time: "03:00", Enabled: false}, // disabled → never
			{Name: "later", Action: "stop", Time: "04:00", Enabled: true}, // wrong minute
		}}},
		Now: func() time.Time { return clock },
	}
	m.Tick(context.Background()) // 03:00:00
	clock = clock.Add(30 * time.Second)
	m.Tick(context.Background()) // 03:00:30 — same minute, must NOT re-fire
	if len(fd.actions) != 1 || fd.actions[0] != "restart:db" {
		t.Fatalf("expected exactly [restart:db], got %v", fd.actions)
	}
	// next day's 03:00 fires again
	clock = clock.Add(24 * time.Hour)
	m.Tick(context.Background())
	if len(fd.actions) != 2 {
		t.Fatalf("expected a second fire the next day, got %v", fd.actions)
	}
}

func TestScheduleRespectsDays(t *testing.T) {
	fd := &fakeDocker{}
	clock := time.Date(2026, 7, 3, 3, 0, 0, 0, time.Local) // 2026-07-03 is a Friday (5)
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{Schedules: []model.Schedule{
			{Name: "db", Action: "start", Time: "03:00", Days: []int{1, 2, 3}, Enabled: true}, // Mon-Wed only
		}}},
		Now: func() time.Time { return clock },
	}
	m.Tick(context.Background())
	if len(fd.actions) != 0 {
		t.Fatalf("Friday should not fire a Mon-Wed schedule, got %v", fd.actions)
	}
}

func TestWatchdogRestartsAndCaps(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{{Name: "gluetun", State: "running", Health: "unhealthy"}}}
	fn := &fakeNotifier{}
	clock := time.Date(2026, 7, 3, 3, 0, 0, 0, time.Local)
	m := &Monitor{
		Docker:   fd,
		Notifier: fn,
		Config: fakeCfg{c: model.Config{
			Watchdogs: []model.Watchdog{{Name: "gluetun", Enabled: true, OnUnhealthy: true, MaxRestarts: 2}},
			Notify:    model.Notify{Unraid: true},
		}},
		Now: func() time.Time { return clock },
	}
	// stays unhealthy each tick → restarts up to the cap, then gives up
	for i := 0; i < 4; i++ {
		m.Tick(context.Background())
		clock = clock.Add(30 * time.Second)
	}
	restarts := 0
	for _, a := range fd.actions {
		if a == "restart:gluetun" {
			restarts++
		}
	}
	if restarts != 2 {
		t.Fatalf("watchdog should restart exactly MaxRestarts=2 times, got %d (%v)", restarts, fd.actions)
	}
	// at least one "restarted" + one "gave up" notification
	var restarted, gaveUp bool
	for _, s := range fn.n {
		if s == "Watchdog restarted gluetun" {
			restarted = true
		}
		if s == "Watchdog gave up" {
			gaveUp = true
		}
	}
	if !restarted || !gaveUp {
		t.Fatalf("expected restart + gave-up notifications, got %v", fn.n)
	}
}

// OnExit must restart a crash (non-zero exit) but leave a clean stop (exit 0)
// alone, so the watchdog never fights a graceful/manual `docker stop`.
func TestWatchdogOnExitOnlyOnCrash(t *testing.T) {
	fd := &fakeDocker{list: []model.Container{
		{Name: "crashed", State: "exited", ExitCode: 1},   // genuine crash → restart
		{Name: "stopped", State: "exited", ExitCode: 0},   // clean stop → leave
		{Name: "sigterm", State: "exited", ExitCode: 143}, // `docker stop` SIGTERM → leave
		{Name: "sigkill", State: "exited", ExitCode: 137}, // `docker stop` SIGKILL → leave
	}}
	clock := time.Date(2026, 7, 3, 3, 0, 0, 0, time.Local)
	m := &Monitor{
		Docker: fd,
		Config: fakeCfg{c: model.Config{Watchdogs: []model.Watchdog{
			{Name: "crashed", Enabled: true, OnExit: true, MaxRestarts: 5},
			{Name: "stopped", Enabled: true, OnExit: true, MaxRestarts: 5},
			{Name: "sigterm", Enabled: true, OnExit: true, MaxRestarts: 5},
			{Name: "sigkill", Enabled: true, OnExit: true, MaxRestarts: 5},
		}}},
		Now: func() time.Time { return clock },
	}
	m.Tick(context.Background())
	if len(fd.actions) != 1 || fd.actions[0] != "restart:crashed" {
		t.Fatalf("only the crashed (exit 1) container should restart; signal stops (0/137/143) must be left alone, got %v", fd.actions)
	}
}

// A restart that keeps erroring must be capped by MaxRestarts (the failed attempt
// counts) and must not alert every tick — one "restart failed" then "gave up".
func TestWatchdogFailedRestartIsCappedAndThrottled(t *testing.T) {
	fd := &fakeDocker{
		list:       []model.Container{{Name: "web", State: "running", Health: "unhealthy"}},
		restartErr: errors.New("no such container"),
	}
	fn := &fakeNotifier{}
	clock := time.Date(2026, 7, 3, 3, 0, 0, 0, time.Local)
	m := &Monitor{
		Docker:   fd,
		Notifier: fn,
		Config: fakeCfg{c: model.Config{
			Watchdogs: []model.Watchdog{{Name: "web", Enabled: true, OnUnhealthy: true, MaxRestarts: 2}},
			Notify:    model.Notify{Unraid: true},
		}},
		Now: func() time.Time { return clock },
	}
	for i := 0; i < 6; i++ {
		m.Tick(context.Background())
		clock = clock.Add(30 * time.Second)
	}
	attempts := 0
	for _, a := range fd.actions {
		if a == "restart:web" {
			attempts++
		}
	}
	if attempts != 2 {
		t.Fatalf("failed restarts must still be capped at MaxRestarts=2, got %d (%v)", attempts, fd.actions)
	}
	var failed, gaveUp int
	for _, s := range fn.n {
		switch s {
		case "Watchdog restart failed":
			failed++
		case "Watchdog gave up":
			gaveUp++
		}
	}
	if failed != 1 || gaveUp != 1 {
		t.Fatalf("expected exactly one 'restart failed' and one 'gave up' (throttled), got failed=%d gaveUp=%d (%v)", failed, gaveUp, fn.n)
	}
}
