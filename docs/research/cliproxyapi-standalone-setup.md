# Standalone CLIProxyAPI setup for Claude Code (macOS)

Verified 2026-07-22 against first-party CLIProxyAPI, Homebrew, and Anthropic documentation.

## Setup

1. Install the proxy and Claude Code:

   ```bash
   brew install cliproxyapi
   brew install --cask claude-code
   ```

   Homebrew and Anthropic document these package names directly. ([CLIProxyAPI Quick Start](https://help.router-for.me/introduction/quick-start), [Homebrew formula](https://formulae.brew.sh/formula/cliproxyapi), [Claude Code setup](https://code.claude.com/docs/en/setup))

2. Generate a long random key (for example, `openssl rand -hex 32`), then edit `$(brew --prefix)/etc/cliproxyapi.conf`. Ensure these fields are present, replacing the placeholder with that key:

   ```yaml
   host: "127.0.0.1"
   port: 8317
   auth-dir: "~/.cli-proxy-api"
   api-keys:
     - "REPLACE_WITH_RANDOM_LOCAL_CLIENT_KEY"
   ```

   The default empty `host` binds all IPv4/IPv6 interfaces, so `127.0.0.1` is important for a local-only proxy. `api-keys` are the credentials accepted from clients; they are separate from upstream OAuth credentials. Homebrew services use `$(brew --prefix)/etc/cliproxyapi.conf`. ([Basic configuration](https://help.router-for.me/configuration/basic), [configuration options](https://help.router-for.me/configuration/options), [upstream example config](https://github.com/router-for-me/CLIProxyAPI/blob/main/config.example.yaml))

3. Authenticate CLIProxyAPI to OpenAI Codex, then start it:

   ```bash
   cliproxyapi --codex-login
   # For a headless machine: cliproxyapi --codex-login --no-browser
   brew services start cliproxyapi
   ```

   The Codex OAuth callback uses port `1455`. ([Codex provider authentication](https://help.router-for.me/configuration/provider/codex), [Quick Start](https://help.router-for.me/introduction/quick-start))

4. Confirm the proxy accepts the local client key and inspect the model names it currently exposes:

   ```bash
   curl -H 'Authorization: Bearer REPLACE_WITH_RANDOM_LOCAL_CLIENT_KEY' \
     http://127.0.0.1:8317/v1/models
   ```

5. Point Claude Code at CLIProxyAPI. Use the same local key as the `api-keys` entry, and replace each model placeholder with a GPT model returned by `/v1/models`:

   ```bash
   export ANTHROPIC_BASE_URL='http://127.0.0.1:8317'
   export ANTHROPIC_AUTH_TOKEN='REPLACE_WITH_RANDOM_LOCAL_CLIENT_KEY'
   export ANTHROPIC_DEFAULT_OPUS_MODEL='REPLACE_WITH_GPT_MODEL'
   export ANTHROPIC_DEFAULT_SONNET_MODEL='REPLACE_WITH_GPT_MODEL'
   export ANTHROPIC_DEFAULT_HAIKU_MODEL='REPLACE_WITH_GPT_MODEL'
   claude
   ```

   CLIProxyAPI documents these Claude Code environment variables and its Anthropic-compatible base URL. Do not use `sk-dummy` unless that exact value is deliberately present in `api-keys`; the client token must match an accepted proxy key. ([CLIProxyAPI Claude Code client setup](https://help.router-for.me/agent-client/claude-code), [Claude Code gateway overview](https://code.claude.com/docs/en/llm-gateway))

## Authentication boundary

- `cliproxyapi --codex-login` creates the upstream OpenAI OAuth credential.
- `ANTHROPIC_AUTH_TOKEN` authenticates Claude Code to the local proxy and must match an `api-keys` entry.
- Keep the proxy bound to localhost, keep the key out of source control, and avoid enabling remote management for this local setup.

Anthropic states that it neither endorses nor audits third-party gateways and does not support routing Claude Code to non-Claude models through them. Keep both CLIProxyAPI and Claude Code updated because gateway compatibility can change as Claude Code evolves. ([Anthropic gateway documentation](https://code.claude.com/docs/en/llm-gateway))
