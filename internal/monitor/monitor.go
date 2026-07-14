// Package monitor is the always-on automation loop of the host supervisor: it
// fires scheduled container actions, watches configured containers and restarts
// them when they go unhealthy or exit, and sends notifications on failures.
// It reads its config from the store on every tick, so changes take effect live.
package monitor

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/junkerderprovinz/cannonadecommand/internal/model"
)

// Docker is the small lifecycle surface the monitor needs (read + safe verbs).
type Docker interface {
	List(ctx context.Context) ([]model.Container, error)
	Start(ctx context.Context, name string) error
	Stop(ctx context.Context, name string) error
	Restart(ctx context.Context, name string) error
}

// ConfigSource yields the current automation config (the store).
type ConfigSource interface {
	LoadConfig() (model.Config, error)
}

// Pidder returns a container's host PID (for entering its network namespace).
type Pidder interface {
	PID(ctx context.Context, name string) (int, error)
}

// Shaper applies egress (upload) + ingress (download) rate limits (kbit) on `iface` to the
// container whose process is pid (iface is the Settings-configured interface; blank means
// auto-detect, then the netshape default). A direction with kbit<=0 is cleared; (0,0)
// clears both. DetectIface returns the container's default-route device ("" = unknown).
type Shaper interface {
	Apply(iface string, pid, egressKbit, ingressKbit int) error
	DetectIface(pid int) string
}

// Notifier delivers an alert (Unraid notification and/or webhook per cfg).
type Notifier interface {
	Notify(ctx context.Context, cfg model.Notify, subject, desc, importance string)
}

// Statter samples a container's LIVE (instantaneous) resource usage — the CPU%
// the idle-stop watcher uses as its liveness signal. It must be a real delta
// sample (two reads), not a one-shot lifetime average. Optional: without it the
// idle-stop feature is inert (like Pidder/Shaper for bandwidth).
type Statter interface {
	StatsLive(ctx context.Context, name string) (model.Stats, error)
}

// Monitor runs the schedule + watchdog loop.
type Monitor struct {
	Docker   Docker
	Config   ConfigSource
	Notifier Notifier
	Pidder   Pidder           // optional: container PID for bandwidth shaping
	Shaper   Shaper           // optional: applies the egress rate limit
	Statter  Statter          // optional: live CPU sampling for idle-stop
	Interval time.Duration    // default 30s
	Now      func() time.Time // injectable clock (tests)

	mu         sync.Mutex
	firedAt    map[string]string      // schedule key → "YYYY-MM-DD HH:MM" it last fired
	restarts   map[string][]time.Time // watchdog restart timestamps per container (per-hour cap)
	notifiedAt map[string]time.Time   // notify-throttle key → last time it was sent
	shaped     map[string]string      // container name → the iface we shaped it on (clear on removal / iface change)
	bwLast     map[string]string      // last shaping attempt per container (formatted), surfaced by /api/bwstatus
	idle       map[string]*idleTrack  // idle-stop: per-container idle clock + last network sample
	kickCh     chan struct{}          // nudge from the API: run a tick NOW (config just changed)
}

// idleTrack is the idle-stop watcher's per-container memory: when the container
// last looked busy (the idle clock), and its last cumulative network byte count
// (so a low-CPU but network-active container is kept alive).
type idleTrack struct {
	busyAt   time.Time // last time it looked busy, or when first observed (idle measured from here)
	netBytes uint64    // cumulative RX+TX at netAt
	netAt    time.Time
	hasNet   bool
}

// notifyThrottle is how long the monitor waits before re-sending the same kind of
// alert for the same container, so a stuck container can't spam every tick.
const notifyThrottle = 55 * time.Minute

// Run ticks until the context is cancelled.
func (m *Monitor) Run(ctx context.Context) {
	if m.Interval <= 0 {
		m.Interval = 30 * time.Second
	}
	if m.Now == nil {
		m.Now = time.Now
	}
	m.mu.Lock()
	if m.kickCh == nil {
		m.kickCh = make(chan struct{}, 1)
	}
	kick := m.kickCh
	m.mu.Unlock()
	t := time.NewTicker(m.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.Tick(ctx)
		case <-kick:
			m.Tick(ctx)
		}
	}
}

// Kick asks the running loop for an immediate tick (non-blocking) — the API calls
// it after a config save so a new bandwidth limit applies NOW, not up to 30s later.
func (m *Monitor) Kick() {
	m.mu.Lock()
	if m.kickCh == nil {
		m.kickCh = make(chan struct{}, 1)
	}
	ch := m.kickCh
	m.mu.Unlock()
	select {
	case ch <- struct{}{}:
	default:
	}
}

// Tick is a single automation pass (exported so tests drive it deterministically).
func (m *Monitor) Tick(ctx context.Context) {
	if m.Now == nil {
		m.Now = time.Now
	}
	cfg, err := m.Config.LoadConfig()
	if err != nil {
		return
	}
	m.tickSchedules(ctx, cfg)
	m.tickWatchdogs(ctx, cfg)
	m.tickBandwidths(ctx, cfg)
	m.tickIdleStop(ctx, cfg)
}

// defaultIdleCPUPct is the "idle" threshold used when an IdleStop leaves
// CPUThresholdPct at 0 — a container drawing at or below this much CPU counts as idle.
const defaultIdleCPUPct = 5.0

// idleNetFloorBytesPerSec is the network-activity floor: a container moving more
// than this many bytes/second (RX+TX) is treated as ACTIVE even at low CPU, so a
// low-CPU-but-serving container (a running download, a streaming session) is not
// idle-stopped mid-transfer. Below it is negligible chatter (heartbeats, DNS).
const idleNetFloorBytesPerSec = 8 * 1024 // 8 KiB/s

// tickIdleStop stops each configured container that has stayed idle for its whole
// IdleMinutes window — CC's take on ContainerNursery's sleep-on-idle, gated on
// LIVENESS. "Idle" means BOTH low CPU (live delta sample, via Statter) AND low
// network throughput (RX+TX rate below the floor). It samples only the ENABLED,
// RUNNING containers. Safety rails: a busy sample (CPU high, network active, or
// an unreadable sample) resets the idle clock so an active container is never
// stopped; a container's first observation starts its clock at "now" so a fresh
// supervisor never stops one it has not yet watched for the full window; a
// non-running container is forgotten so a later restart gets a fresh window.
func (m *Monitor) tickIdleStop(ctx context.Context, cfg model.Config) {
	if m.Statter == nil {
		return
	}
	desired := make(map[string]model.IdleStop, len(cfg.IdleStops))
	for _, is := range cfg.IdleStops {
		if is.Enabled && is.IdleMinutes > 0 {
			desired[is.Name] = is
		}
	}
	if len(desired) == 0 {
		m.mu.Lock()
		m.idle = nil // nothing configured → drop stale tracking
		m.mu.Unlock()
		return
	}
	list, err := m.Docker.List(ctx)
	if err != nil {
		return
	}
	byName := make(map[string]model.Container, len(list))
	for _, c := range list {
		byName[c.Name] = c
	}
	now := m.Now()
	// Prune the idle clock of every container no longer in the desired set (disabled,
	// removed, or its minutes zeroed). Otherwise a stale, hours-old busyAt would survive a
	// disable and idle-stop the container the instant it is re-enabled, instead of granting
	// a fresh full-window observation.
	m.mu.Lock()
	for n := range m.idle {
		if _, ok := desired[n]; !ok {
			delete(m.idle, n)
		}
	}
	m.mu.Unlock()
	// Collect the containers eligible to sample: running, own network namespace. A
	// host/container-networked container has NO per-container network counters (docker
	// stats reports 0B I/O), so its network-idle can't be measured — and CPU alone can't
	// tell a truly-idle container from a low-CPU one serving a large transfer. Rather than
	// risk stopping such a container mid-transfer, we SKIP it and notify once (mirrors how
	// the bandwidth shaper refuses host/container-net containers).
	type cand struct {
		name string
		is   model.IdleStop
	}
	var cands []cand
	for name, is := range desired {
		c, ok := byName[name]
		if !ok || c.State != "running" {
			m.mu.Lock()
			delete(m.idle, name) // gone/stopped → fresh window on the next start
			m.mu.Unlock()
			continue
		}
		if sharedNetns(c) {
			m.mu.Lock()
			delete(m.idle, name)
			m.mu.Unlock()
			if m.throttle(name+"|idlenetns", now) {
				m.notify(ctx, cfg.Notify, "Idle-stop skipped: "+name,
					name+" uses host/container networking, so per-container idle can't be measured — it is not auto-stopped.", "warning")
			}
			continue
		}
		cands = append(cands, cand{name, is})
	}
	if len(cands) == 0 {
		return
	}
	// Sample CPU/network CONCURRENTLY (StatsLive blocks ~1s each for its delta), bounded so
	// a large idle-stop set can't flood the docker socket. The gather shares no state, so it
	// needs no lock; the decision below runs sequentially under m.mu.
	samples := make([]model.Stats, len(cands))
	serrs := make([]error, len(cands))
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for i := range cands {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			samples[i], serrs[i] = m.Statter.StatsLive(ctx, cands[i].name)
		}(i)
	}
	wg.Wait()
	for i := range cands {
		name, is := cands[i].name, cands[i].is
		threshold := is.CPUThresholdPct
		if threshold <= 0 {
			threshold = defaultIdleCPUPct
		}
		st, serr := samples[i], serrs[i]
		busy := serr != nil || st.CPUPercent > threshold // unreadable sample → treat as active
		m.mu.Lock()
		if m.idle == nil {
			m.idle = map[string]*idleTrack{}
		}
		tr := m.idle[name]
		if tr == nil {
			tr = &idleTrack{}
			m.idle[name] = tr
		}
		// Network-activity guard: even at low CPU, meaningful traffic since the last
		// sample means the container is in use. A counter going backwards = a restart
		// (activity). Only trust the sample when the read succeeded.
		if serr == nil {
			netBytes := st.NetRx + st.NetTx
			if tr.hasNet {
				if elapsed := now.Sub(tr.netAt).Seconds(); elapsed > 0 {
					if netBytes < tr.netBytes || float64(netBytes-tr.netBytes)/elapsed > idleNetFloorBytesPerSec {
						busy = true
					}
				}
			}
			tr.netBytes, tr.netAt, tr.hasNet = netBytes, now, true
		}
		if busy || tr.busyAt.IsZero() {
			tr.busyAt = now // busy, or first observation: (re)start the idle clock
			m.mu.Unlock()
			continue
		}
		idleFor := now.Sub(tr.busyAt)
		m.mu.Unlock()
		if idleFor < time.Duration(is.IdleMinutes)*time.Minute {
			continue
		}
		if err := m.Docker.Stop(ctx, name); err != nil {
			if m.throttle(name+"|idlestopfail", now) {
				m.notify(ctx, cfg.Notify, "Idle-stop failed", name+": "+err.Error(), "warning")
			}
			continue
		}
		m.mu.Lock()
		delete(m.idle, name) // stopped → forget; a restart gets a fresh window
		m.mu.Unlock()
		if m.throttle(name+"|idlestopped", now) {
			m.notify(ctx, cfg.Notify, "Idle-stopped "+name,
				name+" was idle (CPU <= "+strconv.Itoa(int(threshold))+"%, low network) for "+strconv.Itoa(is.IdleMinutes)+" min and was stopped", "normal")
		}
	}
}

// tickBandwidths (re-)applies each configured egress rate limit to its running
// container, and clears the rule from a container whose entry was removed. tc rules
// live in the container's netns and are lost on restart, so we re-assert them every
// tick (tc qdisc replace is idempotent). A container that SHARES a netns (--network=host
// or =container:X) is skipped — shaping there would hit the HOST's or another
// container's interface. Failures/skips are notified (throttled).
func (m *Monitor) tickBandwidths(ctx context.Context, cfg model.Config) {
	if m.Shaper == nil || m.Pidder == nil {
		return
	}
	if len(cfg.Bandwidths) == 0 {
		m.mu.Lock()
		empty := len(m.shaped) == 0
		m.mu.Unlock()
		if empty {
			return // nothing configured and nothing to clear
		}
	}
	containers, err := m.Docker.List(ctx)
	if err != nil {
		return
	}
	state := make(map[string]model.Container, len(containers))
	for _, c := range containers {
		state[c.Name] = c
	}
	desired := make(map[string]model.Bandwidth, len(cfg.Bandwidths))
	for _, b := range cfg.Bandwidths {
		if b.EgressKbit > 0 || b.IngressKbit > 0 {
			desired[b.Name] = b
		}
	}
	iface := cfg.ShapeIface
	// Snapshot what we currently have shaped (name → the iface it was shaped ON).
	m.mu.Lock()
	if m.shaped == nil {
		m.shaped = map[string]string{}
	}
	prev := make(map[string]string, len(m.shaped))
	for n, ifc := range m.shaped {
		prev[n] = ifc
	}
	m.mu.Unlock()
	// Clear a rule when the container is no longer desired OR is now shaped on a DIFFERENT
	// interface (the admin changed shape_iface). Crucially, clear on the iface it was
	// ACTUALLY shaped on (the stored one), not the current setting — otherwise changing
	// the interface would leave a stale tbf qdisc throttling the old NIC until a restart.
	// blank iface = AUTO: each container's device is detected from its default route,
	// so a stored (auto-resolved) iface counts as "same" while the setting stays blank.
	autoIface := strings.TrimSpace(iface) == ""
	for name, oldIface := range prev {
		if _, want := desired[name]; want && (oldIface == iface || autoIface) {
			continue // still desired on the same iface — the apply loop re-asserts it
		}
		// Only FORGET the container once we've actually cleared it (or its netns is gone).
		// If it's still running but its PID lookup fails this tick, keep it in `shaped` so
		// the clear is retried next tick — otherwise a successfully-applied qdisc would leak.
		cleared := true
		if c, ok := state[name]; !ok {
			cleared = true // container gone entirely → nothing to clear, safe to forget
		} else if c.State == "running" && !sharedNetns(c) {
			if pid, e := m.Pidder.PID(ctx, name); e == nil && pid > 0 {
				_ = m.Shaper.Apply(oldIface, pid, 0, 0) // clear both directions on the OLD iface
			} else {
				cleared = false // can't reach the netns this tick → retry next tick
			}
		}
		if cleared {
			m.mu.Lock()
			delete(m.shaped, name)
			m.mu.Unlock()
		}
	}
	// apply the desired rules to running, non-shared-netns containers on the CURRENT iface
	now := m.Now()
	for name, bw := range desired {
		c, ok := state[name]
		if !ok || c.State != "running" {
			continue
		}
		if sharedNetns(c) {
			if m.throttle(name+"|bwshared", now) && m.Notifier != nil {
				m.Notifier.Notify(ctx, cfg.Notify, "Bandwidth not applied: "+name,
					"Shaping is skipped for a host/container-network container (it would shape the host or another container).", "warning")
			}
			continue
		}
		pid, perr := m.Pidder.PID(ctx, name)
		if perr != nil || pid <= 0 {
			continue
		}
		ifc := iface
		if autoIface {
			ifc = m.Shaper.DetectIface(pid) // "" falls through to the netshape default (eth0)
		}
		err := m.Shaper.Apply(ifc, pid, bw.EgressKbit, bw.IngressKbit)
		// Track this container on `iface` even if Apply ERRORED: Apply does egress and
		// ingress independently and may have applied one before the other failed, so it must
		// stay in `shaped` or that applied direction would leak (never cleared on removal).
		m.mu.Lock()
		m.shaped[name] = ifc
		if m.bwLast == nil {
			m.bwLast = map[string]string{}
		}
		lbl := ifc
		if lbl == "" {
			lbl = "auto(eth0)"
		}
		if err != nil {
			m.bwLast[name] = now.Format("15:04:05") + " iface=" + lbl + " FEHLER: " + err.Error()
		} else {
			m.bwLast[name] = now.Format("15:04:05") + " iface=" + lbl + " ok"
		}
		m.mu.Unlock()
		if err != nil {
			if m.throttle(name+"|bwfail", now) && m.Notifier != nil {
				m.Notifier.Notify(ctx, cfg.Notify, "Bandwidth shaping failed: "+name, err.Error(), "warning")
			}
			continue
		}
	}
}

// sharedNetns reports whether a container shares another network namespace (the host's
// or another container's), where entering it to run tc would shape the wrong interface.
// LastBwApply returns the monitor's most recent shaping attempt for the container
// ("" = not attempted since daemon start) — shown in the bandwidth editor.
func (m *Monitor) LastBwApply(name string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.bwLast[name]
}

func sharedNetns(c model.Container) bool {
	n := c.Network
	return n == "host" || strings.HasPrefix(n, "container:")
}

func (m *Monitor) tickSchedules(ctx context.Context, cfg model.Config) {
	if len(cfg.Schedules) == 0 {
		return
	}
	now := m.Now()
	hm := now.Format("15:04")
	minuteKey := now.Format("2006-01-02 15:04")
	wd := int(now.Weekday()) // 0=Sun … 6=Sat
	for _, s := range cfg.Schedules {
		if !s.Enabled || s.Time != hm {
			continue
		}
		if len(s.Days) > 0 && !containsInt(s.Days, wd) {
			continue
		}
		key := s.Name + "|" + s.Action + "|" + s.Time
		m.mu.Lock()
		if m.firedAt == nil {
			m.firedAt = map[string]string{}
		}
		already := m.firedAt[key] == minuteKey
		m.mu.Unlock()
		if already {
			continue
		}
		if err := m.act(ctx, s.Name, s.Action); err != nil {
			// Do NOT mark it fired: a transient failure retries on the next tick
			// within this same minute instead of silently dropping the occurrence.
			// Throttle the alert so a persistently-failing schedule (bad name) does
			// not re-notify on every retry tick.
			if m.throttle(s.Name+"|schedfail|"+s.Action+"|"+s.Time, now) {
				m.notify(ctx, cfg.Notify, "Schedule failed", s.Name+": "+s.Action+" — "+err.Error(), "warning")
			}
			continue
		}
		m.mu.Lock()
		m.firedAt[key] = minuteKey // fire once per minute even though we tick faster
		m.mu.Unlock()
	}
}

func (m *Monitor) tickWatchdogs(ctx context.Context, cfg model.Config) {
	if len(cfg.Watchdogs) == 0 {
		return
	}
	list, err := m.Docker.List(ctx)
	if err != nil {
		return
	}
	byName := make(map[string]model.Container, len(list))
	for _, c := range list {
		byName[c.Name] = c
	}
	now := m.Now()
	for _, w := range cfg.Watchdogs {
		if !w.Enabled {
			continue
		}
		c, ok := byName[w.Name]
		if !ok {
			continue
		}
		trigger := ""
		if w.OnUnhealthy && c.Health == "unhealthy" {
			trigger = "unhealthy"
		} else if w.OnExit && c.State == "exited" && isCrashExit(c.ExitCode) {
			// Only a CRASH exit is acted on. Signal terminations from a manual /
			// graceful stop (0, or 128+signal from `docker stop`/`kill`) are NOT
			// crashes, so the watchdog never fights an intentional stop.
			trigger = "crashed (exit " + strconv.Itoa(c.ExitCode) + ")"
		}
		if trigger == "" {
			continue
		}
		if !m.allowRestart(w, now) {
			if m.throttle(w.Name+"|gaveup", now) {
				m.notify(ctx, cfg.Notify, "Watchdog gave up", w.Name+": too many restarts (>"+strconv.Itoa(w.MaxRestarts)+"/h)", "alert")
			}
			continue
		}
		// Count the attempt toward the per-hour cap BEFORE trying, so a restart that
		// keeps erroring still hits the cap and gives up instead of alerting forever.
		// With no cap (0 = unlimited) there is nothing to record — and skipping it
		// keeps the per-container history from growing without bound.
		if w.MaxRestarts > 0 {
			m.recordRestart(w.Name, now)
		}
		if err := m.Docker.Restart(ctx, w.Name); err != nil {
			if m.throttle(w.Name+"|failed", now) {
				m.notify(ctx, cfg.Notify, "Watchdog restart failed", w.Name+": "+err.Error(), "alert")
			}
			continue
		}
		// Throttle the success alert too: a flapping container must not notify every
		// cycle (the per-hour cap, when set, still yields a single "gave up").
		if m.throttle(w.Name+"|restarted", now) {
			m.notify(ctx, cfg.Notify, "Watchdog restarted "+w.Name, w.Name+" was "+trigger+" and was restarted", "warning")
		}
	}
}

// isCrashExit reports whether an exit code looks like an application crash rather
// than an intentional stop. `docker stop`/`docker kill` terminate via signals,
// surfacing as 128+signal — 130 (SIGINT), 137 (SIGKILL, also the stop-timeout
// kill), 143 (SIGTERM) — which are treated as intentional stops the watchdog must
// NOT fight. Trade-off: an OOM kill also surfaces as 137 and so is NOT
// auto-restarted (Docker only reveals OOMKilled via a full per-container inspect).
func isCrashExit(code int) bool {
	switch code {
	case 0, 130, 137, 143:
		return false
	}
	return true
}

func (m *Monitor) act(ctx context.Context, name, action string) error {
	switch action {
	case "start":
		return m.Docker.Start(ctx, name)
	case "stop":
		return m.Docker.Stop(ctx, name)
	case "restart":
		return m.Docker.Restart(ctx, name)
	}
	return nil
}

// allowRestart reports whether another restart is within the per-hour cap; it
// also prunes the container's restart history to the last hour.
func (m *Monitor) allowRestart(w model.Watchdog, now time.Time) bool {
	if w.MaxRestarts <= 0 {
		return true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.restarts == nil {
		m.restarts = map[string][]time.Time{}
	}
	cutoff := now.Add(-time.Hour)
	recent := m.restarts[w.Name][:0]
	for _, t := range m.restarts[w.Name] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	m.restarts[w.Name] = recent
	return len(recent) < w.MaxRestarts
}

func (m *Monitor) recordRestart(name string, now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.restarts == nil {
		m.restarts = map[string][]time.Time{}
	}
	m.restarts[name] = append(m.restarts[name], now)
}

// throttle returns true at most once per notifyThrottle window for the given
// key (e.g. "<name>|gaveup" or "<name>|failed"), so a container stuck in a
// restart loop doesn't spam the same alert every tick. The first call always
// passes; subsequent calls within the window are suppressed.
func (m *Monitor) throttle(key string, now time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.notifiedAt == nil {
		m.notifiedAt = map[string]time.Time{}
	}
	if last, ok := m.notifiedAt[key]; ok && now.Sub(last) < notifyThrottle {
		return false
	}
	m.notifiedAt[key] = now
	return true
}

func (m *Monitor) notify(ctx context.Context, n model.Notify, subject, desc, importance string) {
	if m.Notifier == nil || (!n.Unraid && n.Webhook == "") {
		return
	}
	m.Notifier.Notify(ctx, n, subject, desc, importance)
}

func containsInt(xs []int, x int) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
