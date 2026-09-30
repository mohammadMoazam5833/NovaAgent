# Agent Canvas docs

This directory contains the project documentation.

- [Architecture](./architecture.md): system boundaries, runtime modes, and quality gates.
- [Using ACP agents](./ACP_AGENTS.md): onboard and configure external agents (Claude Code, Codex, Gemini CLI).
- [Human-in-the-loop](./HITL.md): confirmation mode Approve / Reject / Skip.
- [Development guide](./DEVELOPMENT.md)
- [Self-hosting guide](./SELF_HOSTING.md)
- [Remote agent-server + thin frontend](./REMOTE_THIN_CLIENT.md): keep SDK on a
  company server; users only open a browser (or thin Electron).
- [Hybrid mode](./HYBRID.md): local agent-server/tools/workspace on the customer
  machine; company LLM via LLM profile `base_url` (not Thin Client).
- [Local Tools Sidecar](./LOCAL_TOOLS_SIDECAR.md): Cursor-like reverse hybrid —
  Thin Client Node sidecar + company gateway (`:18766` / `:8000/customer-workspace`).
