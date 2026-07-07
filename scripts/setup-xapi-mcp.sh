#!/usr/bin/env bash
# One-time xapi MCP + X Bearer setup for TrendForge
set -euo pipefail

ENV_FILE="${HOME}/.x-mcp.env"
REDIRECT_LOCAL="http://localhost:8080/callback"

echo "=== TrendForge xapi MCP Setup ==="
echo ""

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Creating ${ENV_FILE} — paste your X app credentials from developer.x.com"
  read -rp "X_CLIENT_ID: " client_id
  read -rsp "X_CLIENT_SECRET: " client_secret
  echo ""
  cat > "$ENV_FILE" <<EOF
export X_CLIENT_ID="${client_id}"
export X_CLIENT_SECRET="${client_secret}"
EOF
  chmod 600 "$ENV_FILE"
  echo "Saved credentials to ${ENV_FILE}"
else
  echo "Found existing ${ENV_FILE}"
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

echo ""
echo "Registering xapi app (if needed)..."
npx -y @xdevplatform/xurl auth apps add xapi \
  --client-id "${X_CLIENT_ID}" \
  --client-secret "${X_CLIENT_SECRET}" \
  --redirect-uri "${REDIRECT_LOCAL}" 2>/dev/null || true

echo ""
echo "Starting OAuth2 flow — complete consent in your browser..."
npx -y @xdevplatform/xurl auth oauth2 --app xapi

echo ""
echo "Auth status:"
npx -y @xdevplatform/xurl auth status --app xapi

echo ""
echo "Fetching app-only bearer for Vercel proxy..."
BEARER=$(npx -y @xdevplatform/xurl --app xapi token 2>/dev/null | tail -1 || true)
if [[ -n "${BEARER}" ]]; then
  echo ""
  echo "Run TrendForge with real X data:"
  echo "  X_BEARER_TOKEN=${BEARER} npx vercel dev"
else
  echo ""
  echo "Bearer not auto-fetched. Get one from developer.x.com → Keys and tokens, then:"
  echo "  X_BEARER_TOKEN=your_token npx vercel dev"
fi

echo ""
echo "Restart Grok session (or /mcps refresh) so xapi MCP tools connect."