/**
 * plugin.ts — Entry point
 *
 * Registers all six actions, starts the Arduino serial reader, and
 * connects to the Stream Deck software.
 */

import streamDeck from "@elgato/streamdeck";
import { serialReader } from "./serial-reader";
import { BatteryStatus } from "./actions/battery";
import { PowerRuntime }  from "./actions/power";
import { NetworkToggle } from "./actions/network";
import { UpsEvents }     from "./actions/events";
import { SystemControl } from "./actions/system";
import { Diagnostics }   from "./actions/diagnostics";

// Start watching the Arduino serial port
serialReader.start();

// Register actions with the Stream Deck SDK
streamDeck.actions.registerAction(new BatteryStatus());
streamDeck.actions.registerAction(new PowerRuntime());
streamDeck.actions.registerAction(new NetworkToggle());
streamDeck.actions.registerAction(new UpsEvents());
streamDeck.actions.registerAction(new SystemControl());
streamDeck.actions.registerAction(new Diagnostics());

// Connect to the Stream Deck software
streamDeck.connect();
