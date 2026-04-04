/**
 * tray.ts — System tray icon and menu.
 * Keeps the app alive in the background when the window is closed.
 */

import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import * as path from "path";

export function setupTray(getWin: () => BrowserWindow | null): Tray {
  // Icon: packaged → resources/tray-icon.png, dev → resources/tray-icon.png from app root
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "tray-icon.png")
    : path.join(app.getAppPath(), "resources", "tray-icon.png");

  let icon = nativeImage.createEmpty();
  try { icon = nativeImage.createFromPath(iconPath); } catch {}

  const tray = new Tray(icon);
  tray.setToolTip("LPUPS Dashboard");

  function buildMenu(): Menu {
    const loginEnabled = app.getLoginItemSettings().openAtLogin;
    return Menu.buildFromTemplate([
      {
        label: "Show Dashboard",
        click: () => { const w = getWin(); w?.show(); w?.focus(); },
      },
      { type: "separator" },
      {
        label:   "Open at Login",
        type:    "checkbox",
        checked: loginEnabled,
        click:   () => {
          app.setLoginItemSettings({ openAtLogin: !loginEnabled });
          tray.setContextMenu(buildMenu());
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => { app.quit(); },
      },
    ]);
  }

  tray.setContextMenu(buildMenu());
  tray.on("double-click", () => { const w = getWin(); w?.show(); w?.focus(); });

  return tray;
}
