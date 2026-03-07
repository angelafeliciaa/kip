import { execFileSync } from "child_process";
import path from "path";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function provisionViaApi(
  rootKey: string,
  opts: ProviderOpts
): Promise<ProvisionResult> {
  const keyName = `kip-${opts.projectName || "autoprovision"}`;
  console.log(`[resend] Creating API key "${keyName}" via REST API...`);

  const res = await fetch("https://api.resend.com/api-keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rootKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: keyName, permission: "full_access" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { id: string; token: string };
  console.log(`[resend] Got key: ${data.token.slice(0, 8)}...`);

  return { vars: { RESEND_API_KEY: data.token } };
}

async function provisionViaBrowser(): Promise<ProvisionResult> {
  const projectRoot = path.resolve(__dirname, "../..");
  const scriptPath = path.join(projectRoot, "resend_agent.py");
  const pythonPath = path.join(projectRoot, ".venv/bin/python3");

  console.log("[resend] Running browser-use agent (Python)...");
  console.log("[resend] This will open Chrome — do NOT close it.");

  try {
    const output = execFileSync(pythonPath, [scriptPath], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5 * 60 * 1000,
      env: { ...process.env, AUTOPROVISION_STANDALONE: "0" },
    });

    const keyMatch = output.match(/re_[A-Za-z0-9_]{20,}/);
    if (!keyMatch) {
      console.error("[resend] Script output:", output.slice(-500));
      throw new Error("Python script completed but no API key found in output.");
    }

    const apiKey = keyMatch[0];
    console.log(`[resend] Got key: ${apiKey.slice(0, 8)}...`);

    return { vars: { RESEND_API_KEY: apiKey } };
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";

    const keyMatch = (stdout + stderr).match(/re_[A-Za-z0-9_]{20,}/);
    if (keyMatch) {
      return { vars: { RESEND_API_KEY: keyMatch[0] } };
    }

    throw new Error(
      `Resend provisioning failed.\n${stderr.slice(-300) || stdout.slice(-300)}`
    );
  }
}

const resendProvider: Provider = {
  name: "resend",
  requiredCredentials: ["RESEND_API_KEY"],

  detect(env: Record<string, string>): boolean {
    return !!env["RESEND_API_KEY"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const key = env["RESEND_API_KEY"];
    if (!key) return false;
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const rootKey = process.env["RESEND_ROOT_KEY"];
    if (rootKey) {
      return provisionViaApi(rootKey, opts);
    }
    return provisionViaBrowser();
  },
};

registry.register(resendProvider);
