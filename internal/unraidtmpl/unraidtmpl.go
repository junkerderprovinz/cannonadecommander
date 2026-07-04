// Package unraidtmpl mirrors a live CPU/RAM/cpuset limit into the container's Unraid
// template XML (<ExtraParams>), so a limit set through the plugin survives an Unraid
// "Apply" (which recreates the container from that template). It edits ONLY the
// ExtraParams flags it owns, validates the result, and writes atomically — a failure
// is best-effort and never undoes the live update.
package unraidtmpl

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// DefaultDir is where Unraid's dockerMan stores user container templates.
const DefaultDir = "/boot/config/plugins/dockerMan/templates-user"

var (
	nameRe = regexp.MustCompile(`(?s)<Name>\s*([^<]*?)\s*</Name>`)
	// matches a self-closing <ExtraParams/> OR an open/close <ExtraParams …>inner</ExtraParams>
	// (with or without attributes). Group 1 = inner text (unset for the self-closing form).
	epRe = regexp.MustCompile(`(?s)<ExtraParams\b[^>]*/>|<ExtraParams\b[^>]*>(.*?)</ExtraParams>`)
)

// SetExtraParams finds the template under dir whose <Name> equals name and upserts the
// given docker flags into its <ExtraParams> (a non-empty value replaces any prior value
// of that flag; an empty value removes the flag). Returns nil if it updated a template,
// or an error (no matching template / read / write). dir == "" is a no-op (nil).
func SetExtraParams(dir, name string, kv map[string]string) error {
	if dir == "" || name == "" || len(kv) == 0 {
		return nil
	}
	files, err := filepath.Glob(filepath.Join(dir, "*.xml"))
	if err != nil {
		return err
	}
	// Update EVERY template whose <Name> matches (templates-user can accumulate stale
	// duplicates from renames/reinstalls; whichever one Unraid actually uses then still
	// carries the limit). Matching none is the error.
	matched := false
	for _, f := range files {
		data, rerr := os.ReadFile(f)
		if rerr != nil {
			continue
		}
		out, ok := applyExtraParams(string(data), name, kv)
		if !ok {
			continue
		}
		if err := writeAtomic(f, []byte(out)); err != nil {
			return err
		}
		matched = true
	}
	if !matched {
		return os.ErrNotExist
	}
	return nil
}

// applyExtraParams is the pure transform (unit-testable without files): if the doc's
// <Name> equals name, upsert kv into <ExtraParams> and return the new doc + true.
func applyExtraParams(doc, name string, kv map[string]string) (string, bool) {
	m := nameRe.FindStringSubmatch(doc)
	if m == nil || strings.TrimSpace(m[1]) != name {
		return doc, false
	}
	loc := epRe.FindStringSubmatchIndex(doc)
	var inner string
	if loc != nil && loc[2] >= 0 { // group 1 present = open/close form; -1 = self-closing (empty)
		inner = doc[loc[2]:loc[3]]
	}
	// deterministic order so the output is stable (and testable)
	keys := make([]string, 0, len(kv))
	for k := range kv {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, flag := range keys {
		// drop any existing "flag=value" / "flag value" (not the "-swap" sibling: the char
		// after the flag must be '=' or whitespace, which "--memory-swap" doesn't have).
		rm := regexp.MustCompile(regexp.QuoteMeta(flag) + `(?:=|\s+)\S+`)
		inner = strings.TrimSpace(rm.ReplaceAllString(inner, ""))
		if v := kv[flag]; v != "" {
			if inner != "" {
				inner += " "
			}
			inner += flag + "=" + v
		}
	}
	inner = strings.TrimSpace(inner)
	newEP := "<ExtraParams>" + inner + "</ExtraParams>"
	if loc != nil {
		return doc[:loc[0]] + newEP + doc[loc[1]:], true
	}
	if i := strings.LastIndex(doc, "</Container>"); i >= 0 {
		return doc[:i] + "  " + newEP + "\n" + doc[i:], true
	}
	return doc + "\n" + newEP + "\n", true
}

func writeAtomic(path string, data []byte) error {
	tmp := path + ".cc.tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		_ = os.Remove(tmp) // don't leave a partial file on the flash
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
