# Human-in-the-loop (confirmation mode)

Agent Canvas can pause the agent before high-risk tool calls so you can
**Approve**, **Reject**, or **Skip** — similar to Cursor / OpenCode.

## Enable it

1. Open **Settings → Verification**.
2. Turn **Confirmation mode** on.
3. Keep **Security analyzer** on `llm` for risk-based pauses (`ConfirmRisky`), or choose another analyzer / none for `AlwaysConfirm`.
4. Start a **new** conversation (policy is stamped at conversation start).

### Why `echo hello && ls` may not show a box

With **Security analyzer = llm** (`ConfirmRisky`, threshold `HIGH`,
`confirm_unknown=false`), only **HIGH**-risk actions pause. Low / medium /
unknown ratings run immediately — that is expected for Cursor-like flow.
To force a confirmation on every tool call while testing, set
**Security analyzer** to `none` (policy becomes `AlwaysConfirm`), then start a
new conversation.

The pending-action card is shown **above the chat composer** (highlighted) so
it stays visible even when the transcript is long.

## Decisions

| Button | Effect |
|--------|--------|
| **Approve** (`⌘↩`) | Runs the pending action (`accept: true`). |
| **Reject** (`⇧⌘⌫`) | Rejects with reason `rejected_by_user`. |
| **Skip** (`⌥⌘⌫`) | Rejects with reason `skipped_by_user` so the agent can try another approach. |
| **Always allow** | Sets this conversation's policy to `NeverConfirm`, then approves the current action. Further actions auto-run. |

## Protocol

- Agent-server sets `execution_status` to `waiting_for_confirmation`.
- UI responds via `POST /api/conversations/{id}/events/respond_to_confirmation`.
- Always-allow uses `POST /api/conversations/{id}/confirmation_policy` with `{ kind: "NeverConfirm" }`.

Frontend entry points: `src/components/shared/buttons/conversation-confirmation-buttons.tsx`,
`src/api/agent-server-adapter.ts` (`confirmation_policy` on start).
