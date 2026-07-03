// Package dockercli is a thin client over the Docker Engine API, spoken directly
// over the host's unix socket. Unlike a read-only viewer, this engine WRITES
// (start/stop) as well as reads (list/inspect/stats), so it deliberately exposes
// only a small, safe verb set and never create/exec/build.
package dockercli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

// apiVersion pins a modern Engine API. Engine 29 rejects versions older than
// v1.44; pinning avoids "client version too new/old" negotiation surprises.
const apiVersion = "v1.44"

// Client talks to a Docker daemon.
type Client struct {
	hc   *http.Client
	base string
}

// New builds a client over an explicit http.Client and base URL. Used in tests
// against an httptest server.
func New(hc *http.Client, base string) *Client {
	return &Client{hc: hc, base: strings.TrimRight(base, "/")}
}

// NewUnix builds a client that dials the Docker daemon over its unix socket
// (read-only bind is enough for list/inspect/stats; start/stop need read-write).
func NewUnix(socket string) *Client {
	hc := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socket)
			},
		},
	}
	return &Client{hc: hc, base: "http://docker"}
}

func (c *Client) do(ctx context.Context, method, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.base+"/"+apiVersion+path, nil)
	if err != nil {
		return nil, err
	}
	return c.hc.Do(req)
}

func apiError(resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	msg := strings.TrimSpace(string(body))
	if msg == "" {
		return fmt.Errorf("docker api: %s", resp.Status)
	}
	return fmt.Errorf("docker api: %s: %s", resp.Status, msg)
}

type apiPort struct {
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort"`
	Type        string `json:"Type"`
}

type apiNetwork struct {
	IPAddress string `json:"IPAddress"`
}

type apiContainer struct {
	ID              string    `json:"Id"`
	Names           []string  `json:"Names"`
	Image           string    `json:"Image"`
	State           string    `json:"State"`
	Status          string    `json:"Status"`
	Ports           []apiPort `json:"Ports"`
	NetworkSettings struct {
		Networks map[string]apiNetwork `json:"Networks"`
	} `json:"NetworkSettings"`
}

// List returns every container on the host (running or not).
func (c *Client) List(ctx context.Context) ([]model.Container, error) {
	resp, err := c.do(ctx, "GET", "/containers/json?all=1")
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, apiError(resp)
	}
	var raw []apiContainer
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode containers: %w", err)
	}
	out := make([]model.Container, 0, len(raw))
	for _, r := range raw {
		net, ip := firstNetwork(r.NetworkSettings.Networks)
		out = append(out, model.Container{
			ID:       r.ID,
			Name:     firstName(r.Names),
			Image:    r.Image,
			State:    r.State,
			ExitCode: exitCodeFromStatus(r.Status),
			Health:   healthFromStatus(r.Status),
			Network:  net,
			IP:       ip,
			Ports:    formatPorts(r.Ports),
		})
	}
	return out, nil
}

// firstNetwork returns a deterministic primary network name + its IP.
func firstNetwork(nets map[string]apiNetwork) (string, string) {
	if len(nets) == 0 {
		return "", ""
	}
	names := make([]string, 0, len(nets))
	for k := range nets {
		names = append(names, k)
	}
	sort.Strings(names)
	return names[0], nets[names[0]].IPAddress
}

// formatPorts renders published ports as "public:private/proto" (or just
// "private/proto" when unpublished), de-duplicated.
func formatPorts(ports []apiPort) []string {
	out := make([]string, 0, len(ports))
	seen := map[string]bool{}
	for _, p := range ports {
		var s string
		if p.PublicPort != 0 {
			s = fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, p.Type)
		} else {
			s = fmt.Sprintf("%d/%s", p.PrivatePort, p.Type)
		}
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// Inspect is the authoritative live state of one container.
type Inspect struct {
	Running bool
	Health  string // "healthy" / "unhealthy" / "starting" / "none"
	IP      string
}

func (c *Client) Inspect(ctx context.Context, ref string) (Inspect, error) {
	resp, err := c.do(ctx, "GET", "/containers/"+url.PathEscape(ref)+"/json")
	if err != nil {
		return Inspect{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return Inspect{}, apiError(resp)
	}
	var raw struct {
		State struct {
			Running bool `json:"Running"`
			Health  *struct {
				Status string `json:"Status"`
			} `json:"Health"`
		} `json:"State"`
		NetworkSettings struct {
			IPAddress string `json:"IPAddress"`
		} `json:"NetworkSettings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return Inspect{}, fmt.Errorf("decode inspect: %w", err)
	}
	ins := Inspect{Running: raw.State.Running, IP: raw.NetworkSettings.IPAddress, Health: "none"}
	if raw.State.Health != nil && raw.State.Health.Status != "" {
		ins.Health = raw.State.Health.Status
	}
	return ins, nil
}

// Start starts a container. An already-running container (304) is not an error.
func (c *Client) Start(ctx context.Context, ref string) error {
	return c.post(ctx, "/containers/"+url.PathEscape(ref)+"/start")
}

// Stop stops a container. An already-stopped container (304) is not an error.
func (c *Client) Stop(ctx context.Context, ref string) error {
	return c.post(ctx, "/containers/"+url.PathEscape(ref)+"/stop")
}

// Restart restarts a container.
func (c *Client) Restart(ctx context.Context, ref string) error {
	return c.post(ctx, "/containers/"+url.PathEscape(ref)+"/restart")
}

// Pause pauses a running container.
func (c *Client) Pause(ctx context.Context, ref string) error {
	return c.post(ctx, "/containers/"+url.PathEscape(ref)+"/pause")
}

// Unpause resumes a paused container.
func (c *Client) Unpause(ctx context.Context, ref string) error {
	return c.post(ctx, "/containers/"+url.PathEscape(ref)+"/unpause")
}

func (c *Client) post(ctx context.Context, path string) error {
	resp, err := c.do(ctx, "POST", path)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	// 204 = done, 304 = already in that state — both are success for us.
	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusNotModified {
		return nil
	}
	return apiError(resp)
}

// doBody issues a request carrying a JSON body (the container-update endpoint).
func (c *Client) doBody(ctx context.Context, method, path string, body any) (*http.Response, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+"/"+apiVersion+path, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.hc.Do(req)
}

// Limits reads a container's CONFIGURED resource caps from its HostConfig.
func (c *Client) Limits(ctx context.Context, ref string) (model.Limits, error) {
	resp, err := c.do(ctx, "GET", "/containers/"+url.PathEscape(ref)+"/json")
	if err != nil {
		return model.Limits{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return model.Limits{}, apiError(resp)
	}
	var raw struct {
		HostConfig struct {
			Memory    int64 `json:"Memory"`
			NanoCpus  int64 `json:"NanoCpus"`
			CpuQuota  int64 `json:"CpuQuota"`
			CpuPeriod int64 `json:"CpuPeriod"`
		} `json:"HostConfig"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return model.Limits{}, fmt.Errorf("decode limits: %w", err)
	}
	// A container capped the legacy way (--cpu-quota/--cpu-period) has NanoCpus 0;
	// show the effective CPU count so the editor doesn't report "no limit".
	nano := raw.HostConfig.NanoCpus
	if nano == 0 && raw.HostConfig.CpuQuota > 0 && raw.HostConfig.CpuPeriod > 0 {
		nano = raw.HostConfig.CpuQuota * 1_000_000_000 / raw.HostConfig.CpuPeriod
	}
	return model.Limits{MemBytes: raw.HostConfig.Memory, NanoCPUs: nano}, nil
}

// UpdateResources sets a container's memory + CPU caps via Docker's
// container-update endpoint: applied LIVE (no restart) and persisted by Docker
// across restarts. Only the fields the caller actually set (> 0) are sent, so a
// zero field LEAVES that cap unchanged — Docker's update ignores a 0 (it cannot
// REMOVE a cap; that needs recreating the container). Setting NanoCpus also
// clears any legacy CpuQuota/CpuPeriod so the two can't conflict on next restart.
func (c *Client) UpdateResources(ctx context.Context, ref string, l model.Limits) error {
	body := map[string]int64{}
	if l.MemBytes > 0 {
		body["Memory"] = l.MemBytes
		body["MemorySwap"] = l.MemBytes // cap total at Memory (no extra swap)
	}
	if l.NanoCPUs > 0 {
		body["NanoCpus"] = l.NanoCPUs
		body["CpuQuota"] = 0
		body["CpuPeriod"] = 0
	}
	if len(body) == 0 {
		return nil // nothing to change
	}
	resp, err := c.doBody(ctx, "POST", "/containers/"+url.PathEscape(ref)+"/update", body)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return apiError(resp)
	}
	return nil
}

// dockerStats is the raw docker /stats response we compute a model.Stats from.
type dockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  uint64 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
		Stats struct {
			Cache uint64 `json:"cache"`
		} `json:"stats"`
	} `json:"memory_stats"`
}

// Stats returns a one-shot resource snapshot (no streaming).
func (c *Client) Stats(ctx context.Context, ref string) (model.Stats, error) {
	resp, err := c.do(ctx, "GET", "/containers/"+url.PathEscape(ref)+"/stats?stream=false&one-shot=true")
	if err != nil {
		return model.Stats{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return model.Stats{}, apiError(resp)
	}
	var raw dockerStats
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return model.Stats{}, fmt.Errorf("decode stats: %w", err)
	}
	return computeStats(raw), nil
}

// computeStats mirrors the docker CLI's own CPU%/mem math and is a pure function
// so it can be unit-tested with a canned snapshot.
func computeStats(s dockerStats) model.Stats {
	out := model.Stats{}
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	cpus := float64(s.CPUStats.OnlineCPUs)
	if cpus == 0 {
		cpus = 1
	}
	if cpuDelta > 0 && sysDelta > 0 {
		out.CPUPercent = round2((cpuDelta / sysDelta) * cpus * 100)
	}
	// Memory used excludes page cache, matching `docker stats`.
	used := s.MemoryStats.Usage
	if s.MemoryStats.Stats.Cache <= used {
		used -= s.MemoryStats.Stats.Cache
	}
	out.MemUsed = used
	out.MemLimit = s.MemoryStats.Limit
	if s.MemoryStats.Limit > 0 {
		out.MemPercent = round2(float64(used) / float64(s.MemoryStats.Limit) * 100)
	}
	return out
}

func round2(f float64) float64 {
	return float64(int64(f*100+0.5)) / 100
}

func firstName(names []string) string {
	if len(names) > 0 {
		return strings.TrimPrefix(names[0], "/")
	}
	return ""
}

// exitCodeFromStatus reads the exit code out of the /containers/json Status
// string for a stopped container ("Exited (137) 5 minutes ago") — cheaper than
// inspecting each one. 0 for anything not shaped like an exit (running/created).
func exitCodeFromStatus(status string) int {
	i := strings.Index(status, "Exited (")
	if i < 0 {
		return 0
	}
	rest := status[i+len("Exited ("):]
	j := strings.IndexByte(rest, ')')
	if j < 0 {
		return 0
	}
	n, err := strconv.Atoi(rest[:j])
	if err != nil {
		return 0
	}
	return n
}

// healthFromStatus best-effort reads health from the /containers/json Status
// string ("Up 2 hours (healthy)"), which is cheaper than inspecting each one.
func healthFromStatus(status string) string {
	switch {
	case strings.Contains(status, "(healthy)"):
		return "healthy"
	case strings.Contains(status, "(unhealthy)"):
		return "unhealthy"
	case strings.Contains(status, "health: starting"):
		return "starting"
	default:
		return ""
	}
}
