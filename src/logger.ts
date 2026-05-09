import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

const COLORS: Record<Level, string> = {
  DEBUG: "\x1b[2m",
  INFO: "\x1b[36m",
  WARN: "\x1b[33m",
  ERROR: "\x1b[31m",
};
const RESET = "\x1b[0m";

let logFilePath: string | null = null;

export function setLogFile(dir: string): void {
  mkdirSync(dir, { recursive: true });
  logFilePath = join(dir, "server.log");
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function format(level: Level, msg: string): string {
  return `[${timestamp()} ${level}] ${msg}`;
}

function log(level: Level, msg: string, ...args: unknown[]): void {
  const color = COLORS[level];
  const line = `${color}[${timestamp()} ${level}]${RESET} ${msg}`;
  if (level === "ERROR") {
    console.error(line, ...args);
  } else {
    console.log(line, ...args);
  }

  if (logFilePath) {
    try {
      appendFileSync(logFilePath, format(level, msg) + "\n");
    } catch (_) { /* best-effort */ }
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log("DEBUG", msg, ...args),
  info: (msg: string, ...args: unknown[]) => log("INFO", msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log("WARN", msg, ...args),
  error: (msg: string, ...args: unknown[]) => log("ERROR", msg, ...args),
};
