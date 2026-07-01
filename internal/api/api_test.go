package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

type fakeDocker struct{ containers []model.Container }

func (f fakeDocker) List(context.Context) ([]model.Container, error) { return f.containers, nil }

type memStore struct{ plan model.Plan }

func (m *memStore) Load() (model.Plan, error) { return m.plan, nil }
func (m *memStore) Save(p model.Plan) error   { m.plan = p; return nil }

type fakeRunner struct{ ran bool }

func (f *fakeRunner) Run(context.Context, model.Plan) model.RunResult {
	f.ran = true
	return model.RunResult{Nodes: []model.NodeResult{{Name: "gluetun", State: model.StateReady}}}
}

func newServer() (*Server, http.Handler) {
	s := &Server{
		Docker: fakeDocker{containers: []model.Container{{Name: "gluetun", State: "running"}}},
		Store:  &memStore{},
		Runner: &fakeRunner{},
	}
	return s, s.Handler()
}

func TestState(t *testing.T) {
	_, h := newServer()
	req := httptest.NewRequest("GET", "/api/state", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("state code = %d", rec.Code)
	}
	var resp stateResp
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Containers) != 1 || resp.Containers[0].Name != "gluetun" {
		t.Fatalf("containers wrong: %+v", resp.Containers)
	}
}

func TestPutPlanValid(t *testing.T) {
	_, h := newServer()
	plan := model.Plan{Nodes: []model.Node{{Name: "db"}, {Name: "app", After: []string{"db"}}}}
	body, _ := json.Marshal(plan)
	req := httptest.NewRequest("PUT", "/api/plan", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("valid plan should save (200), got %d: %s", rec.Code, rec.Body)
	}
}

func TestPutPlanRejectsCycle(t *testing.T) {
	_, h := newServer()
	plan := model.Plan{Nodes: []model.Node{{Name: "a", After: []string{"b"}}, {Name: "b", After: []string{"a"}}}}
	body, _ := json.Marshal(plan)
	req := httptest.NewRequest("PUT", "/api/plan", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("a cyclic plan must be rejected (400), got %d", rec.Code)
	}
}

func TestApply(t *testing.T) {
	s, h := newServer()
	s.Store.(*memStore).plan = model.Plan{Nodes: []model.Node{{Name: "gluetun"}}}
	req := httptest.NewRequest("POST", "/api/apply", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("apply code = %d", rec.Code)
	}
	if !s.Runner.(*fakeRunner).ran {
		t.Fatal("apply did not invoke the runner")
	}
	// last_run must now be exposed via /api/state
	req2 := httptest.NewRequest("GET", "/api/state", nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	var resp stateResp
	_ = json.Unmarshal(rec2.Body.Bytes(), &resp)
	if len(resp.LastRun.Nodes) != 1 || resp.LastRun.Nodes[0].State != model.StateReady {
		t.Fatalf("last_run not surfaced after apply: %+v", resp.LastRun)
	}
}
