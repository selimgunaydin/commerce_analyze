import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { getEnv } from "@/src/lib/config/env";
import { normalizeLighthouseReport, technicalAuditError, type LighthouseSummary, type TechnicalAuditError } from "./technical-audit-normalizer";

export type LighthouseAuditResult = LighthouseSummary | TechnicalAuditError;

export async function runLighthouseAudit(url: string): Promise<LighthouseAuditResult> {
  try {
    const stdout = await runLighthouseCli(url, getEnv().LIGHTHOUSE_TIMEOUT_MS);
    return normalizeLighthouseReport(JSON.parse(stdout));
  } catch (error) {
    return technicalAuditError("lighthouse", error);
  }
}

function runLighthouseCli(url: string, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(getLighthouseBinPath(), getLighthouseArgs(url), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CHROME_PATH: chromium.executablePath()
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Lighthouse timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);

      const stdout = Buffer.concat(chunks).toString("utf8").trim();
      const stderr = Buffer.concat(errorChunks).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(stderr || `Lighthouse exited with code ${code}.`));
        return;
      }

      if (!stdout) {
        reject(new Error("Lighthouse did not return JSON output."));
        return;
      }

      resolve(stdout);
    });
  });
}

function getLighthouseArgs(url: string) {
  return [
    url,
    "--quiet",
    "--output=json",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--form-factor=mobile",
    "--screenEmulation.mobile=true",
    "--screenEmulation.width=390",
    "--screenEmulation.height=844",
    "--screenEmulation.deviceScaleFactor=2",
    "--throttling-method=provided",
    "--chrome-flags=--headless=new --disable-gpu --no-sandbox"
  ];
}

function getLighthouseBinPath() {
  const binaryName = process.platform === "win32" ? "lighthouse.cmd" : "lighthouse";
  return path.join(process.cwd(), "node_modules", ".bin", binaryName);
}
