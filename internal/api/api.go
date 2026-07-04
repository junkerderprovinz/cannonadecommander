// Package api is the localhost HTTP surface the Docker-tab panel calls (through
// a same-origin PHP proxy). It deliberately exposes only read + orchestrate
// verbs; it never proxies raw Docker create/exec/build.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
	"github.com/junkerderprovinz/cannonadecommander/internal/orchestrator"
)

// Docker is the read + lifecycle surface the card panel needs. It stays small on
// purpose: list/inspect/stats + the safe lifecycle verbs, never create/exec/build.
type Docker interface {
	List(ctx context.Context) ([]model.Container, error)
	Start(ctx context.Context, name string) error
	Stop(ctx context.Context, name string) error
	Restart(ctx context.Context, name string) error
	Pause(ctx context.Context, name string) error
	Unpause(ctx context.Context, name string) error
	Stats(ctx context.Context, name string) (model.Stats, error)
	Limits(ctx context.Context, name string) (model.Limits, error)
	UpdateResources(ctx context.Context, name string, l model.Limits) error
}

// Store persists the plan + the automation config.
type Store interface {
	Load() (model.Plan, error)
	Save(model.Plan) error
	LoadConfig() (model.Config, error)
	SaveConfig(model.Config) error
}

// Runner orchestrates a plan.
type Runner interface {
	Run(ctx context.Context, plan model.Plan) model.RunResult
}

// Server wires the read/orchestrate handlers.
type Server struct {
	Docker Docker
	Store  Store
	Runner Runner

	mu      sync.Mutex
	lastRun model.RunResult
}

// Handler returns the HTTP router.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/state", s.handleState)
	mux.HandleFunc("GET /api/plan", s.handleGetPlan)
	mux.HandleFunc("PUT /api/plan", s.handlePutPlan)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("POST /api/action", s.handleAction)
	mux.HandleFunc("GET /api/stats", s.handleStats)
	mux.HandleFunc("GET /api/limits", s.handleGetLimits)
	mux.HandleFunc("POST /api/limits", s.handleSetLimits)
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("PUT /api/config", s.handlePutConfig)
	return mux
}

// known reports whether name is a live container (guards every write verb).
func (s *Server) known(ctx context.Context, name string) (bool, error) {
	containers, err := s.Docker.List(ctx)
	if err != nil {
		return false, err
	}
	for _, c := range containers {
		if c.Name == name {
			return true, nil
		}
	}
	return false, nil
}

type stateResp struct {
	Plan        model.Plan        `json:"plan"`
	Containers  []model.Container `json:"containers"`
	LastRun     model.RunResult   `json:"last_run"`
	DockerError string            `json:"docker_error,omitempty"`
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	plan, err := s.Store.Load()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	resp := stateResp{Plan: plan}
	containers, derr := s.Docker.List(r.Context())
	if derr != nil {
		// Tolerate a docker hiccup: still return the plan + the last run, so the
		// panel degrades gracefully instead of going blank.
		resp.DockerError = derr.Error()
	} else {
		resp.Containers = containers
	}
	s.mu.Lock()
	resp.LastRun = s.lastRun
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetPlan(w http.ResponseWriter, _ *http.Request) {
	plan, err := s.Store.Load()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handlePutPlan(w http.ResponseWriter, r *http.Request) {
	var plan model.Plan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Reject a structurally invalid plan (cycle / unknown dep) before persisting.
	if _, err := orchestrator.TopoStages(plan); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	if err := s.Store.Save(plan); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	plan, err := s.Store.Load()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	res := s.Runner.Run(r.Context(), plan)
	s.mu.Lock()
	s.lastRun = res
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, res)
}

// handleAction performs a single lifecycle verb on one container. The container
// name is validated against the live list before anything is sent to the socket.
func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string `json:"name"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	containers, err := s.Docker.List(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	known := false
	for _, c := range containers {
		if c.Name == req.Name {
			known = true
			break
		}
	}
	if !known {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown container: " + req.Name})
		return
	}

	var aerr error
	switch req.Action {
	case "start":
		aerr = s.Docker.Start(r.Context(), req.Name)
	case "stop":
		aerr = s.Docker.Stop(r.Context(), req.Name)
	case "restart":
		aerr = s.Docker.Restart(r.Context(), req.Name)
	case "pause":
		aerr = s.Docker.Pause(r.Context(), req.Name)
	case "unpause":
		aerr = s.Docker.Unpause(r.Context(), req.Name)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown action: " + req.Action})
		return
	}
	if aerr != nil {
		writeErr(w, http.StatusInternalServerError, aerr)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleStats returns a one-shot resource snapshot for every running container,
// keyed by name. Snapshots are fetched concurrently but capped so a big host
// doesn't hammer the socket.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	containers, err := s.Docker.List(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	out := map[string]model.Stats{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)
	for _, c := range containers {
		if c.State != "running" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(name string) {
			defer wg.Done()
			defer func() { <-sem }()
			st, serr := s.Docker.Stats(r.Context(), name)
			if serr != nil {
				return
			}
			mu.Lock()
			out[name] = st
			mu.Unlock()
		}(c.Name)
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, out)
}

// handleGetLimits returns one container's CONFIGURED resource caps (0 = none).
func (s *Server) handleGetLimits(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	ok, err := s.known(r.Context(), name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown container: " + name})
		return
	}
	lim, err := s.Docker.Limits(r.Context(), name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, lim)
}

// handleSetLimits sets a container's memory + CPU caps live (Docker update). The
// name is validated against the live list first; a zero field is left unchanged
// (Docker's update ignores 0 and cannot remove a cap — that needs recreating).
func (s *Server) handleSetLimits(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		MemBytes   int64  `json:"mem_bytes"`
		NanoCPUs   int64  `json:"nano_cpus"`
		CpusetCPUs string `json:"cpuset_cpus"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// cpuset is passed straight to Docker; allow only a cpu-list (digits, commas,
	// hyphens) so nothing else can reach the daemon.
	if req.CpusetCPUs != "" && !validCpuset(req.CpusetCPUs) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad cpuset (want a cpu list like 0-3,6): " + req.CpusetCPUs})
		return
	}
	ok, err := s.known(r.Context(), req.Name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown container: " + req.Name})
		return
	}
	if err := s.Docker.UpdateResources(r.Context(), req.Name, model.Limits{MemBytes: req.MemBytes, NanoCPUs: req.NanoCPUs, CpusetCPUs: req.CpusetCPUs}); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleGetConfig returns the automation config (schedules / watchdogs / notify).
func (s *Server) handleGetConfig(w http.ResponseWriter, _ *http.Request) {
	cfg, err := s.Store.LoadConfig()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

// handlePutConfig validates + persists the automation config. Only the safe
// lifecycle verbs are accepted for schedules; the monitor still never touches the
// Docker socket for anything but start/stop/restart.
func (s *Server) handlePutConfig(w http.ResponseWriter, r *http.Request) {
	var cfg model.Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	for _, sc := range cfg.Schedules {
		if sc.Action != "start" && sc.Action != "stop" && sc.Action != "restart" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad schedule action: " + sc.Action})
			return
		}
		// The monitor matches the time by exact "HH:MM" string equality against the
		// host clock's zero-padded now.Format("15:04"), so reject anything that could
		// never match (a non-zero-padded or malformed time = a silently dead schedule).
		if !validScheduleTime(sc.Time) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad schedule time (want HH:MM, zero-padded): " + sc.Time})
			return
		}
		for _, d := range sc.Days {
			if d < 0 || d > 6 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad schedule day (want 0-6)"})
				return
			}
		}
	}
	if err := s.Store.SaveConfig(cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// validScheduleTime requires a strictly zero-padded 24h "HH:MM" (00:00–23:59),
// matching the monitor's now.Format("15:04"); time.Parse is too lenient here (it
// would accept "9:00", which can never string-equal the padded clock).
func validScheduleTime(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	for i := 0; i < 5; i++ {
		if i == 2 {
			continue
		}
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	return h <= 23 && m <= 59
}

// validCpuset accepts a Linux cpu-list like "0-3,6" (digits, commas, hyphens only,
// bounded length). It is passed verbatim to Docker's CpusetCpus, so keep it strict.
func validCpuset(s string) bool {
	if len(s) == 0 || len(s) > 128 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		digit := c >= '0' && c <= '9'
		if !digit && c != ',' && c != '-' {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}
