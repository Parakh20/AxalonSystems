#!/bin/bash
# Start the Axalon relay + Cloudflare tunnel locally.
# Run once: chmod +x deploy/start-relay-local.sh
# Usage: ./deploy/start-relay-local.sh

set -e
REPO=/home/parakh/Desktop/AxalonSystems

export PYTHONSAFEPATH=1
export DRONE_TOKENS="drone-01:-kZuq7xmZ8r8Y5SPptrX1aMsxiKjGtpbZYTgNXt8lMw"
export OPS_TOKEN="8SJ5TKIWIS_cAZ53locG2nTdYm0gWGIH9FbbGu6H4Sg"
export TURN_HOST="relay.axalonsystems.com"
export TURN_SECRET="nRk67MA585oLaNLq-8W-AoSUhedoWMiQJBS8B19VzyM"

echo "[relay] starting uvicorn on :8800..."
cd /tmp
$REPO/.venv-relay/bin/uvicorn drone.relay.server:app \
  --host 0.0.0.0 --port 8800 &
RELAY_PID=$!

sleep 2
echo "[relay] starting cloudflare tunnel..."
$HOME/cloudflared tunnel --config $HOME/.cloudflared/config.yml --protocol http2 run axalon-relay &
TUNNEL_PID=$!

echo "[relay] relay PID=$RELAY_PID  tunnel PID=$TUNNEL_PID"
echo "[relay] press Ctrl+C to stop both"

trap "kill $RELAY_PID $TUNNEL_PID 2>/dev/null; exit" INT TERM
wait
