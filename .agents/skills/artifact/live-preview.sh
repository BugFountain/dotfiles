#!/usr/bin/env bash
# Host a self-contained artifact HTML file on an ephemeral Vite 8.2.2 server.
# Does not add the file to a build, does not rewrite the file, and does not
# add Vite to any package.json. The page still opens as a file:// document.
set -euo pipefail

usage() {
  echo "usage: live-preview.sh <artifact.html>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage

ARTIFACT=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
[[ -f "$ARTIFACT" ]] || {
  echo "live-preview: not a file: $1" >&2
  exit 1
}

PARENT=$(dirname "$ARTIFACT")
FILE=$(basename "$ARTIFACT")
SLUG=$(printf '%s' "$PARENT" | sha256sum | awk '{print substr($1,1,12)}')
SESSION="artifact-preview-${SLUG}"
PORT_FILE="/tmp/${SESSION}.port"
# Vite writes its cache beside the page unless told otherwise; this keeps the
# page's folder as the reader left it.
VITE_CONFIG="/tmp/${SESSION}.vite.config.mjs"
VITE_PIN="8.2.2"

tmux_bin() {
  if [[ -f /exec-daemon/tmux.portal.conf ]]; then
    tmux -f /exec-daemon/tmux.portal.conf "$@"
  else
    tmux "$@"
  fi
}

http_ok() {
  local port=$1
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    "http://127.0.0.1:${port}/${FILE}" || true)
  [[ "$code" == "200" ]]
}

port_listening() {
  local port=$1
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(0.3)
try:
    s.connect(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

pick_free_port() {
  python3 - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

print_url() {
  echo "http://localhost:${1}/${FILE}"
}

reuse_if_healthy() {
  local port=$1
  if port_listening "$port" && http_ok "$port"; then
    print_url "$port"
    return 0
  fi
  return 1
}

# Reuse a live server for this parent directory.
if [[ -f "$PORT_FILE" ]]; then
  EXISTING=$(tr -d '[:space:]' <"$PORT_FILE" || true)
  if [[ "$EXISTING" =~ ^[0-9]+$ ]] && reuse_if_healthy "$EXISTING"; then
    exit 0
  fi
fi

if tmux_bin has-session -t "=$SESSION" 2>/dev/null; then
  if [[ -f "$PORT_FILE" ]]; then
    EXISTING=$(tr -d '[:space:]' <"$PORT_FILE" || true)
    if [[ "$EXISTING" =~ ^[0-9]+$ ]] && reuse_if_healthy "$EXISTING"; then
      exit 0
    fi
  fi
  # This session name is ours. Recreate it when the listener is gone.
  # Do not kill any other session or any process bound to another port.
  tmux_bin kill-session -t "=$SESSION" 2>/dev/null || true
fi

have_npx=0
if command -v npx >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  have_npx=1
fi

start_cmd() {
  local port=$1
  if [[ "$have_npx" -eq 1 ]]; then
    printf 'npx --yes vite@%s --config %s --host 127.0.0.1 --port %s --strictPort --clearScreen false\n' \
      "$VITE_PIN" "$VITE_CONFIG" "$port"
  else
    printf 'python3 -m http.server %s --bind 127.0.0.1\n' "$port"
  fi
}

PORT=$(pick_free_port)
printf 'export default { cacheDir: "/tmp/%s-vite" };\n' "$SESSION" >"$VITE_CONFIG"
CMD=$(start_cmd "$PORT")

tmux_bin new-session -d -s "$SESSION" -c "$PARENT" -- bash -lc "$CMD"
echo "$PORT" >"$PORT_FILE"

# Wait for the listener, then require HTTP 200 on the artifact path. The
# first run downloads Vite, which can take most of a minute; a server that
# died stops the wait at once.
for _ in $(seq 1 360); do
  if reuse_if_healthy "$PORT"; then
    exit 0
  fi
  tmux_bin has-session -t "=$SESSION" 2>/dev/null || break
  sleep 0.25
done

echo "live-preview: server did not return HTTP 200 for ${FILE} on 127.0.0.1:${PORT}" >&2
echo "live-preview: inspect with: tmux attach -t ${SESSION}" >&2
exit 1
