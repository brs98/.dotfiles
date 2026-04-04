---
name: devcontainer-worktree
description: Spin up, manage, and tear down devcontainers for git worktrees with isolated ports and databases. Use when user asks to run a Rails devcontainer, start a local dev environment, or test a worktree locally. Ensures one devcontainer per worktree.
---

# Devcontainer Worktree

Manage devcontainers with strict one-container-per-worktree isolation. Each worktree gets its own Rails server, Postgres, and Redis on unique ports.

## Quick Start

```bash
# From any worktree directory:
devcontainer up --workspace-folder <worktree-path>
```

## Workflows

### Spin Up a New Devcontainer

1. **Find available ports** — scan running containers to avoid conflicts:
   ```bash
   docker ps --format '{{.Ports}}' | grep -oP '\d+(?=->)' | sort -n
   ```
   Pick the next available set from this table:

   | Slot | Rails | Postgres | Redis |
   |------|-------|----------|-------|
   | 1    | 3000  | 5432     | 6379  |
   | 2    | 3001  | 5433     | 6380  |
   | 3    | 3002  | 5434     | 6381  |
   | 4    | 3003  | 5435     | 6382  |
   | 5    | 3004  | 5436     | 6383  |

2. **Create `.env`** from the template, then set the port overrides and fix hostnames for compose:
   ```bash
   cd <worktree>
   cp .env.TEMPLATE .env
   ```
   Then edit `.env` to:
   - **Uncomment and set port overrides** at the top:
     ```
     RAILS_HOST_PORT=<rails-port>
     POSTGRES_HOST_PORT=<postgres-port>
     REDIS_HOST_PORT=<redis-port>
     ```
   - **Change `localhost` to compose service names** for database and redis:
     ```
     DATABASE_URL=postgres://postgres:postgres@postgres:5432
     REDIS_URL=redis://redis:6379/1
     ```
   - **Add portal CDN** (if testing portal features):
     ```
     PORTAL_CDN_BASE=https://storage.googleapis.com/portals-cdn/default/assets
     ```

3. **Start the devcontainer**:
   ```bash
   devcontainer up --workspace-folder <worktree-path>
   ```
   The `postCreateCommand` may fail — that's OK, the container is running.

4. **Fix OrbStack DNS** (required after every container start):
   ```bash
   docker exec -u root <container> bash -c \
     'echo -e "nameserver 127.0.0.11\nnameserver 8.8.8.8\noptions ndots:0" > /etc/resolv.conf'
   ```
   This adds Google DNS as fallback while keeping Docker's internal DNS for service discovery.

5. **Install dependencies**:
   ```bash
   docker exec -u vscode <container> bash -i -c 'cd /workspaces/fluid && bundle install'
   ```

6. **Set up the database**:
   ```bash
   docker exec -u vscode <container> bash -i -c \
     'cd /workspaces/fluid && bin/rails db:create db:schema:load db:seed'
   ```
   If `handoff_tokens` table already exists, mark the migration as done:
   ```bash
   docker exec -u vscode <container> bash -i -c \
     "cd /workspaces/fluid && bin/rails runner \"ActiveRecord::Base.connection.execute(\\\"INSERT INTO schema_migrations (version) VALUES ('20260401163145')\\\")\""
   ```

7. **Start the app** (prefer `bin/dev` — runs Rails + Sidekiq via foreman):
   ```bash
   docker exec -u vscode <container> bash -i -c \
     'cd /workspaces/fluid && bin/dev'
   ```
   Or Rails only (no Sidekiq):
   ```bash
   docker exec -u vscode <container> bash -i -c \
     'cd /workspaces/fluid && bin/rails server -b 0.0.0.0 -p 3000'
   ```

8. **Report access URLs** to the user:
   ```
   Rails:    http://portal.fluid.localhost:<rails-port>/login
   Tenants:  http://www.portal.fluid.localhost:<rails-port>/
              http://tacobell.portal.fluid.localhost:<rails-port>/
   ```

### Finding the Container Name

The container name follows the pattern: `<worktree-dirname>_devcontainer-rails-app-1`

```bash
docker ps --format '{{.Names}}' | grep <worktree-dirname>
```

### Getting MFA Codes (for portal login testing)

After the user submits an email on the login page, use one of these methods:

**Method 1: Sidekiq retry queue** (preferred when using `bin/dev`):
The email job fails (no Postmark configured) and lands in the retry queue with the code in the job args:
```bash
docker exec -u vscode <container> bash -i -c \
  "cd /workspaces/fluid && bin/rails runner \"require 'sidekiq/api'; job = Sidekiq::RetrySet.new.find { |j| j.item['class'] == 'SendCriticalEmailJob' && j.item['args'][0] == 'sso_code' }; puts job.item['args'][3] if job\""
```

**Method 2: Database query** (always works):
```bash
docker exec -u vscode <container> bash -i -c \
  "cd /workspaces/fluid && bin/rails runner \"puts ActiveRecord::Base.connection.execute('SELECT verification_code FROM multi_factor_authentications ORDER BY id DESC LIMIT 1').first['verification_code']\""
```

**Method 3: Mailpit** (if configured in compose):
Visit `http://localhost:8025` to see the email with the code.

**Available test users:** `collins-johnie@hessel.example` (Fluid/www), `latasha-harvey@rowe.test` (Taco Bell).

### List Running Devcontainers

```bash
docker compose ls | grep devcontainer
```

Or with details:
```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}' | grep devcontainer
```

### Stop a Devcontainer

```bash
docker compose -p <project-name>_devcontainer down
```

The project name is the worktree directory name. Find it with:
```bash
docker compose ls --format json | jq -r '.[].Name'
```

### Stop All Devcontainers

```bash
docker compose ls --format json | jq -r '.[].Name' | while read project; do
  docker compose -p "$project" down
done
```

## Key Rules

- **Never share a devcontainer between worktrees** — each worktree gets its own container set
- **Never hardcode ports** — always check what's in use first
- **Always fix DNS after container start** — OrbStack's internal resolver is unreliable
- **`.env` is git-ignored** — safe to create per-worktree with unique ports
- **The `postCreateCommand` failure is expected** — the container still runs, set up manually
- **Use `bash -i`** for all `docker exec` commands — mise needs an interactive shell to activate Ruby
