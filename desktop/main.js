import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";

let apiProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 640
  });

  win.loadURL(process.env.FRONTEND_URL || "http://127.0.0.1:5173");
}

app.whenReady().then(() => {
  apiProcess = spawn(process.execPath, ["../core/src/index.js"], {
    env: { ...process.env, PORT: "4000" },
    stdio: "inherit"
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (apiProcess) apiProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
