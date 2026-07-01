// Package model holds the types shared across every CannonadeCommander unit.
// The engine orchestrates Docker containers on the Unraid host: it starts them
// in a dependency-aware order, gated on each one becoming ready, the way a
// gunner rakes fire down a line one shot at a time.
package model

// Container is a Docker container as discovered on the host (read-only view).
type Container struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	State     string `json:"state"`     // "running" / "exited" / "created" / ...
	Health    string `json:"health"`    // "healthy" / "unhealthy" / "starting" / "none" / ""
	Autostart bool   `json:"autostart"` // whether Unraid's native autostart owns it
}

// ProbeKind is how the engine decides a container is "ready" so the next stage
// may fire. Most Community-Apps images ship NO HEALTHCHECK, so the TCP/running
// probes are first-class, not just a fallback.
type ProbeKind string

const (
	ProbeHealth  ProbeKind = "health"  // use the image's own HEALTHCHECK (State.Health)
	ProbeRunning ProbeKind = "running" // running + a grace period
	ProbeTCP     ProbeKind = "tcp"     // a TCP port accepts a connection
)

// Probe is the readiness specification for one managed container.
type Probe struct {
	Kind           ProbeKind `json:"kind"`
	GraceSeconds   int       `json:"grace_seconds,omitempty"`   // ProbeRunning: wait this long after "running"
	Host           string    `json:"host,omitempty"`            // ProbeTCP: host to dial (default 127.0.0.1)
	Port           int       `json:"port,omitempty"`            // ProbeTCP: port to dial
	TimeoutSeconds int       `json:"timeout_seconds,omitempty"` // give up after this long (0 → engine default)
}

// Policy is what to do when a container fails to become ready in time.
type Policy string

const (
	PolicyAbort    Policy = "abort"    // stop the chain: skip everything that depends on it
	PolicyContinue Policy = "continue" // start dependents anyway (mark this one failed)
	PolicyDegrade  Policy = "degrade"  // start dependents anyway (mark this one degraded)
)

// Node is one managed container in the start plan.
type Node struct {
	Name   string   `json:"name"`   // Unraid container name
	After  []string `json:"after"`  // must start AFTER these nodes are ready (edge: dep -> this)
	Probe  Probe    `json:"probe"`  // how to decide it's ready
	Policy Policy   `json:"policy"` // what to do if it never becomes ready
}

// Plan is the user's saved orchestration: which containers the engine manages
// and the dependencies between them.
type Plan struct {
	Nodes []Node `json:"nodes"`
}

// Names returns every managed container name in the plan.
func (p Plan) Names() []string {
	out := make([]string, 0, len(p.Nodes))
	for _, n := range p.Nodes {
		out = append(out, n.Name)
	}
	return out
}

// NodeState is the live state of a node during (and after) a run.
type NodeState string

const (
	StatePending  NodeState = "pending"
	StateStarting NodeState = "starting"
	StateReady    NodeState = "ready"
	StateDegraded NodeState = "degraded"
	StateFailed   NodeState = "failed"
	StateSkipped  NodeState = "skipped" // a dependency aborted the chain
)

// NodeResult is the outcome for one node in a run.
type NodeResult struct {
	Name   string    `json:"name"`
	Stage  int       `json:"stage"`
	State  NodeState `json:"state"`
	Reason string    `json:"reason,omitempty"`
}

// RunResult is the outcome of orchestrating a whole plan.
type RunResult struct {
	Stages [][]string   `json:"stages"`
	Nodes  []NodeResult `json:"nodes"`
	Error  string       `json:"error,omitempty"` // set only when the plan itself is invalid
}
