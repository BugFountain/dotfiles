#!/usr/bin/env bash
# Behavior test for live-preview.sh. tmux and npx are stand-ins; curl and
# python3 are real, so the HTTP 200 gate is exercised against a real listener.
set -euo pipefail

skill_dir="$(cd "$(dirname "$0")" && pwd)"
helper="$skill_dir/live-preview.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

bash -n "$helper"
[[ -x "$helper" ]] || fail "live-preview.sh is not executable"

tmpdir="$(mktemp -d)"
mock_bin="$tmpdir/bin"
site="$tmpdir/site"
mkdir -p "$mock_bin" "$site"
printf '<!doctype html><title>t</title>\n' >"$site/page.html"

# The helper keys its session and port file on the parent directory, so the
# test can predict both and clean them up.
slug="$(printf '%s' "$site" | sha256sum | awk '{print substr($1,1,12)}')"
session="artifact-preview-${slug}"
port_file="/tmp/${session}.port"
state="$tmpdir/state"
mkdir -p "$state"

cleanup() {
  if [[ -f "$state/pid" ]]; then
    kill "$(cat "$state/pid")" 2>/dev/null || true
  fi
  rm -f "$port_file"
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# tmux: one session, tracked by a pid file. The command after `--` runs in
# the background with the mock PATH so the npx stand-in is the one it finds.
cat >"$mock_bin/tmux" <<'EOSH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "-f" ]] && shift 2
cmd=$1; shift
case "$cmd" in
  has-session)
    [[ -f "$MOCK_STATE/pid" ]] && kill -0 "$(cat "$MOCK_STATE/pid")" 2>/dev/null
    ;;
  kill-session)
    [[ -f "$MOCK_STATE/pid" ]] && kill "$(cat "$MOCK_STATE/pid")" 2>/dev/null || true
    rm -f "$MOCK_STATE/pid"
    ;;
  new-session)
    dir=""
    while [[ $# -gt 0 && "$1" != "--" ]]; do
      [[ "$1" == "-c" ]] && dir=$2
      shift
    done
    shift
    echo 1 >>"$MOCK_STATE/new-session-calls"
    # $@ is `bash -lc "<command>"`; run the command string under the mock PATH.
    # Every fd is detached so the helper's command substitution can return.
    printf '%s\n' "${@: -1}" >"$MOCK_STATE/command"
    (cd "$dir" && exec bash -c "${@: -1}") >/dev/null 2>&1 </dev/null &
    echo $! >"$MOCK_STATE/pid"
    ;;
  *)
    echo "mock tmux: unexpected subcommand $cmd" >&2
    exit 1
    ;;
esac
EOSH

# npx: records its arguments and serves the cwd on the requested port.
cat >"$mock_bin/npx" <<'EOSH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >"$MOCK_STATE/npx-args"
port=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "--port" ]] && port=$2
  shift
done
exec python3 -m http.server "$port" --bind 127.0.0.1
EOSH

printf '#!/usr/bin/env bash\nexit 0\n' >"$mock_bin/node"
chmod +x "$mock_bin"/*
export MOCK_STATE="$state"
export PATH="$mock_bin:$PATH"

# Argument contract.
rc=0; "$helper" >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 2 ]] || fail "no arguments exited $rc, expected 2"
rc=0; "$helper" "$site/page.html" "$site/page.html" >/dev/null 2>&1 || rc=$?
[[ "$rc" -eq 2 ]] || fail "two arguments exited $rc, expected 2"
rc=0; "$helper" "$site/missing.html" >/dev/null 2>"$tmpdir/err" || rc=$?
[[ "$rc" -eq 1 ]] || fail "a missing artifact exited $rc, expected 1"
grep -Fq 'not a file' "$tmpdir/err"

# A stale port file names a port nothing listens on. The helper must start a
# fresh server rather than trust it.
stale_port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
echo "$stale_port" >"$port_file"

url="$("$helper" "$site/page.html")"
[[ "$url" =~ ^http://localhost:([0-9]+)/page\.html$ ]] || fail "unexpected URL: $url"
port="${BASH_REMATCH[1]}"
[[ "$(tr -d '[:space:]' <"$port_file")" == "$port" ]] || fail "port file does not record $port"
[[ "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/page.html")" == "200" ]]

# The server command: pinned Vite, loopback only, no port stealing.
npx_args="$(cat "$state/npx-args")"
[[ "$npx_args" == *"vite@8.2.2"* ]] || fail "Vite is not pinned: $npx_args"
[[ "$npx_args" == *"--host 127.0.0.1"* ]] || fail "server is not bound to loopback: $npx_args"
[[ "$npx_args" == *"--strictPort"* ]] || fail "server may steal a busy port: $npx_args"
[[ "$npx_args" == *"--port $port"* ]] || fail "server port differs from the printed URL: $npx_args"

# A second call for the same directory reuses the live server.
url_again="$("$helper" "$site/page.html")"
[[ "$url_again" == "$url" ]] || fail "reuse printed a different URL: $url_again"
[[ "$(wc -l <"$state/new-session-calls")" -eq 1 ]] || fail "reuse started a second session"

# The helper is the only place the server mechanism lives. A Markdown file
# under this skill that restates the command is a second copy that drifts.
mechanism_tokens='vite@|new-session|http\.server|strictPort'
if grep -rEn "$mechanism_tokens" --include='*.md' "$skill_dir"; then
  fail "a Markdown file restates the preview server command; point at live-preview.sh instead"
fi

# The router and the recipe still route agents to the helper.
grep -Fq 'live-preview.sh' "$skill_dir/SKILL.md" || fail "SKILL.md does not name live-preview.sh"
grep -Fq '## Live preview' "$skill_dir/SKILL.md" || fail "SKILL.md lost the Live preview anchor"
grep -Fq 'SKILL.md#live-preview' "$skill_dir/recipes/review.md" || fail "review recipe lost its Live preview link"

echo "live-preview.test.sh passed."
