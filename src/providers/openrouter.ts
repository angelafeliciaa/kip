import { execFileSync } from "child_process";
import path from "path";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

const openrouterProvider: Provider = {
  name: "openrouter",
  requiredCredentials: ["OPENROUTER_API_KEY"],

  detect(env: Record<string, string>): boolean {
    return !!env["OPENROUTER_API_KEY"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const key = env["OPENROUTER_API_KEY"];
    if (!key) return false;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    _context: BrowserContext,
    _opts: ProviderOpts
  ): Promise<ProvisionResult> {
    // Use the Python browser-use script which handles Cloudflare CAPTCHA
    // via system Chrome profile
    // Resolve paths relative to project root (dist/providers/ -> ../../)
    const projectRoot = path.resolve(__dirname, "../..");
    const scriptPath = path.join(projectRoot, "openrouter_agent.py");
    const pythonPath = path.join(projectRoot, ".venv/bin/python3");

    console.log("[openrouter] Running browser-use agent (Python)...");
    console.log("[openrouter] This will open Chrome — do NOT close it.");

    try {
      const output = execFileSync(pythonPath, [scriptPath], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5 * 60 * 1000, // 5 minutes
        env: { ...process.env, AUTOPROVISION_STANDALONE: "0" },
      });

      // Extract the API key from script output
      const keyMatch = output.match(/sk-or-[\w-]+/);
      if (!keyMatch) {
        console.error("[openrouter] Script output:", output.slice(-500));
        throw new Error("Python script completed but no API key found in output.");
      }

      const apiKey = keyMatch[0];
      console.log(`[openrouter] Got key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);

      return {
        vars: { OPENROUTER_API_KEY: apiKey },
      };
    } catch (err: any) {
      // execSync throws on non-zero exit — include stderr
      const stderr = err.stderr?.toString() || "";
      const stdout = err.stdout?.toString() || "";

      // Still try to extract key from output (script may have printed it before erroring)
      const keyMatch = (stdout + stderr).match(/sk-or-[\w-]+/);
      if (keyMatch) {
        return { vars: { OPENROUTER_API_KEY: keyMatch[0] } };
      }

      throw new Error(
        `OpenRouter provisioning failed.\n${stderr.slice(-300) || stdout.slice(-300)}`
      );
    }
  },
};

registry.register(openrouterProvider);
