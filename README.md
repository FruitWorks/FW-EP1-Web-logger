# FruitWorks EP1 Web Logger V1

**Development iteration:** V3
**Release label:** V1.0
**Platform:** Chromium/Chrome + Web Bluetooth
**Hardware:** XIAO ESP32-C6 + Muscle BioAmp Candy + LIS3DH

## Goal
A deliberately small, reliable BLE logger for EP1. No Python, no Bleak, no browser extensions, no local backend. The production web app is served over HTTPS because Web Bluetooth requires a secure context.

## BLE protocol
- Device name: `Fruitworks-EP1`
- Service UUID: `7d6b2a10-2f5d-4f6c-9d5f-1f4b9c0a1101`
- Notify characteristic UUID: `7d6b2a11-2f5d-4f6c-9d5f-1f4b9c0a1101`
- Packet size: exactly 18 bytes
- 500 EMG samples/s
- 5 EMG samples per notification
- 100 notifications/s
- Little-endian fields

Packet layout:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 2 | sequence uint16 |
| 2 | 2 | EMG sample 0 int16 |
| 4 | 2 | EMG sample 1 int16 |
| 6 | 2 | EMG sample 2 int16 |
| 8 | 2 | EMG sample 3 int16 |
| 10 | 2 | EMG sample 4 int16 |
| 12 | 2 | accel X int16, mg |
| 14 | 2 | accel Y int16, mg |
| 16 | 2 | accel Z int16, mg |

The 18-byte packet intentionally avoids depending on a negotiated large MTU.

## Firmware wiring
- Muscle BioAmp Candy OUT -> XIAO ESP32-C6 GPIO0
- LIS3DH SDA -> GPIO22
- LIS3DH SCL -> GPIO23
- LIS3DH -> 3.3 V and GND
- Candy -> appropriate 3.3 V/GND supply

## Firmware libraries
Install:
1. NimBLE-Arduino 2.x
2. Adafruit LIS3DH
3. Adafruit Unified Sensor

Board: Seeed Studio XIAO ESP32C6.

## Web app
Open `web/index.html` from an HTTPS origin. `file://` is not the production path for Web Bluetooth.

The app:
- connects through a user button
- filters for the EP1 service/device
- discovers the service and notify characteristic
- starts notifications once
- validates every packet length before parsing
- detects sequence gaps
- separates BLE receive rate from graph redraw rate
- keeps a fixed-size display buffer
- reconnects after unexpected disconnects with bounded backoff
- does not reconnect after the user intentionally disconnects
- records raw samples to CSV
- never requires a terminal or Python runtime

## Reliability rules
1. Do not change UUIDs between firmware and web app.
2. Do not add MTU negotiation to V1.
3. Do not add connection-parameter updates until the baseline is proven.
4. Do not send variable-length packets.
5. Do not mix this firmware with the old V1/V2 logger.
6. Test BLE OFF/ON behaviour and repeated connect/disconnect before human EMG testing.

## Browser requirement
Use a current Chromium-based browser on Linux with Bluetooth support. Web Bluetooth is a secure-context API and requires explicit user permission.
