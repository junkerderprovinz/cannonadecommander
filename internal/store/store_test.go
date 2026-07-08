package store

import (
	"path/filepath"
	"testing"

	"github.com/junkerderprovinz/cannonadecommand/internal/model"
)

func TestLoadMissingIsEmpty(t *testing.T) {
	s := New(filepath.Join(t.TempDir(), "nope", "plan.json"))
	p, err := s.Load()
	if err != nil {
		t.Fatalf("load of a missing file must not error: %v", err)
	}
	if len(p.Nodes) != 0 {
		t.Fatalf("missing file should yield an empty plan, got %d nodes", len(p.Nodes))
	}
}

func TestSaveLoadRoundTrip(t *testing.T) {
	s := New(filepath.Join(t.TempDir(), "sub", "plan.json"))
	want := model.Plan{Nodes: []model.Node{
		{Name: "gluetun", Probe: model.Probe{Kind: model.ProbeTCP, Port: 8000, TimeoutSeconds: 60}, Policy: model.PolicyAbort},
		{Name: "qbittorrent", After: []string{"gluetun"}, Probe: model.Probe{Kind: model.ProbeHealth}, Policy: model.PolicyDegrade},
	}}
	if err := s.Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := s.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(got.Nodes) != 2 || got.Nodes[0].Name != "gluetun" || got.Nodes[1].After[0] != "gluetun" {
		t.Fatalf("round-trip mismatch: %+v", got)
	}
	if got.Nodes[0].Probe.Port != 8000 || got.Nodes[1].Policy != model.PolicyDegrade {
		t.Fatalf("fields not preserved: %+v", got)
	}
}
