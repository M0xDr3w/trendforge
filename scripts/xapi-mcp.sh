#!/usr/bin/env bash
# Secure xapi MCP launcher — sources credentials from ~/.x-mcp.env, never from config files.
set -euo pipefail

ENV_FILE="${HOME}/.x-mcp.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "xapi-mcp: missing ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${ENV_FILE}"

export CLIENT_ID="${X_CLIENT_ID:?Set X_CLIENT_ID in ~/.x-mcp.env}"
export CLIENT_SECRET="${X_CLIENT_SECRET:?Set X_CLIENT_SECRET in ~/.x-mcp.env}"

exec npx -y @xdevplatform/xurl mcp --app xapi