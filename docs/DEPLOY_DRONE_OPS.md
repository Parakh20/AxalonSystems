# Drone Remote Ops — Run & Deploy (Phase 1)

## Local end-to-end with ArduPilot SITL (no hardware)

1. **Install SITL** (once):
   ```bash
   pip install pymavlink mavproxy
   git clone https://github.com/ArduPilot/ardupilot --recursive
   cd ardupilot/ArduCopter && sim_vehicle.py -w   # build + init params
   ```
2. **Start SITL**, forwarding MAVLink to the agent's port:
   ```bash
   sim_vehicle.py -v ArduCopter --out=udp:127.0.0.1:14550 --console --map
   ```
3. **Start the relay**:
   ```bash
   DRONE_TOKENS="sitl-01:dtok" OPS_TOKEN="otok" \
     uvicorn drone.relay.server:app --host 0.0.0.0 --port 8800
   ```
4. **Start the agent**:
   ```bash
   DRONE_ID=sitl-01 DRONE_TOKEN=dtok \
     RELAY_WS_URL=ws://127.0.0.1:8800 \
     MAVLINK_URL=udpin:127.0.0.1:14550 TELEMETRY_HZ=5 \
     python -m drone.agent.main
   ```
5. **Fly it** in the SITL console: `mode guided`, `arm throttle`, `takeoff 40`.
6. **Run the e2e test**:
   ```bash
   RUN_SITL_E2E=1 RELAY_WS_URL=ws://127.0.0.1:8800 OPS_TOKEN=otok DRONE_ID=sitl-01 \
     python -m pytest drone/tests/test_e2e_sitl.py -v
   ```

## Production deploy

### Relay (Oracle A1 VM)
- `/etc/systemd/system/axalon-relay.service`:
  ```ini
  [Unit]
  Description=Axalon Drone Relay
  After=network-online.target
  [Service]
  Environment=DRONE_TOKENS=sitl-01:CHANGE_ME
  Environment=OPS_TOKEN=CHANGE_ME
  ExecStart=/usr/bin/uvicorn drone.relay.server:app --host 0.0.0.0 --port 8800
  WorkingDirectory=/opt/axalon
  Restart=always
  [Install]
  WantedBy=multi-user.target
  ```
- Front with Cloudflare for `wss://relay.axalonsystems.com`.
- Keep-alive cron to avoid Oracle Always-Free idle reclaim:
  `*/15 * * * * curl -s https://relay.axalonsystems.com/health >/dev/null`

### Agent (Jetson Orin Nano)
- `/etc/systemd/system/axalon-drone-agent.service` with `DRONE_ID`, `DRONE_TOKEN`,
  `RELAY_WS_URL=wss://relay.axalonsystems.com`, `MAVLINK_URL` pointing at the real
  Cube (e.g. `serial:/dev/ttyTHS1:921600`). `Restart=always`.

## Phase 2 — commands over SITL

Agent gains command handling + a deadman (RTL on relay-link loss). New agent env:
`MIN_ALT_M=5 MAX_ALT_M=120 HEARTBEAT_HZ=2 DEADMAN_TIMEOUT_S=5`.

Run the command e2e (with SITL + relay + agent up):
```bash
RUN_SITL_E2E=1 RELAY_WS_URL=ws://127.0.0.1:8800 OPS_TOKEN=otok DRONE_ID=sitl-01 \
  python -m pytest drone/tests/test_e2e_commands_sitl.py -v
```
Watch the SITL console: the vehicle should arm. Try TAKEOFF (`{"alt":40}`), then RTL.
