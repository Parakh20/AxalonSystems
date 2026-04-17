#!/usr/bin/env bash
# run.sh — Single script to start Axalon platform services
#
# Usage:
#   ./run.sh               # show help
#   ./run.sh api           # start FastAPI on :8000
#   ./run.sh dashboard     # start Streamlit on :8501
#   ./run.sh both          # start API + dashboard (background + foreground)
#   ./run.sh stop          # kill all running services
#   ./run.sh status        # check what's running
#
# Options (as env vars):
#   PORT=8000              # API port (default 8000)
#   DASH_PORT=8501         # dashboard port (default 8501)
#   DEVICE=cpu             # inference device: 0 (GPU) or cpu (default: 0)
#   HOST=0.0.0.0           # bind host (default 0.0.0.0)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve Python: prefer the active env's 'python', fall back to 'python3'
PYTHON="$(command -v python || command -v python3)"
PORT="${PORT:-8000}"
DASH_PORT="${DASH_PORT:-8501}"
HOST="${HOST:-0.0.0.0}"
DEVICE="${DEVICE:-0}"

API_PID_FILE="/tmp/axalon-api.pid"
DASH_PID_FILE="/tmp/axalon-dashboard.pid"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[axalon]${RESET} $*"; }
success() { echo -e "${GREEN}[axalon]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[axalon]${RESET} $*"; }
error()   { echo -e "${RED}[axalon]${RESET} $*" >&2; }

# ── Dependency check ──────────────────────────────────────────────────────────
# Run checks from /tmp so that the local platform/ directory does not shadow
# the stdlib 'platform' module (which streamlit imports at startup).
check_deps() {
    local missing=()
    (cd /tmp && "$PYTHON" -c "import uvicorn") 2>/dev/null || missing+=("uvicorn (pip install uvicorn[standard])")
    (cd /tmp && "$PYTHON" -c "import streamlit") 2>/dev/null || missing+=("streamlit (pip install streamlit)")
    (cd /tmp && "$PYTHON" -c "import axalon") 2>/dev/null || missing+=("axalon package (pip install -e .)")

    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing dependencies:"
        for dep in "${missing[@]}"; do
            error "  ✗ $dep"
        done
        echo ""
        echo "Run: pip install -r requirements_platform.txt && pip install -e ."
        exit 1
    fi
}

# ── Model check ───────────────────────────────────────────────────────────────
check_model() {
    if [ ! -f "${REPO_ROOT}/ml/checkpoints/best.pt" ]; then
        warn "Model weights not found at ml/checkpoints/best.pt"
        warn "Inference will fail until weights are placed there."
    else
        success "Model weights found: ml/checkpoints/best.pt"
    fi
}

# ── Start API ─────────────────────────────────────────────────────────────────
start_api() {
    if [ -f "$API_PID_FILE" ] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        warn "API already running (PID $(cat "$API_PID_FILE"))"
        return
    fi
    info "Starting FastAPI on http://${HOST}:${PORT} ..."
    # Run from /tmp so platform/ dir doesn't shadow stdlib 'platform' module
    nohup env -C /tmp "$PYTHON" -m uvicorn axalon.api.app:app \
        --host "$HOST" \
        --port "$PORT" \
        > "${REPO_ROOT}/logs/api.log" 2>&1 &
    echo $! > "$API_PID_FILE"
    sleep 1
    if kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        success "API started (PID $(cat "$API_PID_FILE")) → http://localhost:${PORT}/docs"
    else
        error "API failed to start. Check logs/api.log"
        exit 1
    fi
}

# ── Start Dashboard ───────────────────────────────────────────────────────────
start_dashboard() {
    if [ -f "$DASH_PID_FILE" ] && kill -0 "$(cat "$DASH_PID_FILE")" 2>/dev/null; then
        warn "Dashboard already running (PID $(cat "$DASH_PID_FILE"))"
        return
    fi
    info "Starting Streamlit dashboard on http://${HOST}:${DASH_PORT} ..."
    # Run from /tmp so platform/ dir doesn't shadow stdlib 'platform' module
    nohup env -C /tmp "$PYTHON" -m streamlit run "${REPO_ROOT}/platform/ui/dashboard.py" \
        --server.port "$DASH_PORT" \
        --server.address "$HOST" \
        --server.headless true \
        > "${REPO_ROOT}/logs/dashboard.log" 2>&1 &
    echo $! > "$DASH_PID_FILE"
    sleep 2
    if kill -0 "$(cat "$DASH_PID_FILE")" 2>/dev/null; then
        success "Dashboard started (PID $(cat "$DASH_PID_FILE")) → http://localhost:${DASH_PORT}"
    else
        error "Dashboard failed to start. Check logs/dashboard.log"
        exit 1
    fi
}

# ── Stop services ─────────────────────────────────────────────────────────────
stop_service() {
    local pid_file="$1"
    local name="$2"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            success "$name stopped (PID $pid)"
        else
            warn "$name was not running"
        fi
        rm -f "$pid_file"
    else
        warn "$name PID file not found — may not be running"
    fi
}

# ── Status ────────────────────────────────────────────────────────────────────
show_status() {
    echo -e "\n${BOLD}Axalon Platform Status${RESET}"
    echo "────────────────────────────"

    if [ -f "$API_PID_FILE" ] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
        echo -e "  API        ${GREEN}● running${RESET}  PID $(cat "$API_PID_FILE")  →  http://localhost:${PORT}"
    else
        echo -e "  API        ${RED}○ stopped${RESET}"
    fi

    if [ -f "$DASH_PID_FILE" ] && kill -0 "$(cat "$DASH_PID_FILE")" 2>/dev/null; then
        echo -e "  Dashboard  ${GREEN}● running${RESET}  PID $(cat "$DASH_PID_FILE")  →  http://localhost:${DASH_PORT}"
    else
        echo -e "  Dashboard  ${RED}○ stopped${RESET}"
    fi
    echo ""
}

# ── Help ──────────────────────────────────────────────────────────────────────
show_help() {
    echo -e "\n${BOLD}Axalon Solar Inspection Platform${RESET}"
    echo ""
    echo "Usage: ./run.sh <command>"
    echo ""
    echo -e "  ${CYAN}api${RESET}        Start FastAPI REST server on :${PORT}"
    echo -e "  ${CYAN}dashboard${RESET}  Start Streamlit dashboard on :${DASH_PORT}"
    echo -e "  ${CYAN}both${RESET}       Start API (background) + dashboard (foreground)"
    echo -e "  ${CYAN}stop${RESET}       Stop all running services"
    echo -e "  ${CYAN}status${RESET}     Show running service status"
    echo ""
    echo "Environment variables:"
    echo "  PORT=8000      API port"
    echo "  DASH_PORT=8501 Dashboard port"
    echo "  DEVICE=0       Inference device (0=GPU, cpu=CPU)"
    echo "  HOST=0.0.0.0   Bind address"
    echo ""
    echo "Logs:  logs/api.log  |  logs/dashboard.log"
    echo ""
}

# ── Ensure logs dir ───────────────────────────────────────────────────────────
mkdir -p "${REPO_ROOT}/logs"

# ── Main ──────────────────────────────────────────────────────────────────────
COMMAND="${1:-help}"

case "$COMMAND" in
    api)
        check_deps
        check_model
        start_api
        tail -f "${REPO_ROOT}/logs/api.log"
        ;;
    dashboard)
        check_deps
        check_model
        start_dashboard
        tail -f "${REPO_ROOT}/logs/dashboard.log"
        ;;
    both)
        check_deps
        check_model
        start_api
        info "API running in background. Starting dashboard..."
        info "Press Ctrl+C to stop the dashboard (API keeps running, use './run.sh stop' to stop all)"
        # Run from /tmp so platform/ dir doesn't shadow stdlib 'platform' module
        env -C /tmp "$PYTHON" -m streamlit run "${REPO_ROOT}/platform/ui/dashboard.py" \
            --server.port "$DASH_PORT" \
            --server.address "$HOST" \
            --server.headless true
        ;;
    stop)
        stop_service "$API_PID_FILE"       "API"
        stop_service "$DASH_PID_FILE"      "Dashboard"
        ;;
    status)
        show_status
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
