package monitor

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"time"

	"github.com/junkerderprovinz/cannonadecommand/internal/model"
)

// unraidNotify is Unraid's own notification agent.
const unraidNotify = "/usr/local/emhttp/plugins/dynamix/scripts/notify"

// SysNotifier delivers alerts via Unraid's notification system and/or a webhook.
// Failures are swallowed: a notification problem must never break the monitor.
type SysNotifier struct{ HTTP *http.Client }

// Notify sends the alert per cfg. importance is Unraid's level: normal|warning|alert.
func (s SysNotifier) Notify(ctx context.Context, cfg model.Notify, subject, desc, importance string) {
	if cfg.Unraid {
		_ = exec.CommandContext(ctx, unraidNotify,
			"-e", "CannonadeCommand", "-s", subject, "-d", desc, "-i", importance).Run()
	}
	if cfg.Webhook != "" {
		body, _ := json.Marshal(map[string]string{
			"event": subject, "detail": desc, "importance": importance,
		})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.Webhook, bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		hc := s.HTTP
		if hc == nil {
			hc = &http.Client{Timeout: 10 * time.Second}
		}
		if resp, err := hc.Do(req); err == nil {
			_ = resp.Body.Close()
		}
	}
}
