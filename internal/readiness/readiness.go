// Package readiness decides when a managed container is "ready" so the next
// start stage may fire. Most Community-Apps images ship NO HEALTHCHECK, so the
// TCP and running+grace probes are first-class, not a fallback.
package readiness

import (
	"context"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

const (
	defaultTimeout  = 90 * time.Second
	defaultInterval = 1 * time.Second
	dialTimeout     = 3 * time.Second
)

// Snapshot is the minimal live state the prober needs.
type Snapshot struct {
	Running bool
	Health  string // "healthy" / "unhealthy" / "starting" / "none"
	IP      string
}

// Inspector returns a live snapshot for a container.
type Inspector interface {
	Snapshot(ctx context.Context, ref string) (Snapshot, error)
}

// Prober waits for readiness per a node's probe spec. The clock, poll cadence,
// sleeper and dialer are injectable so the whole thing is unit-testable without
// real time or sockets.
type Prober struct {
	Inspector Inspector
	Interval  time.Duration
	Now       func() time.Time
	Sleep     func(ctx context.Context, d time.Duration) bool // false → cancelled
	Dial      func(ctx context.Context, addr string) (net.Conn, error)
	HTTPGet   func(ctx context.Context, url string) (int, error) // status code, or err
}

func (p Prober) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}

func (p Prober) interval() time.Duration {
	if p.Interval > 0 {
		return p.Interval
	}
	return defaultInterval
}

func (p Prober) sleep(ctx context.Context, d time.Duration) bool {
	if p.Sleep != nil {
		return p.Sleep(ctx, d)
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func (p Prober) dial(ctx context.Context, addr string) (net.Conn, error) {
	if p.Dial != nil {
		return p.Dial(ctx, addr)
	}
	d := net.Dialer{Timeout: dialTimeout}
	return d.DialContext(ctx, "tcp", addr)
}

func (p Prober) httpGet(ctx context.Context, url string) (int, error) {
	if p.HTTPGet != nil {
		return p.HTTPGet(ctx, url)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	// Don't chase redirects: a readiness probe must observe the container's OWN status
	// (a boot-time 3xx should count as "up but redirecting", and a redirect to another
	// host must not let some other server's 200 mark this container ready).
	client := &http.Client{
		Timeout:       dialTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096)) // drain a little so the conn can be reused
	_ = resp.Body.Close()
	return resp.StatusCode, nil
}

// WaitReady blocks until the node is ready or its timeout elapses, reporting
// whether it became ready and a short human reason. It satisfies the
// orchestrator's ReadinessChecker.
func (p Prober) WaitReady(ctx context.Context, node model.Node) (bool, string) {
	timeout := time.Duration(node.Probe.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	deadline := p.now().Add(timeout)
	var runningSince time.Time
	for {
		ready, reason := p.probe(ctx, node, &runningSince)
		if ready {
			return true, reason
		}
		if !p.now().Before(deadline) {
			if reason == "" {
				reason = "not ready within timeout"
			}
			return false, reason
		}
		if !p.sleep(ctx, p.interval()) {
			return false, "cancelled"
		}
	}
}

func (p Prober) probe(ctx context.Context, node model.Node, runningSince *time.Time) (bool, string) {
	switch node.Probe.Kind {
	case model.ProbeTCP:
		return p.probeTCP(ctx, node)
	case model.ProbeHTTP:
		return p.probeHTTP(ctx, node)
	case model.ProbeRunning:
		return p.probeRunning(ctx, node, runningSince)
	default: // ProbeHealth (and unknown) gate on the image's HEALTHCHECK
		return p.probeHealth(ctx, node)
	}
}

func (p Prober) probeTCP(ctx context.Context, node model.Node) (bool, string) {
	host := node.Probe.Host
	if host == "" {
		if snap, err := p.Inspector.Snapshot(ctx, node.Name); err == nil && snap.IP != "" {
			host = snap.IP
		} else {
			host = "127.0.0.1"
		}
	}
	addr := net.JoinHostPort(host, strconv.Itoa(node.Probe.Port))
	conn, err := p.dial(ctx, addr)
	if err != nil {
		return false, "port " + addr + " not open yet"
	}
	_ = conn.Close()
	return true, "port " + addr + " open"
}

func (p Prober) probeHTTP(ctx context.Context, node model.Node) (bool, string) {
	host := node.Probe.Host
	if host == "" {
		if snap, err := p.Inspector.Snapshot(ctx, node.Name); err == nil && snap.IP != "" {
			host = snap.IP
		} else {
			host = "127.0.0.1"
		}
	}
	port := node.Probe.Port
	if port == 0 {
		port = 80
	}
	path := node.Probe.Path
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	url := "http://" + net.JoinHostPort(host, strconv.Itoa(port)) + path
	code, err := p.httpGet(ctx, url)
	if err != nil {
		return false, "http " + url + " unreachable"
	}
	// a 2xx/3xx means the app is serving; 4xx/5xx means it is up but not ready yet.
	if code >= 200 && code < 400 {
		return true, "http " + strconv.Itoa(code)
	}
	return false, "http " + strconv.Itoa(code)
}

func (p Prober) probeRunning(ctx context.Context, node model.Node, runningSince *time.Time) (bool, string) {
	snap, err := p.Inspector.Snapshot(ctx, node.Name)
	if err != nil {
		return false, "inspect failed: " + err.Error()
	}
	if !snap.Running {
		*runningSince = time.Time{}
		return false, "not running yet"
	}
	if runningSince.IsZero() {
		*runningSince = p.now()
	}
	grace := time.Duration(node.Probe.GraceSeconds) * time.Second
	if p.now().Sub(*runningSince) >= grace {
		return true, "running"
	}
	return false, "running, waiting out grace"
}

func (p Prober) probeHealth(ctx context.Context, node model.Node) (bool, string) {
	snap, err := p.Inspector.Snapshot(ctx, node.Name)
	if err != nil {
		return false, "inspect failed: " + err.Error()
	}
	switch snap.Health {
	case "healthy":
		return true, "healthy"
	case "none", "":
		// No HEALTHCHECK to gate on. Blocking forever would be worse than
		// treating a running container as ready, so fall back to running.
		if snap.Running {
			return true, "running (no healthcheck)"
		}
		return false, "not running"
	default: // "starting" / "unhealthy" — keep waiting; it may recover
		return false, "health=" + snap.Health
	}
}
