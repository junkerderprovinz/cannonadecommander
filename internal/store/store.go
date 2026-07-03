// Package store persists the orchestration plan and the automation config as JSON
// on the Unraid flash (/boot/config/plugins/cannonadecommander), so they survive
// reboots.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/junkerderprovinz/cannonadecommander/internal/model"
)

// Store reads and writes the plan + config next to each other.
type Store struct {
	path    string // plan.json
	cfgPath string // config.json (in the same dir)
}

// New builds a store backed by the given plan JSON file path; the config lives in
// config.json in the same directory.
func New(path string) *Store {
	return &Store{path: path, cfgPath: filepath.Join(filepath.Dir(path), "config.json")}
}

// Load reads the plan. A missing or empty file yields an empty plan, not an
// error, so a fresh install starts clean.
func (s *Store) Load() (model.Plan, error) {
	var p model.Plan
	err := readJSON(s.path, &p)
	return p, err
}

// Save writes the plan atomically (temp file + rename).
func (s *Store) Save(p model.Plan) error { return writeJSON(s.path, p) }

// LoadConfig reads the automation config; a missing/empty file yields the zero
// Config (nothing scheduled/watched, no notifications).
func (s *Store) LoadConfig() (model.Config, error) {
	var c model.Config
	err := readJSON(s.cfgPath, &c)
	return c, err
}

// SaveConfig writes the automation config atomically.
func (s *Store) SaveConfig(c model.Config) error { return writeJSON(s.cfgPath, c) }

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) || (err == nil && len(b) == 0) {
		return nil // fresh: leave v at its zero value
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

// writeJSON writes atomically (temp file, fsync, rename). The fsync forces the
// data to stable storage BEFORE the rename, so on the Unraid flash (FAT32, no
// journaling) a power loss can't leave config.json present but zero-length or
// half-written — the rename only ever exposes fully-flushed content.
func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp) // don't leave an orphaned .tmp on the flash
		return err
	}
	return nil
}
