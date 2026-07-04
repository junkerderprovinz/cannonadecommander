package dockercli

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

func testServer(t *testing.T) (*Client, *httptest.Server) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/v1.44/containers/json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"Id":"aaa","Names":["/gluetun"],"Image":"qmcgaw/gluetun","State":"running","Status":"Up 2 hours (healthy)",
			 "Ports":[{"PrivatePort":8000,"PublicPort":8888,"Type":"tcp"},{"PrivatePort":8000,"PublicPort":8888,"Type":"tcp"}],
			 "NetworkSettings":{"Networks":{"br0.20":{"IPAddress":"192.168.20.51"}}}},
			{"Id":"bbb","Names":["/sonarr"],"Image":"lscr.io/linuxserver/sonarr","State":"exited","Status":"Exited (0) 5 minutes ago","Mounts":[{"Type":"bind","Source":"/mnt/user/appdata/sonarr","Destination":"/config","RW":true},{"Type":"bind","Source":"/mnt/user/media","Destination":"/tv","RW":false},{"Type":"tmpfs","Source":"","Destination":""}],"NetworkSettings":{"Networks":{"br0.20":{"IPAddress":"","IPAMConfig":{"IPv4Address":"192.168.20.9"}}}}}
		]`))
	})
	mux.HandleFunc("/v1.44/containers/gluetun/json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"State":{"Running":true,"Health":{"Status":"healthy"}},"NetworkSettings":{"IPAddress":"172.17.0.2"}}`))
	})
	mux.HandleFunc("/v1.44/containers/plain/json", func(w http.ResponseWriter, _ *http.Request) {
		// a container with no HEALTHCHECK: State.Health is absent
		_, _ = w.Write([]byte(`{"State":{"Running":true},"NetworkSettings":{"IPAddress":"172.17.0.3"}}`))
	})
	mux.HandleFunc("/v1.44/containers/gluetun/start", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/v1.44/containers/already/start", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotModified)
	})
	mux.HandleFunc("/v1.44/containers/missing/start", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"no such container"}`, http.StatusNotFound)
	})
	mux.HandleFunc("/v1.44/containers/gluetun/stats", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{
			"cpu_stats":{"cpu_usage":{"total_usage":1100},"system_cpu_usage":11000,"online_cpus":2},
			"precpu_stats":{"cpu_usage":{"total_usage":1000},"system_cpu_usage":10000},
			"memory_stats":{"usage":209715200,"limit":1048576000,"stats":{"cache":52428800}},
			"networks":{"eth0":{"rx_bytes":1000,"tx_bytes":200},"eth1":{"rx_bytes":50,"tx_bytes":5}}
		}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return New(srv.Client(), srv.URL), srv
}

func TestList(t *testing.T) {
	c, _ := testServer(t)
	cs, err := c.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(cs) != 2 {
		t.Fatalf("got %d containers, want 2", len(cs))
	}
	g := cs[0]
	if g.Name != "gluetun" || g.State != "running" || g.Health != "healthy" {
		t.Fatalf("gluetun parsed wrong: %+v", g)
	}
	if g.Network != "br0.20" || g.IP != "192.168.20.51" {
		t.Fatalf("gluetun network/ip parsed wrong: %+v", g)
	}
	if len(g.Ports) != 1 || g.Ports[0] != "8888:8000/tcp" {
		t.Fatalf("gluetun ports parsed/deduped wrong: %v", g.Ports)
	}
	if cs[1].Name != "sonarr" || cs[1].State != "exited" || cs[1].Health != "" {
		t.Fatalf("sonarr parsed wrong: %+v", cs[1])
	}
	// a stopped container has no runtime IP; fall back to the configured static IP
	if cs[1].Network != "br0.20" || cs[1].IP != "192.168.20.9" {
		t.Fatalf("stopped container should show its static IP, got %+v", cs[1])
	}
	// mounts show even for a stopped container; the anonymous/no-destination one is dropped
	if len(cs[1].Mounts) != 2 {
		t.Fatalf("sonarr mounts parsed wrong: %+v", cs[1].Mounts)
	}
	if cs[1].Mounts[0].Source != "/mnt/user/appdata/sonarr" || cs[1].Mounts[0].Dest != "/config" || !cs[1].Mounts[0].RW {
		t.Fatalf("sonarr mount[0] wrong: %+v", cs[1].Mounts[0])
	}
	if cs[1].Mounts[1].Dest != "/tv" || cs[1].Mounts[1].RW {
		t.Fatalf("sonarr mount[1] should be read-only /tv: %+v", cs[1].Mounts[1])
	}
}

func TestInspect(t *testing.T) {
	c, _ := testServer(t)
	ins, err := c.Inspect(context.Background(), "gluetun")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if !ins.Running || ins.Health != "healthy" || ins.IP != "172.17.0.2" {
		t.Fatalf("inspect gluetun wrong: %+v", ins)
	}
	// A container with no HEALTHCHECK must report health "none", not empty.
	plain, err := c.Inspect(context.Background(), "plain")
	if err != nil {
		t.Fatalf("Inspect plain: %v", err)
	}
	if plain.Health != "none" {
		t.Fatalf("healthcheck-less container health = %q, want none", plain.Health)
	}
}

func TestStart(t *testing.T) {
	c, _ := testServer(t)
	if err := c.Start(context.Background(), "gluetun"); err != nil {
		t.Fatalf("start 204 should succeed: %v", err)
	}
	if err := c.Start(context.Background(), "already"); err != nil {
		t.Fatalf("start 304 (already running) should be a no-op success: %v", err)
	}
	err := c.Start(context.Background(), "missing")
	if err == nil {
		t.Fatalf("start of a missing container should error")
	}
	if !strings.Contains(err.Error(), "no such container") {
		t.Fatalf("error should carry the api message, got: %v", err)
	}
}

func TestStats(t *testing.T) {
	c, _ := testServer(t)
	s, err := c.Stats(context.Background(), "gluetun")
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	// cpuDelta=100, sysDelta=1000, cpus=2 → (100/1000)*2*100 = 20%
	if s.CPUPercent != 20 {
		t.Fatalf("CPUPercent = %v, want 20", s.CPUPercent)
	}
	// usage 200MiB - cache 50MiB = 150MiB used; limit 1000MiB → 15%
	if s.MemUsed != 157286400 {
		t.Fatalf("MemUsed = %d, want 157286400", s.MemUsed)
	}
	if s.MemPercent != 15 {
		t.Fatalf("MemPercent = %v, want 15", s.MemPercent)
	}
	// net counters are summed across all interfaces (eth0 + eth1)
	if s.NetRx != 1050 || s.NetTx != 205 {
		t.Fatalf("net counters = rx %d / tx %d, want 1050 / 205", s.NetRx, s.NetTx)
	}
}

func TestHealthFromStatus(t *testing.T) {
	cases := map[string]string{
		"Up 2 hours (healthy)":           "healthy",
		"Up 5 minutes (unhealthy)":       "unhealthy",
		"Up 1 second (health: starting)": "starting",
		"Up 3 days":                      "",
		"Exited (0) 1 hour ago":          "",
	}
	for status, want := range cases {
		if got := healthFromStatus(status); got != want {
			t.Errorf("healthFromStatus(%q) = %q, want %q", status, got, want)
		}
	}
}

func TestLimitsAndCpuset(t *testing.T) {
	var gotBody string
	mux := http.NewServeMux()
	mux.HandleFunc("/v1.44/containers/pinme/json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"HostConfig":{"Memory":1073741824,"NanoCpus":1500000000,"CpusetCpus":"0-3,6"}}`))
	})
	mux.HandleFunc("/v1.44/containers/pinme/update", func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := New(srv.Client(), srv.URL)
	lim, err := c.Limits(context.Background(), "pinme")
	if err != nil || lim.MemBytes != 1073741824 || lim.CpusetCPUs != "0-3,6" {
		t.Fatalf("Limits read wrong: %+v err=%v", lim, err)
	}
	if err := c.UpdateResources(context.Background(), "pinme", model.Limits{CpusetCPUs: "0-3"}); err != nil {
		t.Fatalf("update: %v", err)
	}
	if !strings.Contains(gotBody, `"CpusetCpus":"0-3"`) {
		t.Fatalf("update body missing cpuset: %s", gotBody)
	}
	// A memory cap must send Memory and NOT MemorySwap at all: any MemorySwap value (even
	// -1) triggers a memsw cgroup write, which fails on Unraid hosts without swap accounting
	// and silently broke set/remove of a RAM limit. Omitting it keeps swap unlimited.
	if err := c.UpdateResources(context.Background(), "pinme", model.Limits{MemBytes: 2147483648}); err != nil {
		t.Fatalf("update mem: %v", err)
	}
	if !strings.Contains(gotBody, `"Memory":2147483648`) || strings.Contains(gotBody, `"MemorySwap"`) {
		t.Fatalf("memory update must send Memory and NOT MemorySwap, got: %s", gotBody)
	}
}

func TestDemuxLogs(t *testing.T) {
	// non-TTY: two frames [stream 0 0 0 size] + payload
	framed := []byte{1, 0, 0, 0, 0, 0, 0, 5, 'h', 'e', 'l', 'l', 'o', 2, 0, 0, 0, 0, 0, 0, 3, 'e', 'r', 'r'}
	if got := demuxLogs(framed); got != "helloerr" {
		t.Fatalf("demuxLogs(framed) = %q, want %q", got, "helloerr")
	}
	// TTY / raw text (no valid header shape) is returned unchanged
	raw := []byte("plain log line without framing")
	if got := demuxLogs(raw); got != string(raw) {
		t.Fatalf("demuxLogs(raw) = %q, want it unchanged", got)
	}
}

func TestExitCodeFromStatus(t *testing.T) {
	cases := map[string]int{
		"Exited (0) 3 minutes ago":  0,
		"Exited (1) 5 seconds ago":  1,
		"Exited (137) 1 minute ago": 137,
		"Up 2 hours (healthy)":      0,
		"Created":                   0,
		"Exited (garbage) ago":      0,
	}
	for status, want := range cases {
		if got := exitCodeFromStatus(status); got != want {
			t.Errorf("exitCodeFromStatus(%q) = %d, want %d", status, got, want)
		}
	}
}
