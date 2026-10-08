#include <Arduino.h>
#include <Wire.h>
#include <NimBLEDevice.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_Sensor.h>

// FruitWorks EP1 Web Logger V1 / development iteration V3
// Fixed BLE packet: 18 bytes, 500 Hz EMG, 5 samples/notification.

static constexpr char DEVICE_NAME[] = "Fruitworks-EP1";
static constexpr char SERVICE_UUID[] = "7d6b2a10-2f5d-4f6c-9d5f-1f4b9c0a1101";
static constexpr char DATA_UUID[] = "7d6b2a11-2f5d-4f6c-9d5f-1f4b9c0a1101";

static constexpr int EMG_PIN = 0;
static constexpr int SDA_PIN = 22;
static constexpr int SCL_PIN = 23;
static constexpr int LED_PIN = 15;

static constexpr uint32_t EMG_RATE_HZ = 500;
static constexpr uint32_t PACKET_SAMPLES = 5;
static constexpr uint32_t PACKET_RATE_HZ = EMG_RATE_HZ / PACKET_SAMPLES;
static constexpr uint32_t SAMPLE_PERIOD_US = 1000000UL / EMG_RATE_HZ;

struct __attribute__((packed)) DataPacket {
  uint16_t sequence;
  int16_t emg[PACKET_SAMPLES];
  int16_t ax_mg;
  int16_t ay_mg;
  int16_t az_mg;
};
static_assert(sizeof(DataPacket) == 18, "EP1 packet must be 18 bytes");

NimBLECharacteristic* dataCharacteristic = nullptr;
volatile bool clientConnected = false;
Adafruit_LIS3DH lis = Adafruit_LIS3DH();
bool lisOk = false;

uint16_t packetSequence = 0;
DataPacket packet;
uint8_t packetIndex = 0;
uint32_t nextSampleUs = 0;
uint32_t nextAccelUs = 0;
int16_t axMg = 0, ayMg = 0, azMg = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    (void)pServer; (void)connInfo;
    clientConnected = true;
    digitalWrite(LED_PIN, LOW);
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
    (void)pServer; (void)connInfo; (void)reason;
    clientConnected = false;
    digitalWrite(LED_PIN, HIGH);
    NimBLEDevice::startAdvertising();
  }
};

ServerCallbacks serverCallbacks;

static void updateAccelerometer() {
  if (!lisOk) return;
  sensors_event_t event;
  lis.getEvent(&event);
  axMg = (int16_t)constrain(lroundf(event.acceleration.x / 9.80665f * 1000.0f), -32768L, 32767L);
  ayMg = (int16_t)constrain(lroundf(event.acceleration.y / 9.80665f * 1000.0f), -32768L, 32767L);
  azMg = (int16_t)constrain(lroundf(event.acceleration.z / 9.80665f * 1000.0f), -32768L, 32767L);
}

static void sendPacket() {
  if (!clientConnected || dataCharacteristic == nullptr || packetIndex != PACKET_SAMPLES) return;
  packet.sequence = packetSequence++;
  packet.ax_mg = axMg;
  packet.ay_mg = ayMg;
  packet.az_mg = azMg;
  dataCharacteristic->setValue(reinterpret_cast<uint8_t*>(&packet), sizeof(packet));
  dataCharacteristic->notify();
  packetIndex = 0;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  analogReadResolution(12);
  analogSetPinAttenuation(EMG_PIN, ADC_11db);

  Wire.begin(SDA_PIN, SCL_PIN);
  lisOk = lis.begin(0x18);
  if (!lisOk) lisOk = lis.begin(0x19);
  if (lisOk) {
    lis.setRange(LIS3DH_RANGE_4_G);
    lis.setDataRate(LIS3DH_DATARATE_50_HZ);
  } else {
    axMg = ayMg = azMg = 0;
  }

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);

  NimBLEService* service = server->createService(SERVICE_UUID);
  dataCharacteristic = service->createCharacteristic(DATA_UUID, NIMBLE_PROPERTY::NOTIFY);
  service->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setName(DEVICE_NAME);
  advertising->start();

  nextSampleUs = micros();
  nextAccelUs = micros();
}

void loop() {
  const uint32_t now = micros();

  if ((int32_t)(now - nextAccelUs) >= 0) {
    updateAccelerometer();
    nextAccelUs += 20000UL; // 50 Hz
  }

  if ((int32_t)(now - nextSampleUs) >= 0) {
    nextSampleUs += SAMPLE_PERIOD_US;
    packet.emg[packetIndex++] = (int16_t)analogRead(EMG_PIN);
    if (packetIndex >= PACKET_SAMPLES) sendPacket();
  }

  // Recover cleanly if an unusually long blocking event occurs.
  if ((int32_t)(micros() - nextSampleUs) > 100000) {
    nextSampleUs = micros() + SAMPLE_PERIOD_US;
    packetIndex = 0;
  }

  if (!clientConnected) {
    static uint32_t lastBlink = 0;
    uint32_t t = millis();
    if (t - lastBlink >= 500) {
      lastBlink = t;
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
  }
}
