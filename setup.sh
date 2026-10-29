#!/usr/bin/env bash
# Organon-style bootstrap for DSH + fixed greedy + ALE-Bench only.
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DSH_HOME="${DSH_HOME:-$HOME/.dsh-aad}"
DSH_REPO="${DSH_REPO:-$HOME/deepseek-harness}"
PROFILE="${PROFILE:-greedy}"
BENCH_HOME="${BENCH_HOME:-$DSH_HOME/benchmarks}"
BENCH_VENV="$BENCH_HOME/venv"
DSH_REF=dsh-v0.1.7-rc.1
ALE_REF=3da9b12fb5d112dabb3af693d1a42031c95142bc
fail() { echo "setup: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing prerequisite: $1"; }
for tool in node pnpm git python3; do need "$tool"; done
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' || fail 'Use Node 24 or newer'
python3 "$KIT/scripts/verify.py"
if [ ! -f "$DSH_REPO/apps/cli/package.json" ]; then
  [ ! -e "$DSH_REPO" ] || fail "$DSH_REPO exists but is not a DSH source checkout"
  git clone --branch "$DSH_REF" --depth 1 https://github.com/deepseek-ai/deepseek-harness.git "$DSH_REPO"
fi
version="$(node -p 'require(process.argv[1]).version' "$DSH_REPO/apps/cli/package.json")"
[ "$version" = 0.1.7-rc.1 ] || fail "Expected DSH 0.1.7-rc.1, found $version; use a separate checkout"
if [ ! -f "$DSH_REPO/apps/cli/lib/bin.js" ] || [ ! -d "$DSH_REPO/node_modules" ]; then
  (cd "$DSH_REPO" && pnpm install && pnpm run build)
fi
(cd "$DSH_REPO" && pnpm dsh plugin --profile "$PROFILE" add "$KIT/dist/dsh-aad-greedy-0.1.0.tgz")
if [ "${SKIP_ALE:-0}" != 1 ]; then
  for tool in docker bwrap; do need "$tool"; done
  docker info >/dev/null
  mkdir -p "$BENCH_HOME"
  ALE_DIR="$BENCH_HOME/ALE-Bench"
  if [ ! -d "$ALE_DIR" ]; then
    git clone https://github.com/SakanaAI/ALE-Bench.git "$ALE_DIR"
    git -C "$ALE_DIR" checkout --detach "$ALE_REF"
  fi
  [ "$(git -C "$ALE_DIR" rev-parse HEAD)" = "$ALE_REF" ] || fail "Existing ALE-Bench is not pinned to $ALE_REF"
  [ -z "$(git -C "$ALE_DIR" status --porcelain --untracked-files=no)" ] || fail 'Existing ALE-Bench has tracked edits'
  [ -x "$BENCH_VENV/bin/python" ] || python3 -m venv "$BENCH_VENV"
  "$BENCH_VENV/bin/python" -m pip install "$ALE_DIR[eval]"
  "$BENCH_VENV/bin/python" -m pip freeze > "$BENCH_HOME/pip-freeze.txt"
  (cd "$ALE_DIR" && bash scripts/docker_build_all.sh "$(id -u)" "$(id -g)")
  "$BENCH_VENV/bin/python" -c 'from ale_bench.result import JudgeResult; from ale_bench_eval.safe_ale_session import start_ale_bench_session'
fi
printf '\nInstalled profile: %s\nDSH_HOME: %s\n' "$PROFILE" "$DSH_HOME"
printf 'Start from %s with BENCH_VENV/bin on PATH, using pnpm dsh web.\n' "$DSH_REPO"
echo 'See README.md and PROMPT.md. Setup does not launch searches.'
