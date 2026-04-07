#!/usr/bin/env node
/**
 * diagnose.js — Standalone diagnostic tool for the LPUPS Stream Deck plugin.
 *
 * Run directly with Node.js (no Stream Deck required):
 *   node scripts/diagnose.js
 *
 * Tests every component of the plugin pipeline:
 *   1. Node.js version
 *   2. PowerShell availability
 *   3. COM port detection
 *   4. Serial data reading (if COM port found)
 *   5. PNG render pipeline
 *   6. Plugin build output
 *   7. Stream Deck plugin directory
 */

const { execSync, spawn } = require("child_process");
const { existsSync, readdirSync, statSync, writeFileSync } = require("fs");
const { createInterface } = require("readline");
const path = require("path");
const zlib = require("zlib");
const os = require("os");

const PASS = "\x1b[32m[PASS]\x1b[0m";
const FAIL = "\x1b[31m[FAIL]\x1b[0m";
const WARN = "\x1b[33m[WARN]\x1b[0m";
const INFO = "\x1b[36m[INFO]\x1b[0m";

let passCount = 0, failCount = 0, warnCount = 0;

function pass(msg) { console.log(`  ${PASS} ${msg}`); passCount++; }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); failCount++; }
function warn(msg) { console.log(`  ${WARN} ${msg}`); warnCount++; }
function info(msg) { console.log(`  ${INFO} ${msg}`); }
function header(msg) { console.log(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`); }

// ─── 1. Node.js ──────────────────────────────────────────────────────────────
function testNode() {
  header("1. Node.js Environment");
  const ver = process.version;
  const major = parseInt(ver.slice(1));
  if (major >= 20) pass(`Node.js ${ver} (>= 20 required)`);
  else fail(`Node.js ${ver} — version 20+ required`);

  info(`Platform: ${os.platform()} ${os.arch()}`);
  info(`OS: ${os.type()} ${os.release()}`);
  info(`CWD: ${process.cwd()}`);

  // Check if zlib works
  try {
    const test = zlib.deflateSync(Buffer.from("test"));
    if (test.length > 0) pass("zlib deflate works");
    else fail("zlib deflate returned empty buffer");
  } catch (e) {
    fail(`zlib deflate failed: ${e.message}`);
  }
}

// ─── 2. PowerShell ───────────────────────────────────────────────────────────
function testPowerShell() {
  header("2. PowerShell Availability");

  try {
    const ver = execSync('powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', {
      timeout: 10000, encoding: "utf8"
    }).trim();
    pass(`PowerShell ${ver} found`);
  } catch (e) {
    fail(`powershell.exe not available: ${e.message}`);
    info("The plugin requires PowerShell to read serial ports and manage network.");
    return;
  }

  // Check execution policy
  try {
    const policy = execSync('powershell.exe -NoProfile -Command "Get-ExecutionPolicy"', {
      timeout: 5000, encoding: "utf8"
    }).trim();
    if (policy === "Restricted") {
      warn(`Execution policy is '${policy}' — scripts may be blocked`);
      info("Fix: Run as admin: Set-ExecutionPolicy RemoteSigned");
    } else {
      pass(`Execution policy: ${policy}`);
    }
  } catch (e) {
    warn(`Could not check execution policy: ${e.message}`);
  }
}

// ─── 3. COM Ports ────────────────────────────────────────────────────────────
function testComPorts() {
  header("3. COM Port Detection");

  if (os.platform() !== "win32") {
    warn("Not running on Windows — COM port detection skipped");
    info("This plugin is designed for Windows (LattePanda). COM port tests need Windows.");
    return null;
  }

  try {
    const raw = execSync(
      'powershell.exe -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match \'COM\\d+\' } | Select-Object Name, DeviceID, Status | ConvertTo-Json -Compress"',
      { timeout: 15000, encoding: "utf8" }
    ).trim();

    if (!raw || raw === "" || raw === "null") {
      fail("No COM ports found at all");
      info("Is the Arduino/DFRobot board connected via USB?");
      return null;
    }

    const devices = JSON.parse(raw.startsWith("[") ? raw : `[${raw}]`);
    info(`Found ${devices.length} COM port(s):`);

    let arduinoPort = null;
    for (const d of devices) {
      const name = d.Name || "Unknown";
      const status = d.Status || "Unknown";
      const portMatch = name.match(/\(COM(\d+)\)/);
      const portNum = portMatch ? `COM${portMatch[1]}` : "???";

      const isArduino = /arduino|dfrobot|ch340|cp210|lpups|usb.serial/i.test(name);
      if (isArduino) {
        pass(`${portNum}: ${name} [${status}] <-- LIKELY ARDUINO`);
        arduinoPort = portNum;
      } else {
        info(`${portNum}: ${name} [${status}]`);
      }
    }

    if (!arduinoPort) {
      warn("No Arduino/DFRobot device detected among COM ports");
      info("Expected device names: Arduino, DFRobot, CH340, CP210x");
      info("The serial-reader.ps1 script will try brute-force detection.");
      // Try to use the first available COM port
      const firstPort = devices[0]?.Name?.match(/\(COM(\d+)\)/);
      if (firstPort) {
        arduinoPort = `COM${firstPort[1]}`;
        info(`Will try ${arduinoPort} as fallback`);
      }
    }

    return arduinoPort;
  } catch (e) {
    fail(`COM port detection failed: ${e.message}`);
    return null;
  }
}

// ─── 4. Serial Reading ──────────────────────────────────────────────────────
function testSerial(comPort) {
  header("4. Serial Port Reading");

  if (!comPort) {
    warn("No COM port to test — skipping serial read");
    return Promise.resolve();
  }

  if (os.platform() !== "win32") {
    warn("Not on Windows — skipping serial test");
    return Promise.resolve();
  }

  info(`Attempting to read from ${comPort} at 115200 baud for 8 seconds...`);
  info("(If this hangs, the port may be locked by another process)");

  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-Command",
      `try {
        $port = New-Object System.IO.Ports.SerialPort '${comPort}', 115200, 'None', 8, 'One'
        $port.ReadTimeout = 5000
        $port.Open()
        Write-Output "PORT_OPENED"
        $deadline = (Get-Date).AddSeconds(6)
        while ((Get-Date) -lt $deadline) {
          try {
            $line = $port.ReadLine()
            Write-Output "DATA:$line"
          } catch [System.TimeoutException] {
            Write-Output "TIMEOUT"
          }
        }
        $port.Close()
        Write-Output "PORT_CLOSED"
      } catch {
        Write-Output "ERROR:$($_.Exception.Message)"
      }`
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let gotData = false;
    let lineCount = 0;
    const timeout = setTimeout(() => {
      warn("Serial test timed out after 10 seconds");
      ps.kill();
      resolve();
    }, 10000);

    const rl = createInterface({ input: ps.stdout });
    rl.on("line", (line) => {
      if (line === "PORT_OPENED") {
        pass(`${comPort} opened successfully at 115200 baud`);
      } else if (line.startsWith("DATA:")) {
        lineCount++;
        if (lineCount <= 5) info(`  Line ${lineCount}: ${line.slice(5).substring(0, 80)}`);
        gotData = true;
      } else if (line === "TIMEOUT") {
        warn(`${comPort} read timeout — no data received`);
      } else if (line.startsWith("ERROR:")) {
        fail(`${comPort} error: ${line.slice(6)}`);
      } else if (line === "PORT_CLOSED") {
        if (gotData) pass(`Received ${lineCount} lines of serial data`);
        else warn(`Port opened but no data received`);
      }
    });

    ps.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) warn(`PS stderr: ${msg}`);
    });

    ps.on("close", () => {
      clearTimeout(timeout);
      if (!gotData && lineCount === 0) {
        fail("No serial data received from Arduino");
        info("Check: Is the Arduino powered on? Is it running the LPUPS sketch?");
      }
      resolve();
    });

    ps.on("error", (err) => {
      clearTimeout(timeout);
      fail(`Failed to spawn PowerShell: ${err.message}`);
      resolve();
    });
  });
}

// ─── 5. PNG Render Pipeline ─────────────────────────────────────────────────
function testRender() {
  header("5. PNG Render Pipeline");

  // Minimal PNG generation test (same logic as render.ts)
  try {
    const S = 72;
    const px = new Uint8Array(S * S * 4);

    // Fill with green
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const off = (y * S + x) * 4;
      px[off] = 0x0d; px[off+1] = 0x6e; px[off+2] = 0x0d; px[off+3] = 255;
    }

    // Build PNG
    const CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[i] = c;
    }
    function crc32(buf) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function chunk(type, data) {
      const t = Buffer.from(type, "ascii");
      const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
      return Buffer.concat([l, t, data, c]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const rowLen = 1 + S * 4;
    const raw = Buffer.alloc(S * rowLen);
    for (let y = 0; y < S; y++) {
      raw[y * rowLen] = 0;
      for (let i = 0; i < S * 4; i++) raw[y * rowLen + 1 + i] = px[y * S * 4 + i];
    }
    const compressed = zlib.deflateSync(raw);
    const png = Buffer.concat([
      Buffer.from([137,80,78,71,13,10,26,10]),
      chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0)),
    ]);

    // Validate PNG signature
    if (png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71) {
      pass(`PNG generated: ${png.length} bytes (valid PNG signature)`);
    } else {
      fail("PNG has invalid signature");
    }

    // Test base64 encoding
    const dataUri = `data:image/png;base64,${png.toString("base64")}`;
    if (dataUri.startsWith("data:image/png;base64,iVBOR")) {
      pass(`Data URI: ${dataUri.length} chars (starts with iVBOR = valid)`);
    } else {
      fail(`Data URI looks wrong: ${dataUri.substring(0, 60)}...`);
    }

    // Write test PNG to temp
    const testPath = path.join(os.tmpdir(), "lpups-diag-test.png");
    writeFileSync(testPath, png);
    pass(`Test PNG written to: ${testPath}`);

  } catch (e) {
    fail(`PNG render failed: ${e.message}`);
  }
}

// ─── 6. Build Output ────────────────────────────────────────────────────────
function testBuild() {
  header("6. Plugin Build Output");

  const pluginRoot = path.resolve(__dirname, "..");
  const binPath = path.join(pluginRoot, "bin", "plugin.js");
  const nodeModules = path.join(pluginRoot, "node_modules");
  const scriptsDir = path.join(pluginRoot, "scripts");

  if (existsSync(nodeModules)) {
    const sdkPath = path.join(nodeModules, "@elgato", "streamdeck");
    if (existsSync(sdkPath)) pass("node_modules/@elgato/streamdeck exists");
    else fail("@elgato/streamdeck not found in node_modules — run: npm install");
  } else {
    fail("node_modules/ missing — run: npm install");
  }

  if (existsSync(binPath)) {
    const stat = statSync(binPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageMin = Math.round(ageMs / 60000);
    if (stat.size > 1000) {
      pass(`bin/plugin.js exists (${(stat.size/1024).toFixed(1)} KB, ${ageMin} min old)`);
    } else {
      fail(`bin/plugin.js exists but is suspiciously small (${stat.size} bytes)`);
    }

    // Check if source files are newer than build
    const srcDir = path.join(pluginRoot, "src");
    if (existsSync(srcDir)) {
      let newestSrc = 0;
      function scanDir(dir) {
        for (const f of readdirSync(dir)) {
          const fp = path.join(dir, f);
          const s = statSync(fp);
          if (s.isDirectory()) scanDir(fp);
          else if (fp.endsWith(".ts")) newestSrc = Math.max(newestSrc, s.mtimeMs);
        }
      }
      scanDir(srcDir);
      if (newestSrc > stat.mtimeMs) {
        fail("Source files are NEWER than bin/plugin.js — rebuild needed: npm run build");
      } else {
        pass("bin/plugin.js is up to date with source files");
      }
    }
  } else {
    fail("bin/plugin.js MISSING — run: npm run build");
  }

  // Check scripts
  for (const script of ["serial-reader.ps1", "network.ps1", "diagnostics.ps1"]) {
    const sp = path.join(scriptsDir, script);
    if (existsSync(sp)) pass(`scripts/${script} exists`);
    else fail(`scripts/${script} MISSING`);
  }
}

// ─── 7. Stream Deck Installation ────────────────────────────────────────────
function testStreamDeck() {
  header("7. Stream Deck Installation");

  if (os.platform() !== "win32") {
    warn("Not on Windows — Stream Deck installation check skipped");
    return;
  }

  const sdPlugins = path.join(process.env.APPDATA || "", "Elgato", "StreamDeck", "Plugins");
  const junctionPath = path.join(sdPlugins, "com.lpups.casepanel.sdPlugin");
  const pluginRoot = path.resolve(__dirname, "..");

  if (existsSync(sdPlugins)) {
    pass(`Stream Deck plugins dir exists: ${sdPlugins}`);
  } else {
    fail(`Plugins directory not found: ${sdPlugins}`);
    info("Is Stream Deck software installed?");
    return;
  }

  if (existsSync(junctionPath)) {
    // Check if it's a junction pointing to our plugin
    try {
      const target = execSync(`powershell.exe -NoProfile -Command "(Get-Item '${junctionPath}').Target"`, {
        timeout: 5000, encoding: "utf8"
      }).trim();
      if (target) {
        pass(`Plugin junction exists -> ${target}`);
        // Verify it points to the right place
        const resolvedTarget = path.resolve(target);
        const resolvedPlugin = path.resolve(pluginRoot);
        if (resolvedTarget.toLowerCase() === resolvedPlugin.toLowerCase()) {
          pass("Junction points to correct directory");
        } else {
          warn(`Junction points to: ${resolvedTarget}`);
          warn(`Expected: ${resolvedPlugin}`);
          info("The junction may point to a different copy of the plugin.");
        }
      } else {
        info(`Plugin directory exists at: ${junctionPath}`);
      }
    } catch {
      info(`Plugin directory exists at: ${junctionPath}`);
    }
  } else {
    fail("Plugin NOT installed in Stream Deck plugins directory");
    info(`Expected: ${junctionPath}`);
    info("Run setup.ps1 from the repo root (as admin) to create the junction.");
  }

  // Check if Stream Deck is running
  try {
    const procs = execSync('powershell.exe -NoProfile -Command "Get-Process StreamDeck -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json"', {
      timeout: 5000, encoding: "utf8"
    }).trim();
    if (procs && procs !== "" && procs !== "null") {
      pass("Stream Deck software is running");
    } else {
      warn("Stream Deck software is NOT running");
    }
  } catch {
    warn("Could not check if Stream Deck is running");
  }

  // Check for plugin log file
  const logDir = path.join(process.env.APPDATA || "", "Elgato", "StreamDeck", "logs");
  if (existsSync(logDir)) {
    const logFiles = readdirSync(logDir).filter(f => f.includes("com.lpups.casepanel"));
    if (logFiles.length > 0) {
      pass(`Plugin log file(s) found: ${logFiles.join(", ")}`);
      // Show last few lines
      const logPath = path.join(logDir, logFiles[logFiles.length - 1]);
      try {
        const tail = execSync(`powershell.exe -NoProfile -Command "Get-Content '${logPath}' -Tail 10"`, {
          timeout: 5000, encoding: "utf8"
        }).trim();
        if (tail) {
          info("Last 10 log lines:");
          for (const line of tail.split("\n")) {
            console.log(`    ${line.trim()}`);
          }
        }
      } catch { /* ignore */ }
    } else {
      warn("No plugin log files found — plugin may not have loaded yet");
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("  LPUPS Stream Deck Plugin — Diagnostic Report");
  console.log("  " + new Date().toISOString());
  console.log("=".repeat(60));

  testNode();
  testPowerShell();
  const comPort = testComPorts();
  await testSerial(comPort);
  testRender();
  testBuild();
  testStreamDeck();

  header("SUMMARY");
  console.log(`  ${PASS.replace("[PASS]", `${passCount} passed`)}`);
  if (warnCount > 0) console.log(`  ${WARN.replace("[WARN]", `${warnCount} warnings`)}`);
  if (failCount > 0) console.log(`  ${FAIL.replace("[FAIL]", `${failCount} FAILURES`)}`);

  if (failCount === 0) {
    console.log("\n  All tests passed! If the plugin still shows blank keys:");
    console.log("  1. Run: npm run build");
    console.log("  2. Restart Stream Deck");
    console.log("  3. Check the plugin log file for errors\n");
  } else {
    console.log("\n  Fix the failures above, then re-run: node scripts/diagnose.js\n");
  }
}

main().catch(e => {
  console.error(`\nDiagnostic crashed: ${e.message}\n${e.stack}`);
  process.exit(1);
});
