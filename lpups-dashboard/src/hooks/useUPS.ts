/**
 * useUPS — subscribes to IPC events from the Electron main process
 * and returns a live UPSData snapshot.
 */

import { useState, useEffect } from "react";
import type { UPSData } from "../../electron/types";

// defaultUPS mirrored here so renderer doesn't import from electron/
const defaultUPS: UPSData = {
  connected: false,
  timestamp: 0,
  b1: { voltage: 0, capacity: 0, current: 0, acPresent: false, charging: false, temperature: 0 },
  b2: { present: false, voltage: 0, current: 0, remaining: 0, charging: false,
        powerDrawW: 0, avgCurrentMA: 0, runtimeMins: 0 },
  rawLines: [],
};

export function useUPS(): { data: UPSData; events: string[] } {
  const [data,   setData]   = useState<UPSData>(defaultUPS);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    // Fetch current state immediately
    window.lpups.getState().then(setData).catch(() => {});

    const unsubData    = window.lpups.onData((d) => setData(d));
    const unsubConnect = window.lpups.onConnect(() =>
      setData((prev) => ({ ...prev, connected: true })));
    const unsubDisc    = window.lpups.onDisconnect(() =>
      setData((prev) => ({ ...prev, connected: false })));
    const unsubEvent   = window.lpups.onEvent((msg) =>
      setEvents((prev) => [msg, ...prev].slice(0, 50)));

    return () => {
      unsubData();
      unsubConnect();
      unsubDisc();
      unsubEvent();
    };
  }, []);

  return { data, events };
}
