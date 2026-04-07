/**
 * plugin.ts — Entry point for the LPUPS Case Panel Stream Deck plugin.
 *
 * Follows the Elgato SDK pattern:
 *   1. Set log level
 *   2. Register all actions
 *   3. Connect to Stream Deck
 *   4. Start plugin-specific services
 */

import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { serialReader } from "./serial-reader";
import { BatteryStatus } from "./actions/battery";
import { PowerRuntime }  from "./actions/power";
import { NetworkToggle } from "./actions/network";
import { UpsEvents }     from "./actions/events";
import { SystemControl } from "./actions/system";
import { Diagnostics }   from "./actions/diagnostics";

// ── Logging ──────────────────────────────────────────────────────────────────
// Writes to %APPDATA%\Elgato\StreamDeck\logs\com.lpups.casepanel.log
streamDeck.logger.setLevel(LogLevel.DEBUG);

// ── Register actions (must happen before connect) ────────────────────────────
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.actions.registerAction(new PowerRuntime());
streamDeck.actions.registerAction(new NetworkToggle());
streamDeck.actions.registerAction(new UpsEvents());
streamDeck.actions.registerAction(new SystemControl());
streamDeck.actions.registerAction(new Diagnostics());

// ── Connect to Stream Deck ───────────────────────────────────────────────────
streamDeck.connect();

// ── Start serial reader (Arduino UPS telemetry) ──────────────────────────────
serialReader.start();

serialReader.on("stderr", (msg: string) => streamDeck.logger.warn(`[serial stderr] ${msg}`));
serialReader.on("error",  (msg: string) => streamDeck.logger.error(`[serial] ${msg}`));

// ── Process cleanup (prevent orphaned PowerShell process) ────────────────────
const cleanup = () => { serialReader.stop(); process.exit(0); };
process.on("SIGTERM", cleanup);
process.on("SIGINT",  cleanup);
