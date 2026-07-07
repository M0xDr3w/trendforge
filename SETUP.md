# TrendForge Setup

Secure setup for **xapi MCP**, **real X data**, and the **Vite dashboard**.  
No API keys or client secrets belong in this repo or in chat.

---

## 1. Credentials (one file only)

Create `~/.x-mcp.env` with mode `600`:

```bash
chmod 600 ~/.x-mcp.env
```

```bash
# ~/.x-mcp.env
export X_CLIENT_ID="your_client_id_from_developer.x_com"
export X_CLIENT_SECRET="your_client_secret_from_developer_x_com"
```

Load it in every new shell (add to `~/.zshrc`):

```bash
[ -f ~/.x-mcp.env ] && source ~/.x-mcp.env
```

**If credentials were ever pasted into chat or committed:** rotate the client secret at [developer.x.com](https://developer.x.com) → your app → Keys and tokens, then update `~/.x-mcp.env`.

---

## 2. xapi OAuth (one-time)

```bash
source ~/.x-mcp.env
npx -y @xdevplatform/xurl auth oauth2 --app xapi
```

At [developer.x.com](https://developer.x.com) → User authentication → OAuth 2.0, add redirect URI:

```
http://localhost:8080/callback
```

Verify (should show your username under `oauth2`):

```bash
source ~/.x-mcp.env
npx -y @xdevplatform/xurl auth status --app xapi
```

---

## 3. MCP config (manual, no secrets in TOML)

### Recommended: wrapper script (most reliable in Cursor)

Grok/Cursor often **do not** inherit `source ~/.x-mcp.env` from your terminal. A wrapper script avoids `${VAR}` expansion issues.

**`.grok/config.toml`** (create manually — copy from `.grok/config.toml.example`):

```toml
[mcp_servers.xapi]
command = "/Users/YOUR_USER/projects/trendforge/scripts/xapi-mcp.sh"
args = []
enabled = true
startup_timeout_sec = 60
```

Make the script executable:

```bash
chmod +x scripts/xapi-mcp.sh
```

Replace `YOUR_USER` with your macOS username. Use the **absolute path**.

### Alternative: env references in TOML

Only works if Grok was **started with those variables already exported** (e.g. launched from a terminal where you ran `source ~/.x-mcp.env`):

```toml
[mcp_servers.xapi]
command = "npx"
args = ["-y", "@xdevplatform/xurl", "mcp", "--app", "xapi"]
enabled = true
startup_timeout_sec = 60

[mcp_servers.xapi.env]
CLIENT_ID = "${X_CLIENT_ID}"
CLIENT_SECRET = "${X_CLIENT_SECRET}"
```

### Do not

| Action | Why |
|--------|-----|
| `grok mcp add -e CLIENT_SECRET=...` | Writes secrets into TOML |
| Commit `.grok/config.toml` with real values | Secrets in git |
| Paste keys in chat or README | Exposure |

`.grok/config.toml` is gitignored. Commit only `.grok/config.toml.example`.

---

## 4. Refresh MCP in Grok / Cursor

**`/mcp -r` is not a valid command.** Refresh works inside the MCP modal.

### Grok TUI

1. Type **`/mcps`** (note the **s**)
2. When the modal opens, press **`r`** (lowercase) to refresh the server list
3. Confirm **xapi** is enabled and shows tools (~24)

### Cursor / VS Code (Grok Build)

1. Type **`/mcp`** or **`/plugins`**
2. Open the **MCP Servers** tab
3. Press **`r`** to refresh

### If refresh still does nothing

Try in order:

1. **`/new`** — start a new session (project `.grok/config.toml` loads at session start)
2. **Fully quit and reopen Cursor** — env vars and MCP config load at app launch
3. **Verify from terminal** (no secrets printed if config is correct):

   ```bash
   source ~/.x-mcp.env
   cd /path/to/trendforge
   grok mcp doctor xapi
   ```

   Expect: `handshake OK` and `24 tools discovered`.

4. **Check MCP stderr log** if handshake fails:

   ```bash
   tail -20 ~/.grok/logs/mcp/xapi.stderr.log
   ```

5. **Confirm project root** — Grok must run with cwd = `trendforge` so `.grok/config.toml` is found.

6. **Use the wrapper script** (section 3) instead of `${X_CLIENT_ID}` — fixes most Cursor env issues.

---

## 5. Real X data (Vercel proxy)

The dashboard calls `/api/x-search`. Run the UI + API together:

```bash
source ~/.x-mcp.env
cd /path/to/trendforge
X_BEARER_TOKEN=$(npx -y @xdevplatform/xurl --app xapi token) npx vercel dev
```

In the app: click **TEST** or **SYNC REAL X**.

For production: set `X_BEARER_TOKEN` in Vercel Dashboard → Environment Variables, then redeploy.

---

## 6. Dashboard only (mock feed)

```bash
cd /path/to/trendforge
npm install
npm run dev
```

Open http://localhost:5173 — mock posts ingest automatically.

---

## 7. Quick checklist

- [ ] `~/.x-mcp.env` exists, mode 600, sourced in `~/.zshrc`
- [ ] OAuth done: `xurl auth status --app xapi` shows your user
- [ ] `.grok/config.toml` uses **wrapper script** or `${VAR}` (no literal secrets)
- [ ] `chmod +x scripts/xapi-mcp.sh`
- [ ] `/mcps` → press **`r`** (not `/mcp -r`)
- [ ] If stuck: `/new` or restart Cursor
- [ ] `grok mcp doctor xapi` → healthy

---

## 8. Related files

| File | Purpose |
|------|---------|
| `.grok/config.toml.example` | Safe template (no secrets) |
| `scripts/xapi-mcp.sh` | MCP launcher that sources `~/.x-mcp.env` |
| `scripts/setup-xapi-mcp.sh` | Interactive OAuth helper |
| `.env.example` | Notes for bearer token + redirect URIs |
| `README.md` | App features and architecture |

---

## 9. Ask Grok + X MCP (in-app)

1. Select a cluster in TrendForge
2. Click **ASK GROK + X MCP**
3. Paste the copied prompt into Grok (with xapi MCP connected)

xapi tools are namespaced, e.g. `xapi__search_recent` (exact names appear in `/mcps` when expanded).