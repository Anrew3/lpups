import type { UPSData, DiagResult } from "../electron/types";

declare global {
  interface Window {
    lpups: {
      onData(cb: (data: UPSData) => void):            () => void;
      onEvent(cb: (msg: string) => void):             () => void;
      onConnect(cb: (port: string) => void):          () => void;
      onDisconnect(cb: () => void):                   () => void;
      getState():                                     Promise<UPSData>;
      getNetwork():                                   Promise<"WIFI" | "CELLULAR" | "ERROR">;
      setNetwork(mode: "wifi" | "cellular"):          Promise<"WIFI" | "CELLULAR" | "ERROR">;
      onDiagCheck(cb: (c: { status: string; name: string; detail: string }) => void): () => void;
      onDiagDone(cb: (r: DiagResult) => void):        () => void;
      runDiagnostics():                               void;
      shutdown():                                     void;
      restart():                                      void;
      showWindow():                                   void;
      hideWindow():                                   void;
    };
  }
}

export {};
