// Command cannonadecommander is the host supervisor for the CannonadeCommander
// Unraid plugin. It serves a localhost UNIX-socket API that the Docker-tab panel
// calls (through a same-origin PHP proxy), and orchestrates dependency-ordered,
// health-gated container starts. It talks to the Docker daemon over its socket;
// running host-side (not in a container) is the correct home for that write
// privilege, and the only place that can orchestrate the host's own autostart.
package main

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/junkerderprovinz/cannonadecommander/internal/api"
	"github.com/junkerderprovinz/cannonadecommander/internal/dockercli"
	"github.com/junkerderprovinz/cannonadecommander/internal/monitor"
	"github.com/junkerderprovinz/cannonadecommander/internal/netshape"
	"github.com/junkerderprovinz/cannonadecommander/internal/orchestrator"
	"github.com/junkerderprovinz/cannonadecommander/internal/readiness"
	"github.com/junkerderprovinz/cannonadecommander/internal/store"
	"github.com/junkerderprovinz/cannonadecommander/internal/unraidtmpl"
)

// version is overridden at build time with -ldflags "-X main.version=vX.Y.Z".
var version = "dev"

// bannerArt is the house brand ASCII banner (the shared "junkerderprovinz" art),
// printed to the supervisor log on startup per the ASCII-init convention. It is
// embedded from banner.txt, byte-identical to .github/assets/banner-raw.txt.
//
//go:embed banner.txt
var bannerArt string

const (
	defaultDataDir    = "/boot/config/plugins/cannonadecommander"
	defaultDockerSock = "/var/run/docker.sock"
	defaultAPISock    = "/var/run/cannonadecommander.sock"
)

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "serve":
		serve()
	case "apply":
		apply()
	case "version", "-v", "--version":
		fmt.Println(version)
	case "banner":
		fmt.Println(bannerArt)
	default:
		fmt.Fprintf(os.Stderr, "usage: cannonadecommander [serve|apply|version]\n")
		os.Exit(2)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// shaperAdapter lets the monitor apply egress limits via the netshape package.
type shaperAdapter struct{}

func (shaperAdapter) Apply(iface string, pid, kbit int) error {
	return netshape.Apply(iface, pid, kbit)
}

// inspectorAdapter bridges the docker client to the readiness prober's minimal
// Inspector interface, keeping the readiness package free of docker types.
type inspectorAdapter struct{ c *dockercli.Client }

func (a inspectorAdapter) Snapshot(ctx context.Context, ref string) (readiness.Snapshot, error) {
	ins, err := a.c.Inspect(ctx, ref)
	if err != nil {
		return readiness.Snapshot{}, err
	}
	return readiness.Snapshot{Running: ins.Running, Health: ins.Health, IP: ins.IP}, nil
}

func serve() {
	dataDir := env("CC_DATA_DIR", defaultDataDir)
	dockerSock := env("CC_DOCKER_SOCK", defaultDockerSock)
	apiSock := env("CC_SOCK", defaultAPISock)

	// The interface to shape is chosen in Settings (config.shape_iface) and threaded
	// through the monitor per-tick; no env override needed.
	docker := dockercli.NewUnix(dockerSock)
	st := store.New(filepath.Join(dataDir, "plan.json"))
	prober := readiness.Prober{Inspector: inspectorAdapter{docker}, ExecCheck: docker.Exec, GetLogs: docker.Logs}
	orch := &orchestrator.Orchestrator{Starter: docker, Ready: prober}
	srv := &api.Server{Docker: docker, Store: st, Runner: orch, TemplatesDir: env("CC_TEMPLATES_DIR", unraidtmpl.DefaultDir)}

	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatalf("cannonadecommander: mkdir %s: %v", dataDir, err)
	}
	// A stale socket from an unclean stop would make Listen fail with EADDRINUSE.
	_ = os.Remove(apiSock)
	ln, err := net.Listen("unix", apiSock)
	if err != nil {
		log.Fatalf("cannonadecommander: listen %s: %v", apiSock, err)
	}
	_ = os.Chmod(apiSock, 0o660)

	httpSrv := &http.Server{Handler: srv.Handler()}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpSrv.Shutdown(shutCtx)
		_ = os.Remove(apiSock)
	}()

	// The always-on automation loop: scheduled actions, the watchdog, notifications.
	go (&monitor.Monitor{Docker: docker, Config: st, Notifier: monitor.SysNotifier{}, Pidder: docker, Shaper: shaperAdapter{}}).Run(ctx)

	log.Print("\n" + bannerArt)
	log.Printf("CANNONADECOMMANDER %s IS READY — api %s · data %s · docker %s", version, apiSock, dataDir, dockerSock)

	if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatalf("cannonadecommander: serve: %v", err)
	}
}

// apply pokes the running supervisor to (re)apply its plan. The array-start
// event hook calls this once the Docker daemon is up.
func apply() {
	apiSock := env("CC_SOCK", defaultAPISock)
	hc := &http.Client{
		Timeout: 15 * time.Minute, // health-gated ordering can legitimately take a while
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", apiSock)
			},
		},
	}
	resp, err := hc.Post("http://unix/api/apply", "application/json", nil)
	if err != nil {
		log.Fatalf("cannonadecommander apply: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(os.Stdout, resp.Body)
	fmt.Println()
	if resp.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
