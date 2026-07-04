package unraidtmpl

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplyExtraParams_UpsertPreservesOthers(t *testing.T) {
	doc := `<?xml version="1.0"?>
<Container version="2">
  <Name>plex</Name>
  <Repository>linuxserver/plex</Repository>
  <ExtraParams>--restart=unless-stopped --memory=2G</ExtraParams>
</Container>`
	out, ok := applyExtraParams(doc, "plex", map[string]string{"--memory": "4294967296", "--cpus": "2"})
	if !ok {
		t.Fatal("should have matched <Name>plex")
	}
	// the prior --memory=2G is replaced, --restart is preserved, --cpus is added.
	if strings.Contains(out, "--memory=2G") {
		t.Fatalf("old --memory should be gone:\n%s", out)
	}
	for _, want := range []string{"--restart=unless-stopped", "--memory=4294967296", "--cpus=2"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in:\n%s", want, out)
		}
	}
	// exactly one --memory flag (no duplicate)
	if strings.Count(out, "--memory=") != 1 {
		t.Fatalf("expected one --memory=, got %d:\n%s", strings.Count(out, "--memory="), out)
	}
}

func TestApplyExtraParams_MemoryNotConfusedWithSwap(t *testing.T) {
	doc := `<Container><Name>x</Name><ExtraParams>--memory-swap=8G --memory=2G</ExtraParams></Container>`
	out, _ := applyExtraParams(doc, "x", map[string]string{"--memory": "1073741824"})
	if !strings.Contains(out, "--memory-swap=8G") {
		t.Fatalf("--memory-swap must be preserved when replacing --memory:\n%s", out)
	}
	if strings.Count(out, "--memory=") != 1 || strings.Contains(out, "--memory=2G") {
		t.Fatalf("only --memory (not -swap) should be replaced:\n%s", out)
	}
}

func TestApplyExtraParams_SelfClosingReplaced(t *testing.T) {
	// Unraid commonly writes an empty <ExtraParams/>; it must be REPLACED, not left in
	// place with a second ExtraParams appended (which Unraid would then read as empty).
	doc := `<Container><Name>plex</Name><ExtraParams/></Container>`
	out, ok := applyExtraParams(doc, "plex", map[string]string{"--memory": "4294967296"})
	if !ok {
		t.Fatal("should match")
	}
	if strings.Contains(out, "<ExtraParams/>") {
		t.Fatalf("self-closing tag must be gone:\n%s", out)
	}
	if strings.Count(out, "ExtraParams") != 2 { // exactly one <ExtraParams> + one </ExtraParams>
		t.Fatalf("must NOT create a duplicate ExtraParams:\n%s", out)
	}
	if !strings.Contains(out, "<ExtraParams>--memory=4294967296</ExtraParams>") {
		t.Fatalf("self-closing must become a proper element:\n%s", out)
	}
}

func TestApplyExtraParams_WithAttributes(t *testing.T) {
	doc := `<Container><Name>x</Name><ExtraParams foo="bar">--restart=always</ExtraParams></Container>`
	out, ok := applyExtraParams(doc, "x", map[string]string{"--cpus": "2"})
	if !ok || !strings.Contains(out, "--cpus=2") || !strings.Contains(out, "--restart=always") {
		t.Fatalf("the attributes form should upsert into its inner text:\n%s", out)
	}
	if strings.Count(out, "ExtraParams") != 2 {
		t.Fatalf("must not duplicate ExtraParams:\n%s", out)
	}
}

func TestApplyExtraParams_CreatesWhenMissing(t *testing.T) {
	doc := "<Container>\n  <Name>db</Name>\n</Container>"
	out, ok := applyExtraParams(doc, "db", map[string]string{"--cpus": "1.5"})
	if !ok || !strings.Contains(out, "<ExtraParams>--cpus=1.5</ExtraParams>") {
		t.Fatalf("should create ExtraParams:\n%s", out)
	}
}

func TestApplyExtraParams_NameMismatch(t *testing.T) {
	doc := "<Container><Name>plex</Name></Container>"
	if out, ok := applyExtraParams(doc, "sonarr", map[string]string{"--cpus": "1"}); ok || out != doc {
		t.Fatal("a non-matching name must leave the doc untouched")
	}
}

func TestSetExtraParams_FileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "my-plex.xml")
	_ = os.WriteFile(f, []byte("<Container><Name>plex</Name><ExtraParams>--restart=always</ExtraParams></Container>"), 0o644)
	if err := SetExtraParams(dir, "plex", map[string]string{"--memory": "4294967296"}); err != nil {
		t.Fatalf("SetExtraParams: %v", err)
	}
	got, _ := os.ReadFile(f)
	if !strings.Contains(string(got), "--memory=4294967296") || !strings.Contains(string(got), "--restart=always") {
		t.Fatalf("file not updated correctly:\n%s", got)
	}
	if err := SetExtraParams(dir, "ghost", map[string]string{"--cpus": "1"}); err == nil {
		t.Fatal("a missing container template should return an error")
	}
}
