# EP1 BLE V1 Protocol

## Fixed packet
`uint16 seq + int16 emg[5] + int16 ax + int16 ay + int16 az` = 18 bytes.

Sampling: 500 Hz.
Notification rate: 100 Hz.

## Sequence semantics
Sequence increments once per BLE packet and wraps 65535 -> 0.
The browser calculates missing packets using modulo-65536 arithmetic. A very large discontinuity after reconnect is treated as a stream restart rather than thousands of lost packets.

## Time reconstruction
No timestamp is sent. Within one continuous stream, sample time is reconstructed from a 500 Hz sample counter. This keeps the BLE payload fixed and small.

## Accelerometer
Acceleration is reported in milli-g (mg). The LIS3DH is configured for ±4 g and sampled at 50 Hz; the latest reading is repeated in outgoing packets until the next accelerometer update.
