/**
 * plugin.ts — Entry point
 * Registers all six actions, starts the serial reader, and connects.
 */

import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { serialReader } from "./serial-reader";
import { BatteryStatus } from "./actions/battery";
import { PowerRuntime }  from "./actions/power";
import { NetworkToggle } from "./actions/network";
import { UpsEvents }     from "./actions/events";
import { SystemControl } from "./actions/system";
import { Diagnostics }   from "./actions/diagnostics";

// Write trace-level logs to %APPDATA%\Elgato\StreamDeck\logs\com.lpups.casepanel.log
streamDeck.logger.setLevel(LogLevel.TRACE);

// Start reading the Arduino serial port
serialReader.start();

// Log serial reader errors and stderr
serialReader.on("stderr", (msg: string) => streamDeck.logger.warn(`[serial stderr] ${msg}`));
serialReader.on("error",  (msg: string) => streamDeck.logger.error(`[serial] ${msg}`));

// Clean up on exit so the PowerShell process doesn't orphan
const cleanup = () => { serialReader.stop(); process.exit(0); };
process.on("SIGTERM", cleanup);
process.on("SIGINT",  cleanup);

// Register actions
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.actions.registerAction(new PowerRuntime());
streamDeck.actions.registerAction(new NetworkToggle());
streamDeck.actions.registerAction(new UpsEvents());
streamDeck.actions.registerAction(new SystemControl());
streamDeck.actions.registerAction(new Diagnostics());

// Connect to Stream Deck software
streamDeck.connect();
