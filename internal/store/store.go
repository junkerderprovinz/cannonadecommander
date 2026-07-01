// Package store persists the orchestration plan as JSON on the Unraid flash
// (/boot/config/plugins/cannonadecommander), so it survives reboots.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

// Store reads and writes the plan at a fixed path.
type Store struct{ path string }

// New builds a store backed by the given JSON file path.
func New(path string) *Store { return &Store{path: path} }

// Load reads the plan. A missing or empty file yields an empty plan, not an
// error, so a fresh install starts clean.
func (s *Store) Load() (model.Plan, error) {
	b, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return model.Plan{}, nil
	}
	if err != nil {
		return model.Plan{}, err
	}
	if len(b) == 0 {
		return model.Plan{}, nil
	}
	var p model.Plan
	if err := json.Unmarshal(b, &p); err != nil {
		return model.Plan{}, err
	}
	return p, nil
}

// Save writes the plan atomically (temp file + rename) so a crash mid-write can
// never leave a half-written plan on the flash.
func (s *Store) Save(p model.Plan) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
