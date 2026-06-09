# lsp-dap-tools

Global Pi extension that registers two model-callable tools:

- `lsp` — language-server diagnostics, navigation, hover, symbols, rename, file rename, code actions, formatting, raw requests.
- `debug` — Debug Adapter Protocol launch/attach, breakpoints, stepping, threads, stack, scopes, variables, eval, memory/disassembly/module requests, raw requests.

## LSP prerequisites

The tool auto-detects installed language servers by file extension. Common commands:

- TypeScript/JavaScript: `typescript-language-server --stdio`
- Python: `pyright-langserver --stdio` or `pylsp`
- Rust: `rust-analyzer`
- Go: `gopls`
- C/C++: `clangd`
- Ruby: `ruby-lsp` or `solargraph stdio`
- JSON/YAML/HTML/CSS/Shell/Lua/Java: common VS Code or ecosystem language servers

If a server is not auto-detected, pass `server_command` and optional `server_args` to the `lsp` tool.

## DAP prerequisites

The debugger auto-detects only a small set of DAP adapters:

- Python: `python3 -m debugpy.adapter` (requires `debugpy` installed)
- Native binaries: `lldb-dap`
- Node: `js-debug-adapter` if installed

For other adapters, pass `adapter_command` and optional `adapter_args` to the `debug` tool.

## Slash command

- `/lsp-dap-status` shows active sessions.

## Reload

After editing this extension in a running Pi session, run `/reload`.
