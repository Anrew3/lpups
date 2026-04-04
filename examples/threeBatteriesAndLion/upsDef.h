
#ifndef __LPUPS_DEF_H__
#define __LPUPS_DEF_H__

#include <Arduino.h>
#include <EEPROM.h>

/**
 * Battery voltage range: 9.2V ~ 12.6V, in order to keep the battery stable at extreme values:
 * Assuming the battery voltage range is 9.3V ~ 12.5V, corresponding to battery capacity 0 ~ 100.
 * Note: You can adjust the battery capacity more accurately by correcting the voltage mutation with dischargeCurrent if interested.
 */
#define MIN_BATTERY_VOLTAGE   9300   // Lower battery voltage limit
#define MAX_BATTERY_VOLTAGE   12500   // Upper battery voltage limit

#define UPS_GREEN_LED   9    // Battery level indicator LED, green
#define UPS_RED_LED     10   // Battery level indicator LED, red
#define UPS_BLUE_LED    13   // Output refresh every 1 second, indicates Arduino cycle is running, blue

// ---- External 12V LiON pack voltage thresholds (3S LiON) ----
#define B2_VOLTAGE_MAX_MV          12600  // 100% — fully charged
#define B2_VOLTAGE_MIN_MV           9000  // 0%  — BMS cutoff floor
#define B2_VOLTAGE_LOW_MV          10500  // Warn: getting low
#define B2_VOLTAGE_CRIT_MV          9800  // Critical: BMS cutoff imminent
// Charging detection — three complementary methods:
//
// Spike path (instant): a large voltage jump in a single cycle means the charger
// was physically connected/disconnected.  512mV in 3s is impossible organically.
#define B2_SPIKE_MV                   512  // instantaneous delta threshold for plug/unplug event
//
// Fast path (CV phase): charger rated at 12.6V actively holds the terminal
// at 12.6V against load.  Under load alone the pack sags ~0.5V below full,
// so >=12480mV is a strong signature that the charger is connected.
// ADC nearest step below 12600mV: 3200 + 145*64 = 12480.
#define B2_CHARGE_VOLTAGE_MV        12480  // "charger is holding voltage up" threshold
#define B2_CHARGE_SET_CYCLES            2  // consecutive readings above to SET flag  (~6s)
#define B2_CHARGE_CLEAR_CYCLES          3  // consecutive readings below to CLEAR flag (~9s)
//
// Slow path (CC phase): pack below ~85%, charger pushes voltage up slowly.
// Compare now vs. 2-minute-old snapshot; one ADC step (64mV) rise = confirmed.
#define B2_CHARGE_WINDOW_CYCLES        40  // 40 × 3s = 2-minute comparison window
#define B2_CHARGE_RISE_MV              64  // minimum voltage rise over window to confirm charging
//
// Load-drop false-positive suppression.
// If voltage rises but input current drops by this much in the same window,
// it is a load reduction (less sag), NOT the charger connecting.
// 200 mA = 4 ADC steps at 50mA/LSB — safe margin above noise.
#define B2_LOAD_DROP_MA               200
//
// Runtime estimation — set this to your actual pack capacity in mAh.
// Used with inputCurrent (IIN register) to estimate minutes remaining.
#define B2_PACK_CAPACITY_MAH        10000  // *** adjust to your pack ***
//
// Power / energy tracking window
#define B2_ENERGY_WINDOW_CYCLES       100  // 100 × 3s = 5-minute average window

// ---- EEPROM layout ----
#define EEPROM_CLEAN_SHUTDOWN_ADDR   0  // byte:  0xAA = clean, else power loss
#define EEPROM_BOOT_COUNT_ADDR       1  // uint16_t: total boot count
#define EEPROM_UPS_KICKIN_ADDR       3  // uint16_t: times UPS kicked in for 12V loss
#define EEPROM_CLEAN_FLAG            0xAA

#define MIN_UPDATE_INTERVAL   26 // Minimum update interval for USB-HID

#define DATA_LEN_MAX   0x24U
extern uint8_t regBuf[DATA_LEN_MAX];

extern DFRobot_LPUPS_I2C::sChargerStatus1_t chargerStatus1;

extern uint16_t dischargeCurrent, chargeCurrent;
extern uint16_t inputVoltage, inputCurrent;
extern uint16_t batteryVoltage, maxChargeVoltage;

// Battery 2 (12V LiON external pack)
extern byte     iB2Remaining;
extern byte     iB2PresentStatus;
extern uint16_t iB2PowerDrawW;     // instantaneous power draw in Watts
extern uint16_t iB2RuntimeMins;    // estimated minutes remaining at current draw
extern uint16_t iB2AvgCurrentMA;   // average input current over last 5-min window
extern byte iRemaining;
extern bool bCharging, bACPresent, bDischarging; // Whether charging, AC power present, discharging

extern uint16_t iRunTimeToEmpty, iAvgTimeToEmpty;   // 12
extern int16_t  iDelayBe4ShutDown;

extern uint16_t iPresentStatus;   // Now and previous device status.

void initPowerDevice(void);
void printChargeData(void);
void flashReportedData(void);
void updateB2(void);
void initEEPROM(void);

#endif /* __LPUPS_DEF_H__ */
