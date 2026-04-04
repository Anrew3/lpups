/** Shared type definitions — used by both main and renderer (via IPC). */

export interface B1Data {
  voltage:     number;   // mV
  capacity:    number;   // %
  current:     number;   // mA (negative = discharging)
  acPresent:   boolean;
  charging:    boolean;
  temperature: number;   // °C
}

export interface B2Data {
  present:     boolean;
  voltage:     number;   // mV
  current:     number;   // mA
  remaining:   number;   // %
  charging:    boolean;
  powerDrawW:  number;
  avgCurrentMA: number;
  runtimeMins: number;
}

export interface UPSData {
  connected:   boolean;
  timestamp:   number;   // Date.now()
  b1:          B1Data;
  b2:          B2Data;
  rawLines:    string[]; // last N raw lines for debug
}

export interface DiagCheck {
  status: "PASS" | "WARN" | "FAIL" | "RUNNING" | "PENDING";
  name:   string;
  detail: string;
}

export interface DiagResult {
  checks:    DiagCheck[];
  pass:      number;
  warn:      number;
  fail:      number;
  running:   boolean;
  startedAt: number;
}

export const defaultUPS: UPSData = {
  connected:  false,
  timestamp:  0,
  b1: {
    voltage:     0,
    capacity:    0,
    current:     0,
    acPresent:   false,
    charging:    false,
    temperature: 0,
  },
  b2: {
    present:     false,
    voltage:     0,
    current:     0,
    remaining:   0,
    charging:    false,
    powerDrawW:  0,
    avgCurrentMA: 0,
    runtimeMins: 0,
  },
  rawLines: [],
};
