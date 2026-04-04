/*!
 * @file  threeBatteriesLPUPS.ino
 * @brief LPUPS reports battery information to the computer via USB-HID
 * @details Reads battery information from UPS via I2C, and reports this information to the computer via USB-HID
 * @copyright  Copyright (c) 2010 DFRobot Co.Ltd (http://www.dfrobot.com)
 * @license  The MIT License (MIT)
 * @author  [qsjhyy](yihuan.huang@dfrobot.com)
 * @version  V1.1
 * @date  2023-08-09
 * @url  https://github.com/DFRobot/DFRobot_LPUPS
 */
#include <DFRobot_LPUPS.h>
#include <HIDPowerDevice.h>
#include <EEPROM.h>
#include "upsDef.h"

DFRobot_LPUPS_I2C LPUPS(&Wire, /*I2CAddr*/ UPS_I2C_ADDRESS);

uint16_t iPreviousStatus = 0;
byte iRemaining = 0, iPrevRemaining = 100;
int iRes = 0;
uint16_t iPrevRunTimeToEmpty = 0;
int iIntTimer = 0;

// B2 previous state for change detection and UPS kick-in tracking
byte     iPrevB2Remaining     = 100;
byte     iPrevB2PresentStatus = 0;
bool     bPrevB2Present       = true;   // assume pack present at boot
bool     bUPSKickInLogged     = false;  // prevent multiple EEPROM writes per event


void setup(void)
{
  delay(5000);
  Serial.begin(115200);
  Serial.println(F("Serial Begin"));

  // EEPROM boot tracking (reports boot count and last shutdown type to serial)
  initEEPROM();

  // Init the sensor
  while (NO_ERR != LPUPS.begin(THREE_BATTERIES_UPS_PID)) {
    Serial.println(F("Communication with device failed, please check connection"));
    delay(3000);
  }
  Serial.println(F("Begin ok!"));

  // Initialize UPS indicator LEDs
  pinMode(UPS_GREEN_LED, OUTPUT);
  pinMode(UPS_RED_LED, OUTPUT);
  pinMode(UPS_BLUE_LED, OUTPUT);

  // Initialize HIDPowerDevice (B1 + B2 both in same descriptor)
  initPowerDevice();

  // Register B2 features so Windows knows about second battery on enumeration
  PowerDevice.setFeature(HID_B2_REMAININGCAPACITY, &iB2Remaining, sizeof(iB2Remaining));
  PowerDevice.setFeature(HID_B2_PRESENTSTATUS,     &iB2PresentStatus, sizeof(iB2PresentStatus));
}


void loop()
{
  /************ Get charge chip data and print ****************************/
  /**
   * Get chip data
   * regBuf - data buffer for storing data
   */
  LPUPS.getChipData(regBuf);
  printChargeData();   // calculates inputVoltage, batteryVoltage, chargeCurrent, etc.
  updateB2();          // calculates iB2Remaining, iB2PresentStatus from inputVoltage

  /*********** Unit of measurement, measurement unit ****************************/
  /**
   * Battery voltage range: 9.2V ~ 12.6V, in order to keep the battery stable at extreme values:
   * Assuming the battery voltage range is 9.3V ~ 12.5V, corresponding to battery capacity 0 ~ 100.
   * Note: You can adjust the battery capacity more accurately by correcting the voltage mutation with dischargeCurrent if interested.
   */
  if (batteryVoltage > MIN_BATTERY_VOLTAGE) {
    iRemaining = (((float)batteryVoltage - MIN_BATTERY_VOLTAGE) / (MAX_BATTERY_VOLTAGE - MIN_BATTERY_VOLTAGE)) * 100;
  } else {
    Serial.println(F("The battery voltage is lower than normal !!!"));   // Battery voltage lower than normal value.
  }

  if (100 < iRemaining) {
    iRemaining = 100;
  }

  // Please ensure to use the dedicated charger for LattePanda and connect it to the UPS (connect it to LP). 
  if (chargerStatus1.ac_stat) {   // check if there is charging current.
    bACPresent = true;
    if (64 < chargeCurrent) {   // Check if there is charging current. Due to precision issues, current less than 64 is considered as fully charged.
      bCharging = true;
    } else {
      bCharging = false;
    }
    bDischarging = false;
  } else {
    if (iPrevRemaining < iRemaining) {
      if (3 >= (iRemaining - iPrevRemaining))
        iRemaining = iPrevRemaining;
    }

    bACPresent = false;
    bCharging = false;
    if (dischargeCurrent) {   // Check if there is discharging current.
      bDischarging = true;
    } else {
      bDischarging = false;
    }
  }

  iRunTimeToEmpty = (float)iAvgTimeToEmpty * iRemaining / 100;

  // ---- Read B2 present state (updateB2 already ran above) ----
  bool bB2Present = bitRead(iB2PresentStatus, B2STATUS_BATTPRESENT);

  // ---- LED control ----
  // UPS-only mode (12V pack absent): both LEDs blink together at 2s rate
  //   so it is visually distinct from all normal capacity states:
  //     <=25%  → red only
  //     25-74% → both steady
  //     >=75%  → green only
  //   UPS-only → both blink together
  static bool bUPSModeLedState = false;
  if (!bB2Present) {
    bUPSModeLedState = !bUPSModeLedState;
    digitalWrite(UPS_GREEN_LED, bUPSModeLedState ? LOW : HIGH);
    digitalWrite(UPS_RED_LED,   bUPSModeLedState ? LOW : HIGH);
  } else {
    // Original DFRobot capacity-based LED logic
    digitalWrite(UPS_GREEN_LED, LOW);
    digitalWrite(UPS_RED_LED,   LOW);
    if (iRemaining <= 25) {
      digitalWrite(UPS_GREEN_LED, HIGH);   // red only
    } else if (iRemaining >= 75) {
      digitalWrite(UPS_RED_LED,   HIGH);   // green only
    }
    // 25-74%: both LEDs on — no change needed
  }

  // ---- 12V pack loss detection with 3-cycle debounce ----
  // Requires 3 consecutive absent readings (~9 seconds) before logging a kick-in.
  // Prevents the EEPROM counter incrementing multiple times if voltage bounces
  // near the BMS cutoff threshold.
  static byte b2AbsentCount = 0;
  if (!bB2Present) {
    if (b2AbsentCount < 3) b2AbsentCount++;
  } else {
    b2AbsentCount    = 0;
    bUPSKickInLogged = false;  // ready to count next event when pack returns
  }
  bPrevB2Present = bB2Present;

  if (b2AbsentCount >= 3 && !bUPSKickInLogged) {
    uint16_t kickIns = 0;
    EEPROM.get(EEPROM_UPS_KICKIN_ADDR, kickIns);
    kickIns++;
    EEPROM.put(EEPROM_UPS_KICKIN_ADDR, kickIns);
    bUPSKickInLogged = true;
    Serial.print(F("!!! 12V PACK LOST - UPS KICK-IN #")); Serial.println(kickIns);
  }

  // ---- Shutdown decision: UPS only + 12V gone + 18650s below 20% ----
  // Set iDelayBe4ShutDown so flashReportedData() correctly propagates
  // SHUTDOWNREQ → SHUTDOWNIMNT.  Direct bitSet(SHUTDOWNIMNT) was previously
  // cleared every loop by flashReportedData() before Windows ever saw it.
  if (!bB2Present && iRemaining < 20) {
    if (iDelayBe4ShutDown < 0) {   // only set once — don't keep overwriting
      iDelayBe4ShutDown = 30;
      Serial.println(F("!!! SHUTDOWN TRIGGERED - UPS critical, 12V pack absent"));
    }
  }

  // Refresh B1 HID status bits (sets SHUTDOWNREQ/SHUTDOWNIMNT from iDelayBe4ShutDown)
  flashReportedData();

  // ---- EEPROM clean-shutdown flag ----
  // Written after flashReportedData() so SHUTDOWNREQ is already set in iPresentStatus.
  // Catches both our UPS-triggered shutdown AND Windows writing DelayBeforeShutdown.
  if (bitRead(iPresentStatus, PRESENTSTATUS_SHUTDOWNREQ)) {
    EEPROM.write(EEPROM_CLEAN_SHUTDOWN_ADDR, EEPROM_CLEAN_FLAG);
  }

  /************ Delay ***************************************/
  delay(1500);
  iIntTimer++;
  digitalWrite(UPS_BLUE_LED, LOW);   // blue LED on
  delay(1500);
  iIntTimer++;
  digitalWrite(UPS_BLUE_LED, HIGH);  // blue LED off

  /************ 批量发送或中断 ***********************/
  bool bB2Changed = (iB2Remaining != iPrevB2Remaining) || (iB2PresentStatus != iPrevB2PresentStatus);

  if ((iPresentStatus != iPreviousStatus) || (iRemaining != iPrevRemaining) ||
    (iRunTimeToEmpty != iPrevRunTimeToEmpty) || bB2Changed || (iIntTimer > MIN_UPDATE_INTERVAL)) {

    // Battery 1 (18650 UPS) reports
    PowerDevice.sendReport(HID_PD_REMAININGCAPACITY, &iRemaining, sizeof(iRemaining));
    if (bDischarging) PowerDevice.sendReport(HID_PD_RUNTIMETOEMPTY, &iRunTimeToEmpty, sizeof(iRunTimeToEmpty));
    iRes = PowerDevice.sendReport(HID_PD_PRESENTSTATUS, &iPresentStatus, sizeof(iPresentStatus));

    // Battery 2 (12V LiON external pack) reports
    PowerDevice.sendReport(HID_B2_REMAININGCAPACITY, &iB2Remaining, sizeof(iB2Remaining));
    PowerDevice.sendReport(HID_B2_PRESENTSTATUS, &iB2PresentStatus, sizeof(iB2PresentStatus));

    if (iRes < 0) {
      pinMode(UPS_BLUE_LED, INPUT);
    } else {
      pinMode(UPS_BLUE_LED, OUTPUT);
    }

    iIntTimer = 0;
    iPreviousStatus = iPresentStatus;
    iPrevRemaining = iRemaining;
    iPrevRunTimeToEmpty = iRunTimeToEmpty;
    iPrevB2Remaining = iB2Remaining;
    iPrevB2PresentStatus = iB2PresentStatus;
  }

  /************ Serial print reported battery level and operation result ******************/
  Serial.println(F("--- B1 (18650 UPS) ---"));
  Serial.print(F("  capacity    = ")); Serial.print(iRemaining);       Serial.println(F(" %"));
  Serial.print(F("  runtime     = ")); Serial.print(iRunTimeToEmpty);  Serial.println(F(" s"));
  Serial.print(F("  charging    = ")); Serial.println(bCharging    ? F("YES") : F("NO"));
  Serial.print(F("  AC present  = ")); Serial.println(bACPresent   ? F("YES") : F("NO"));
  Serial.println(F("--- B2 (12V LiON pack) ---"));
  Serial.print(F("  voltage     = ")); Serial.print(inputVoltage);     Serial.println(F(" mV"));
  Serial.print(F("  capacity    = ")); Serial.print(iB2Remaining);     Serial.println(F(" %"));
  Serial.print(F("  present     = ")); Serial.println(bitRead(iB2PresentStatus, B2STATUS_BATTPRESENT) ? F("YES") : F("NO"));
  Serial.print(F("  charging    = ")); Serial.println(bitRead(iB2PresentStatus, B2STATUS_CHARGING)    ? F("YES") : F("NO"));
  Serial.print(F("  draw        = ")); Serial.print(iB2PowerDrawW);    Serial.println(F(" W"));
  Serial.print(F("  avg current = ")); Serial.print(iB2AvgCurrentMA);  Serial.println(F(" mA (5min)"));
  Serial.print(F("  runtime     = "));
  if (iB2RuntimeMins > 0) { Serial.print(iB2RuntimeMins); Serial.println(F(" min")); }
  else                     { Serial.println(F("--")); }
  // B2 state summary
  if (!bitRead(iB2PresentStatus, B2STATUS_BATTPRESENT)) {
    Serial.println(F("  state       = ABSENT"));
  } else if (bitRead(iB2PresentStatus, B2STATUS_CHARGING)) {
    Serial.println(F("  state       = CHARGING"));
  } else if (iB2Remaining >= 50) {
    Serial.println(F("  state       = GOOD"));
  } else if (iB2Remaining >= 20) {
    Serial.println(F("  state       = LOW"));
  } else {
    Serial.println(F("  state       = CRITICAL"));
  }
  Serial.print(F("  HID result  = ")); Serial.println(iRes);
  Serial.println();
}

