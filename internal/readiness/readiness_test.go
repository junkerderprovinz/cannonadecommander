package readiness

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

// fakeClock lets Sleep advance a virtual clock so timeout logic is deterministic.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }
func (c *fakeClock) sleep(_ context.Context, d time.Duration) bool {
	c.t = c.t.Add(d)
	return true
}

// scriptedInspector returns successive snapshots, repeating the last one.
type scriptedInspector struct {
	snaps []Snapshot
	i     int
}

func (s *scriptedInspector) Snapshot(_ context.Context, _ string) (Snapshot, error) {
	snap := s.snaps[s.i]
	if s.i < len(s.snaps)-1 {
		s.i++
	}
	return snap, nil
}

func newProber(insp Inspector, clk *fakeClock) Prober {
	return Prober{Inspector: insp, Interval: time.Second, Now: clk.now, Sleep: clk.sleep}
}

func healthNode() model.Node {
	return model.Node{Name: "x", Probe: model.Probe{Kind: model.ProbeHealth, TimeoutSeconds: 30}}
}

func TestWaitReady_HealthBecomesHealthy(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{
		{Running: true, Health: "starting"},
		{Running: true, Health: "starting"},
		{Running: true, Health: "healthy"},
	}}
	ready, reason := newProber(insp, clk).WaitReady(context.Background(), healthNode())
	if !ready {
		t.Fatalf("expected ready, got not-ready (%s)", reason)
	}
	if reason != "healthy" {
		t.Fatalf("reason = %q, want healthy", reason)
	}
}

func TestWaitReady_Timeout(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{{Running: true, Health: "starting"}}}
	ready, reason := newProber(insp, clk).WaitReady(context.Background(), healthNode())
	if ready {
		t.Fatalf("expected timeout, got ready")
	}
	if reason != "health=starting" {
		t.Fatalf("reason = %q, want health=starting", reason)
	}
}

func TestWaitReady_HealthNoneFallsBackToRunning(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{{Running: true, Health: "none"}}}
	ready, reason := newProber(insp, clk).WaitReady(context.Background(), healthNode())
	if !ready || reason != "running (no healthcheck)" {
		t.Fatalf("no-healthcheck running container should be ready; got ready=%v reason=%q", ready, reason)
	}
}

func TestWaitReady_RunningGrace(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{{Running: true}}}
	node := model.Node{Name: "x", Probe: model.Probe{Kind: model.ProbeRunning, GraceSeconds: 5, TimeoutSeconds: 30}}
	start := clk.now()
	ready, _ := newProber(insp, clk).WaitReady(context.Background(), node)
	if !ready {
		t.Fatalf("expected ready after grace")
	}
	// The clock must have advanced at least the 5s grace before readiness.
	if clk.now().Sub(start) < 5*time.Second {
		t.Fatalf("became ready before the grace period elapsed (%v)", clk.now().Sub(start))
	}
}

func TestWaitReady_TCP(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{{Running: true, IP: "172.17.0.9"}}}
	p := newProber(insp, clk)
	attempts := 0
	p.Dial = func(_ context.Context, addr string) (net.Conn, error) {
		if addr != "172.17.0.9:8080" {
			t.Fatalf("dialed %q, want the container IP:port", addr)
		}
		attempts++
		if attempts < 3 {
			return nil, errors.New("connection refused")
		}
		c1, c2 := net.Pipe()
		_ = c2.Close()
		return c1, nil
	}
	node := model.Node{Name: "x", Probe: model.Probe{Kind: model.ProbeTCP, Port: 8080, TimeoutSeconds: 30}}
	ready, reason := p.WaitReady(context.Background(), node)
	if !ready {
		t.Fatalf("expected ready once the port opened, got %q", reason)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 dial attempts, got %d", attempts)
	}
}

func TestWaitReady_TCPExplicitHost(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	insp := &scriptedInspector{snaps: []Snapshot{{Running: true}}}
	p := newProber(insp, clk)
	var dialed string
	p.Dial = func(_ context.Context, addr string) (net.Conn, error) {
		dialed = addr
		c1, c2 := net.Pipe()
		_ = c2.Close()
		return c1, nil
	}
	node := model.Node{Name: "x", Probe: model.Probe{Kind: model.ProbeTCP, Host: "10.0.0.5", Port: 51820, TimeoutSeconds: 30}}
	if ready, _ := p.WaitReady(context.Background(), node); !ready {
		t.Fatal("expected ready")
	}
	if dialed != "10.0.0.5:51820" {
		t.Fatalf("dialed %q, want the explicit host:port", dialed)
	}
}
