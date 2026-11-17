#!/usr/bin/env bash
# Review module lifecycle (issue #163): static dist on :11483, gateway
# proxies /shell/fusion-review/ here. PID file + logs under ./.run/.
set -euo pipefail
cd "$(dirname "$0")"

RUN_DIR=".run"
PID_FILE="$RUN_DIR/review.pid"
LOG_FILE="$RUN_DIR/review.log"
PORT="${FUSION_REVIEW_PORT:-11483}"

mkdir -p "$RUN_DIR"

is_up() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-start}" in
    start)
        if is_up; then
            echo "[review] already running (PID $(cat "$PID_FILE"))"
            exit 0
        fi
        if [ ! -f dist/index.html ]; then
            echo "[review] dist missing — building"
            bun run build
        fi
        nohup bun serve.ts >>"$LOG_FILE" 2>&1 &
        echo $! >"$PID_FILE"
        sleep 1
        if curl -sf -m 3 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
            echo "[review] running (PID $(cat "$PID_FILE")) on :$PORT"
        else
            echo "[review] FAILED to come up — see $LOG_FILE"
            exit 1
        fi
        ;;
    stop)
        if is_up; then
            kill "$(cat "$PID_FILE")"
            rm -f "$PID_FILE"
            echo "[review] stopped"
        else
            echo "[review] not running"
            rm -f "$PID_FILE"
        fi
        ;;
    restart)
        "$0" stop
        "$0" start
        ;;
    status)
        if is_up; then
            echo "[review] running (PID $(cat "$PID_FILE")) on :$PORT"
        else
            echo "[review] not running"
            exit 1
        fi
        ;;
    log)
        tail -n "${2:-50}" -f "$LOG_FILE"
        ;;
    *)
        echo "usage: $0 {start|stop|restart|status|log [n]}"
        exit 2
        ;;
esac
