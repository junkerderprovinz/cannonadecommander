package monitor

import (
	"context"
	"errors"
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

type fakeShaper struct{ applied map[int]int }

func (f *fakeShaper) Apply(pid, kbit int) error {
	if f.applied == nil {
		f.applied = map[int]int{}
	}
	f.applied[pid] = kbit
	return nil
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
		Config: fakeCfg{c: model.Config{Bandwidths: []model.Bandwidth{
			{Name: "up", EgressKbit: 5000},
			{Name: "down", EgressKbit: 3000},    // stopped → skipped
			{Name: "hostnet", EgressKbit: 2000}, // host netns → skipped (would throttle the whole host)
		}}},
		Pidder:   fakePidder{pids: map[string]int{"up": 4242, "down": 99, "hostnet": 7}},
		Shaper:   sh,
		Notifier: nt,
		Now:      time.Now,
	}
	m.Tick(context.Background())
	if len(sh.applied) != 1 || sh.applied[4242] != 5000 {
		t.Fatalf("only the running bridge container should be shaped, got %v", sh.applied)
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
