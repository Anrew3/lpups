
#include <DFRobot_LPUPS.h>
#include <HIDPowerDevice.h>
#include <EEPROM.h>
#include "upsDef.h"

uint8_t regBuf[DATA_LEN_MAX] = { 0 };
DFRobot_LPUPS_I2C::sChargerStatus0_t chargerStatus0;
DFRobot_LPUPS_I2C::sChargerStatus1_t chargerStatus1;
DFRobot_LPUPS_I2C::sProchotStatus0_t prochotStatus0;
DFRobot_LPUPS_I2C::sProchotStatus1_t prochotStatus1;
uint16_t systemPower = 0, inputVoltage = 0;
uint16_t dischargeCurrent = 0, chargeCurrent = 0;
uint16_t CMPINVoltage = 0, inputCurrent = 0;
uint16_t batteryVoltage = 0, systemVoltage = 0, maxChargeVoltage = 0;

// Battery 2: External 12V LiON pack
byte     iB2Remaining     = 0;
byte     iB2PresentStatus = 0;
uint16_t iB2PowerDrawW    = 0;   // instantaneous Watts from 12V pack
uint16_t iB2RuntimeMins   = 0;   // estimated minutes remaining
uint16_t iB2AvgCurrentMA  = 0;   // 5-minute average input current
bool bCharging, bACPresent, bDischarging; // Whether charging, AC power present, discharging

// outputBuf removed — all serial output now uses F() macro to store strings in flash

// String constants
const char STRING_DEVICE_CHEMISTRY[] PROGMEM = "Li-ion";   // Li-ion
const char STRING_OEM_VENDOR[] PROGMEM = "MyCoolUPS";
const char STRING_SERIAL[] PROGMEM = "UPS100";   // UPS100

const byte bDeviceChemistry = IDEVICECHEMISTRY;   // Index of a string descriptor containing the battery’s chemistry.
const byte bOEMVendor = IOEMVENDOR;

uint16_t iPresentStatus = 0;   // Now and previous device status.

byte bRechargable = 1;   // Rechargeable Battery (1)/Not Rechargeable Battery (0)
byte bCapacityMode = 2;   // In the data manual, "2" represents battery capacity in percentage.

// Physical parameters.
const uint16_t iConfigVoltage = MAX_BATTERY_VOLTAGE;   // Nominal value of the voltage.
uint16_t iVoltage = MAX_BATTERY_VOLTAGE;
uint16_t iRunTimeToEmpty = 0;
uint16_t iAvgTimeToFull = 7200;
uint16_t iAvgTimeToEmpty = 7200;   // 12
uint16_t iRemainTimeLimit = 600;   // 1
/* Writing this value immediately shuts down (i.e., turns off) the output
   for a period equal to the indicated number of seconds in
   DelayBeforeReboot, after which time the output is started. */
int16_t  iDelayBe4Reboot = -1;
/* Writing this value shuts down (i.e., turns off) either the output after
  the indicated number of seconds, or sooner if the batteries become depleted. */
int16_t  iDelayBe4ShutDown = -1;

byte iAudibleAlarmCtrl = 2; // 1 - Disabled, 2 - Enabled, 3 - Muted

// Parameters compliant with Advanced Configuration and Power Interface (ACPI).
const byte iDesignCapacity = 100;
byte iWarnCapacityLimit = 10; // warning at 10% 
byte iRemnCapacityLimit = 5; // low at 5% 
const byte bCapacityGranularity1 = 1; // Battery capacity granularity between low and warning.
const byte bCapacityGranularity2 = 1; // Battery capacity granularity between warning and full.
byte iFullChargeCapacity = 100;


void initPowerDevice(void)
{
  PowerDevice.begin();

  // 序列号是以特殊方式设置的，因为它形成了Arduino端口名称
  PowerDevice.setSerial(STRING_SERIAL);

  // 用于调试目的。
  PowerDevice.setOutput(Serial);

  // usb上报参数设置
  PowerDevice.setFeature(HID_PD_PRESENTSTATUS, &iPresentStatus, sizeof(iPresentStatus));

  PowerDevice.setFeature(HID_PD_RUNTIMETOEMPTY, &iRunTimeToEmpty, sizeof(iRunTimeToEmpty));
  PowerDevice.setFeature(HID_PD_AVERAGETIME2FULL, &iAvgTimeToFull, sizeof(iAvgTimeToFull));
  PowerDevice.setFeature(HID_PD_AVERAGETIME2EMPTY, &iAvgTimeToEmpty, sizeof(iAvgTimeToEmpty));
  PowerDevice.setFeature(HID_PD_REMAINTIMELIMIT, &iRemainTimeLimit, sizeof(iRemainTimeLimit));
  PowerDevice.setFeature(HID_PD_DELAYBE4REBOOT, &iDelayBe4Reboot, sizeof(iDelayBe4Reboot));
  PowerDevice.setFeature(HID_PD_DELAYBE4SHUTDOWN, &iDelayBe4ShutDown, sizeof(iDelayBe4ShutDown));

  PowerDevice.setFeature(HID_PD_RECHARGEABLE, &bRechargable, sizeof(bRechargable));
  PowerDevice.setFeature(HID_PD_CAPACITYMODE, &bCapacityMode, sizeof(bCapacityMode));
  PowerDevice.setFeature(HID_PD_CONFIGVOLTAGE, &iConfigVoltage, sizeof(iConfigVoltage));
  PowerDevice.setFeature(HID_PD_VOLTAGE, &iVoltage, sizeof(iVoltage));

  PowerDevice.setStringFeature(HID_PD_IDEVICECHEMISTRY, &bDeviceChemistry, STRING_DEVICE_CHEMISTRY);
  PowerDevice.setStringFeature(HID_PD_IOEMINFORMATION, &bOEMVendor, STRING_OEM_VENDOR);

  PowerDevice.setFeature(HID_PD_AUDIBLEALARMCTRL, &iAudibleAlarmCtrl, sizeof(iAudibleAlarmCtrl));

  PowerDevice.setFeature(HID_PD_DESIGNCAPACITY, &iDesignCapacity, sizeof(iDesignCapacity));
  PowerDevice.setFeature(HID_PD_FULLCHRGECAPACITY, &iFullChargeCapacity, sizeof(iFullChargeCapacity));
  PowerDevice.setFeature(HID_PD_REMAININGCAPACITY, &iRemaining, sizeof(iRemaining));
  PowerDevice.setFeature(HID_PD_WARNCAPACITYLIMIT, &iWarnCapacityLimit, sizeof(iWarnCapacityLimit));
  PowerDevice.setFeature(HID_PD_REMNCAPACITYLIMIT, &iRemnCapacityLimit, sizeof(iRemnCapacityLimit));
  PowerDevice.setFeature(HID_PD_CPCTYGRANULARITY1, &bCapacityGranularity1, sizeof(bCapacityGranularity1));
  PowerDevice.setFeature(HID_PD_CPCTYGRANULARITY2, &bCapacityGranularity2, sizeof(bCapacityGranularity2));
}

void printChargeData(void)
{
  // Rate limiter: verbose dump every 10 cycles (~30 seconds at 3s/cycle)
  static uint8_t verboseCounter = 0;
  bool printVerbose = (verboseCounter == 0);
  verboseCounter++;
  if (verboseCounter >= 10) verboseCounter = 0;

  /*************** CS32_I2C_CHARGER_STATUS_REG ~ CS32_I2C_PROCHOT_STATUS_REG ***************/
  memcpy(&chargerStatus0, &regBuf[CS32_I2C_CHARGER_STATUS_REG],     sizeof(regBuf[CS32_I2C_CHARGER_STATUS_REG]));
  memcpy(&chargerStatus1, &regBuf[CS32_I2C_CHARGER_STATUS_REG + 1], sizeof(regBuf[CS32_I2C_CHARGER_STATUS_REG + 1]));
  memcpy(&prochotStatus0, &regBuf[CS32_I2C_PROCHOT_STATUS_REG],     sizeof(regBuf[CS32_I2C_PROCHOT_STATUS_REG]));
  memcpy(&prochotStatus1, &regBuf[CS32_I2C_PROCHOT_STATUS_REG + 1], sizeof(regBuf[CS32_I2C_PROCHOT_STATUS_REG + 1]));

  /*************** CS32_I2C_ADC_PSYS_REG ~ CS32_I2C_ADC_VSYS_REG ***************/
  // All ADC values calculated every cycle — only Serial output is rate-limited
  // PSYS: Full range: 3.06 V, LSB: 12 mV
  systemPower = regBuf[CS32_I2C_ADC_PSYS_REG] * 12;
  // VBUS: Full range: 3.2 V - 19.52 V, LSB: 64 mV
  inputVoltage = 3200 + regBuf[CS32_I2C_ADC_VBUS_REG] * 64;
  if (3200 == inputVoltage) inputVoltage = 0;
  // IDCHG: Full range: 32.512 A, LSB: 256 mA
  dischargeCurrent = regBuf[CS32_I2C_ADC_IDCHG_REG] * 256;
  // ICHG: Full range 8.128 A, LSB: 64 mA
  chargeCurrent = regBuf[CS32_I2C_ADC_ICHG_REG] * 64;
  // CMPIN: Full range 3.06 V, LSB: 12 mV
  CMPINVoltage = regBuf[CS32_I2C_ADC_CMPIN_REG] * 12;
  // IIN: Full range: 12.75 A, LSB: 50 mA
  inputCurrent = regBuf[CS32_I2C_ADC_IIN_REG] * 50;
  // VBAT: Full range: 2.88 V - 19.2 V, LSB 64 mV
  batteryVoltage = 2880 + regBuf[CS32_I2C_ADC_VBAT_REG] * 64;
  if (2880 == batteryVoltage) batteryVoltage = 0;
  // VSYS: Full range: 2.88 V - 19.2 V, LSB: 64 mV
  systemVoltage = 2880 + regBuf[CS32_I2C_ADC_VSYS_REG] * 64;
  if (2880 == systemVoltage) systemVoltage = 0;
  maxChargeVoltage = LPUPS_CONCAT_BYTES(regBuf[CS32_I2C_SET_VBAT_LIMIT_REG + 1], regBuf[CS32_I2C_SET_VBAT_LIMIT_REG]);

  if (printVerbose) {
    Serial.print(F("Charger status 0 = 0x")); Serial.println(regBuf[CS32_I2C_CHARGER_STATUS_REG], HEX);
    Serial.print(F("Charger status 1 = 0x")); Serial.println(regBuf[CS32_I2C_CHARGER_STATUS_REG + 1], HEX);
    Serial.print(F("Prochot status 0 = 0x")); Serial.println(regBuf[CS32_I2C_PROCHOT_STATUS_REG], HEX);
    Serial.print(F("Prochot status 1 = 0x")); Serial.println(regBuf[CS32_I2C_PROCHOT_STATUS_REG + 1], HEX);
    Serial.print(F("System power     = ")); Serial.print(systemPower);     Serial.println(F(" mV"));
    Serial.print(F("Input voltage    = ")); Serial.print(inputVoltage);    Serial.println(F(" mV"));
    Serial.print(F("Discharge curr   = ")); Serial.print(dischargeCurrent);Serial.println(F(" mA"));
    Serial.print(F("Charge curr      = ")); Serial.print(chargeCurrent);   Serial.println(F(" mA"));
    Serial.print(F("CMPIN voltage    = ")); Serial.print(CMPINVoltage);    Serial.println(F(" mV"));
    Serial.print(F("Input current    = ")); Serial.print(inputCurrent);    Serial.println(F(" mA"));
    Serial.print(F("Battery voltage  = ")); Serial.print(batteryVoltage);  Serial.println(F(" mV"));
    Serial.print(F("System voltage   = ")); Serial.print(systemVoltage);   Serial.println(F(" mV"));
    Serial.print(F("Max charge volt  = ")); Serial.print(maxChargeVoltage);Serial.println(F(" mV"));
  }
}

void flashReportedData(void)
{
  // Charging status
  if (bCharging)
    bitSet(iPresentStatus, PRESENTSTATUS_CHARGING);
  else
    bitClear(iPresentStatus, PRESENTSTATUS_CHARGING);

  // AC power supply
  if (bACPresent)
    bitSet(iPresentStatus, PRESENTSTATUS_ACPRESENT);
  else
    bitClear(iPresentStatus, PRESENTSTATUS_ACPRESENT);

  // Fully charged
  if (iRemaining == iFullChargeCapacity)
    bitSet(iPresentStatus, PRESENTSTATUS_FULLCHARGE);
  else
    bitClear(iPresentStatus, PRESENTSTATUS_FULLCHARGE);

  // Discharging
  if (bDischarging) {   // Not charging
    bitSet(iPresentStatus, PRESENTSTATUS_DISCHARGING);
    // if(iRemaining < iRemnCapacityLimit) bitSet(iPresentStatus,PRESENTSTATUS_BELOWRCL);   // Below remaining capacity limit.

    // Exceeded runtime/capacity limit.
    if (iRunTimeToEmpty < iRemainTimeLimit)
      bitSet(iPresentStatus, PRESENTSTATUS_RTLEXPIRED);
    else
      bitClear(iPresentStatus, PRESENTSTATUS_RTLEXPIRED);

  } else {
    bitClear(iPresentStatus, PRESENTSTATUS_DISCHARGING);
    bitClear(iPresentStatus, PRESENTSTATUS_RTLEXPIRED);   // Clearing relevant flags during charging.
  }

  // Shutdown request.
  if (iDelayBe4ShutDown > 0) {
    bitSet(iPresentStatus, PRESENTSTATUS_SHUTDOWNREQ);
    Serial.println(F("Shutdown requested"));
  } else
    bitClear(iPresentStatus, PRESENTSTATUS_SHUTDOWNREQ);

  // Shutdown imminent.
  if ((iPresentStatus & (1 << PRESENTSTATUS_SHUTDOWNREQ)) ||
    (iPresentStatus & (1 << PRESENTSTATUS_RTLEXPIRED))) {
    bitSet(iPresentStatus, PRESENTSTATUS_SHUTDOWNIMNT);
    Serial.println(F("Shutdown imminent"));
  } else
    bitClear(iPresentStatus, PRESENTSTATUS_SHUTDOWNIMNT);

  bitSet(iPresentStatus, PRESENTSTATUS_BATTPRESENT);   // - Power BATT
}

// ============================================================
// Battery 2: External 12V LiON pack logic
// ============================================================
void updateB2(void) {
  // --- Capacity: linear map from B2_VOLTAGE_MIN_MV(0%) to B2_VOLTAGE_MAX_MV(100%) ---
  if (inputVoltage == 0 || inputVoltage < B2_VOLTAGE_MIN_MV) {
    iB2Remaining = 0;
  } else if (inputVoltage >= B2_VOLTAGE_MAX_MV) {
    iB2Remaining = 100;
  } else {
    iB2Remaining = (byte)(((float)(inputVoltage - B2_VOLTAGE_MIN_MV) /
                            (float)(B2_VOLTAGE_MAX_MV - B2_VOLTAGE_MIN_MV)) * 100.0f);
  }

  // --- State flags ---
  bool b2Present = (inputVoltage >= B2_VOLTAGE_MIN_MV);

  // --- Per-cycle deltas for spike / event detection and load-drop discrimination ---
  static uint16_t b2PrevVoltage  = 0;
  static uint16_t b2PrevCurrent  = 0;
  if (b2PrevVoltage == 0) b2PrevVoltage = inputVoltage;
  if (b2PrevCurrent == 0 && inputCurrent > 0) b2PrevCurrent = inputCurrent;
  int16_t instantDelta        = (int16_t)inputVoltage  - (int16_t)b2PrevVoltage;
  int16_t instantCurrentDelta = (int16_t)inputCurrent  - (int16_t)b2PrevCurrent;
  b2PrevVoltage  = inputVoltage;
  b2PrevCurrent  = inputCurrent;

  // --- Charging detection: spike path + fast path (CV) + slow path (CC) ---
  static uint8_t  b2SetCount        = 0;
  static uint8_t  b2ClearCount      = 0;
  static bool     b2ChargingFlag    = false;
  static uint16_t b2Snapshot        = 0;
  static uint16_t b2SnapshotCurrent = 0;  // inputCurrent at last snapshot (for load-drop check)
  static uint8_t  b2WindowTimer     = 0;
  static bool     b2TrendCharging   = false;

  if (!b2Present) {
    b2SetCount = 0; b2ClearCount = 0; b2ChargingFlag    = false;
    b2Snapshot = 0; b2WindowTimer = 0; b2TrendCharging   = false;
    b2SnapshotCurrent = 0; b2PrevVoltage = 0; b2PrevCurrent = 0;
  } else {
    // SPIKE PATH — large instantaneous delta means physical connect/disconnect.
    //
    // Plug guard: if current dropped in the same cycle as voltage spiked up,
    // it is a load reduction (less sag), not the charger.  Only fire if
    // current did NOT drop by more than B2_LOAD_DROP_MA.
    bool plugSpike   = (instantDelta        >=  (int16_t)B2_SPIKE_MV)
                    && (inputVoltage        >=  12000)
                    && (instantCurrentDelta > -(int16_t)B2_LOAD_DROP_MA);
    bool unplugSpike = (instantDelta        <= -(int16_t)B2_SPIKE_MV)
                    && b2ChargingFlag;

    if (plugSpike) {
      Serial.println(F(">>> B2 CHARGER CONNECTED (spike detected)"));
      b2SetCount      = B2_CHARGE_SET_CYCLES - 1;  // one more good reading = confirmed
      b2ClearCount    = 0;
      b2TrendCharging = false;
      b2Snapshot        = inputVoltage;
      b2SnapshotCurrent = inputCurrent;
      b2WindowTimer   = 0;
    } else if (unplugSpike) {
      Serial.println(F(">>> B2 CHARGER DISCONNECTED (spike detected)"));
      b2ChargingFlag  = false;
      b2TrendCharging = false;
      b2SetCount      = 0;
      b2ClearCount    = 0;
      b2Snapshot        = inputVoltage;
      b2SnapshotCurrent = inputCurrent;
      b2WindowTimer   = 0;
    } else {
      // SLOW PATH — 2-minute snapshot trend (CC phase, pack < ~85%).
      //
      // Load-drop guard: if voltage rose over the window BUT current also dropped
      // by >= B2_LOAD_DROP_MA, the rise is from reduced sag, not the charger.
      if (b2Snapshot == 0) {
        b2Snapshot        = inputVoltage;
        b2SnapshotCurrent = inputCurrent;
      } else {
        b2WindowTimer++;
        if (b2WindowTimer >= B2_CHARGE_WINDOW_CYCLES) {
          int16_t rise        = (int16_t)inputVoltage - (int16_t)b2Snapshot;
          int16_t currentDrop = (int16_t)b2SnapshotCurrent - (int16_t)inputCurrent;
          bool    fromLoad    = (rise >= (int16_t)B2_CHARGE_RISE_MV)
                             && (currentDrop >= (int16_t)B2_LOAD_DROP_MA);
          if (!fromLoad) {
            if      (rise >= (int16_t)B2_CHARGE_RISE_MV)  b2TrendCharging = true;
            else if (rise <= -(int16_t)B2_CHARGE_RISE_MV) b2TrendCharging = false;
          }
          b2Snapshot        = inputVoltage;
          b2SnapshotCurrent = inputCurrent;
          b2WindowTimer     = 0;
        }
      }

      // FAST PATH + SLOW PATH combined — either counts as evidence.
      // Fast path (voltage held >= 12480 by charger) is self-confirming:
      // a load drop cannot sustain that voltage against the LP's draw unless
      // the charger is actively holding it up.
      bool evidence = (inputVoltage >= B2_CHARGE_VOLTAGE_MV) || b2TrendCharging;

      if (evidence) {
        b2ClearCount = 0;
        if (b2SetCount < B2_CHARGE_SET_CYCLES)  b2SetCount++;
        if (b2SetCount >= B2_CHARGE_SET_CYCLES) b2ChargingFlag = true;
      } else {
        b2SetCount = 0;
        if (b2ClearCount < B2_CHARGE_CLEAR_CYCLES) b2ClearCount++;
        if (b2ClearCount >= B2_CHARGE_CLEAR_CYCLES) b2ChargingFlag = false;
      }
    }
  }

  bool b2Charging    = b2ChargingFlag;
  bool b2Discharging = b2Present && !b2Charging;

  // --- Power draw and runtime estimation ---
  // inputVoltage (mV) × inputCurrent (mA) / 1,000,000 = Watts
  iB2PowerDrawW  = (inputVoltage > 0 && inputCurrent > 0)
                 ? (uint16_t)((uint32_t)inputVoltage * inputCurrent / 1000000UL)
                 : 0;

  // Runtime: remaining capacity at current draw rate
  // B2_PACK_CAPACITY_MAH × iB2Remaining% / 100 = remaining mAh
  // remaining mAh / inputCurrent mA × 60 = minutes
  if (inputCurrent > 0 && iB2Remaining > 0) {
    iB2RuntimeMins = (uint16_t)(
      (uint32_t)B2_PACK_CAPACITY_MAH * iB2Remaining * 60UL / 100 / inputCurrent
    );
  } else {
    iB2RuntimeMins = 0;
  }

  // 5-minute rolling average of input current
  static uint32_t b2CurrentSum  = 0;
  static uint8_t  b2EnergyTimer = 0;
  b2CurrentSum += inputCurrent;
  b2EnergyTimer++;
  if (b2EnergyTimer >= B2_ENERGY_WINDOW_CYCLES) {
    iB2AvgCurrentMA = (uint16_t)(b2CurrentSum / B2_ENERGY_WINDOW_CYCLES);
    b2CurrentSum    = 0;
    b2EnergyTimer   = 0;
  }

  // --- Build B2 status byte ---
  iB2PresentStatus = 0;
  if (b2Charging)    bitSet(iB2PresentStatus, B2STATUS_CHARGING);
  if (b2Discharging) bitSet(iB2PresentStatus, B2STATUS_DISCHARGING);
  if (b2Present)     bitSet(iB2PresentStatus, B2STATUS_PRESENT);
  if (b2Present)     bitSet(iB2PresentStatus, B2STATUS_BATTPRESENT);

  // Serial output handled in the .ino summary block every loop cycle
}

// ============================================================
// EEPROM: boot tracking and clean-shutdown detection
// ============================================================
void initEEPROM(void) {
  // Increment boot counter
  uint16_t bootCount = 0;
  EEPROM.get(EEPROM_BOOT_COUNT_ADDR, bootCount);
  bootCount++;
  EEPROM.put(EEPROM_BOOT_COUNT_ADDR, bootCount);

  // Report last shutdown type and boot count to serial
  byte lastShutdown = EEPROM.read(EEPROM_CLEAN_SHUTDOWN_ADDR);
  Serial.print(F("Boot #")); Serial.println(bootCount);
  if (lastShutdown == EEPROM_CLEAN_FLAG) {
    Serial.println(F("Last shutdown: CLEAN"));
  } else {
    Serial.println(F("Last shutdown: POWER LOSS or unexpected"));
  }

  uint16_t upsKickIns = 0;
  EEPROM.get(EEPROM_UPS_KICKIN_ADDR, upsKickIns);
  Serial.print(F("UPS kick-in count: ")); Serial.println(upsKickIns);

  // Clear the clean-shutdown flag — it will be re-set only when HID shutdown is requested
  EEPROM.write(EEPROM_CLEAN_SHUTDOWN_ADDR, 0x00);
}
