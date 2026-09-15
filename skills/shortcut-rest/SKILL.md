---
name: shortcut-rest
description: Maintain the shared Shortcut REST transport behind workspace-locked launchers. Use when extending or debugging a locked Shortcut integration; use the workspace skill for ordinary issue operations.
---

# Shortcut REST transport

`scripts/shortcut_core.py` provides the fixed v3 HTTPS transport, operation
catalog, permission checks, and workspace identity validation. It is a library,
not a generic CLI. SixFifty operations must use `shortcut-sixfifty`.

Keep the API origin fixed, refuse redirects, and verify the workspace before
each operation. Do not introduce token arguments, environment fallback,
credential-path overrides, endpoint overrides, or preflight bypasses.

Extend the explicit operation catalog only after consulting the official
https://developer.shortcut.com/api/rest/v3 schema. Send user data as JSON,
preserve pagination metadata, and do not automatically retry mutations.

Run the transport's tests with:

```bash
python3 -m unittest discover -s ~/.agents/skills/shortcut-rest/scripts -p 'test_*.py'
```
