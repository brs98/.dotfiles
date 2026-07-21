# Fusion Harness provenance

- Upstream: https://github.com/disler/fusion-harness
- Pinned commit: `5852f2ed4f5f064a368d83d2dabad84fe6bfa0b4`
- Imported: 2026-07-21
- License: MIT; see `LICENSE.upstream`

This local fork intentionally differs from upstream:

- `claude-code/*` models execute through Anthropic's official Claude Code CLI instead of Pi's Anthropic Messages provider.
- The default architect is `claude-code/claude-fable-5`; the host/builder default is `openai-codex/gpt-5.6-sol`.
- Claude children require subscription OAuth, run in safe mode, use explicit capabilities, and do not persist sessions.
- `/opinion` and parallel `/fusion` workers are host-enforced read-only; the merge agent has no tools.
- Child cancellation targets the complete process group and bounds captured output.
- `/auto-validate` is disabled unless the unsafe generated-gate flag is explicitly supplied.

Review and port these changes deliberately before updating the upstream pin.
