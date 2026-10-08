# EP1 Web Logger V1 — BLE Reliability Test Plan

## Gate 1 — Discovery
- Power EP1 from battery.
- Open the HTTPS web app.
- Click Connect.
- EP1 appears in the chooser.
- Correct service and characteristic are discovered.

## Gate 2 — Streaming
- Live EMG appears without starting recording.
- Packet counter increases continuously.
- Lost packet counter remains zero during a 10-minute idle run.

## Gate 3 — Reconnect
- Turn EP1 off while connected.
- App shows disconnected/reconnecting.
- Turn EP1 on.
- App reconnects without page reload.
- User Disconnect stops all automatic retries.

## Gate 4 — Data integrity
- 500 samples/s are reconstructed.
- Sequence gaps are reported.
- CSV sample count equals received packets × 5, minus any intentionally rejected malformed packets.

## Gate 5 — Long run
- 30-minute run.
- No page reload.
- No graph lockup.
- No unbounded display buffer growth.

## Gate 6 — RF/EMG
- Compare EMG with BLE disconnected and BLE streaming.
- Repeat with the XIAO antenna physically separated from the analog front-end and electrode wiring.
- Any BLE-correlated noise must be measured rather than assumed away.
