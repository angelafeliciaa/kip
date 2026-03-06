import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export function readEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  return dotenv.parse(content);
}

export interface WriteEnvResult {
  written: string[];
  skipped: string[];
}

export function writeEnv(
  filePath: string,
  vars: Record<string, string>,
  opts?: { force?: boolean }
): WriteEnvResult {
  const existing = readEnv(filePath);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const key of Object.keys(vars)) {
    if (key in existing && !opts?.force) {
      skipped.push(key);
    } else {
      existing[key] = vars[key];
      written.push(key);
    }
  }

  const lines = Object.entries(existing).map(
    ([key, value]) => `${key}=${JSON.stringify(value)}`
  );
  const content = lines.join("\n") + "\n";

  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);

  return { written, skipped };
}

export function ensureGitignore(dir: string): void {
  const gitignorePath = path.join(dir, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n").map((l) => l.trim());
    if (lines.includes(".env")) return;
  }

  fs.appendFileSync(gitignorePath, "\n.env\n");
  console.warn("WARNING: Added .env to .gitignore in", dir);
}

export function maskKey(key: string): string {
  if (key.length <= 10) return key;
  const first = key.slice(0, 6);
  const last = key.slice(-4);
  return `${first}...${last}`;
}
