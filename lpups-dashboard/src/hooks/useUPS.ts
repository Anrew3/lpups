import { useState, useEffect } from "react";
import type { UPSData } from "../../electron/types";

const defaultUPS: UPSData = {
  connected: false, timestamp: 0,
  b1: { voltage: 0, capacity: 0, current: 0, acPresent: false, charging: false, temperature: 0 },
  b2: { present: false, voltage: 0, current: 0, remaining: 0, charging: false,
        powerDrawW: 0, avgCurrentMA: 0, runtimeMins: 0 },
  rawLines: [],
};

export function useUPS(): { data: UPSData; events: string[]; powerHistory: number[] } {
  const [data,         setData]         = useState<UPSData>(defaultUPS);
  const [events,       setEvents]       = useState<string[]>([]);
  const [powerHistory, setPowerHistory] = useState<number[]>([]);

  useEffect(() => {
    window.lpups.getState().then(setData).catch(() => {});

    const unsubData = window.lpups.onData((d) => {
      setData(d);
      if (d.b2.present) {
        setPowerHistory((prev) => [...prev.slice(-59), d.b2.powerDrawW]);
      }
    });
    const unsubConnect    = window.lpups.onConnect(()    => setData((p) => ({ ...p, connected: true })));
    const unsubDisconnect = window.lpups.onDisconnect(() => setData((p) => ({ ...p, connected: false })));
    const unsubEvent      = window.lpups.onEvent((msg)   => setEvents((p) => [msg, ...p].slice(0, 60)));

    return () => {
      unsubData(); unsubConnect(); unsubDisconnect(); unsubEvent();
    };
  }, []);

  return { data, events, powerHistory };
}
