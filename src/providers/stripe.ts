import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function stripeApi(
  token: string,
  path: string,
  opts?: { method?: string; body?: URLSearchParams }
): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: opts?.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      ...(opts?.body
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(opts?.body ? { body: opts.body.toString() } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API ${res.status}: ${text}`);
  }

  return res.json();
}

const stripeProvider: Provider = {
  name: "stripe",
  requiredCredentials: [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ],

  detect(env: Record<string, string>): boolean {
    return !!env["STRIPE_SECRET_KEY"] && !!env["STRIPE_PUBLISHABLE_KEY"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const key = env["STRIPE_SECRET_KEY"];
    if (!key) return false;
    try {
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
        },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    _context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const secretKey = process.env["STRIPE_SECRET_KEY"];
    if (!secretKey) {
      throw new Error(
        "Stripe requires an existing secret key to create restricted keys.\n" +
          "Set STRIPE_SECRET_KEY in your environment or retrieve it from https://dashboard.stripe.com/apikeys"
      );
    }

    console.log("[stripe] Using existing secret key to create restricted key...");

    // Create a restricted API key for the project
    const keyName = `kip-${opts.projectName || "autoprovision"}`;
    const body = new URLSearchParams();
    body.append("name", keyName);
    body.append("permissions[0][type]", "write");
    body.append("permissions[0][resources][0]", "charges");
    body.append("permissions[0][resources][1]", "customers");
    body.append("permissions[0][resources][2]", "products");
    body.append("permissions[0][resources][3]", "prices");
    body.append("permissions[0][resources][4]", "payment_intents");
    body.append("permissions[0][resources][5]", "checkout_sessions");

    const keyRes = (await stripeApi(secretKey, "/v1/api_keys", {
      method: "POST",
      body,
    })) as { id: string; secret: string };

    console.log(`[stripe] Created restricted key: ${keyRes.secret.slice(0, 12)}...`);

    // Fetch publishable key
    const keysRes = (await stripeApi(secretKey, "/v1/api_keys")) as {
      data: { type: string; secret: string }[];
    };
    const publishable = keysRes.data.find((k) => k.type === "publishable");
    if (!publishable) {
      throw new Error("Could not find publishable key in Stripe account.");
    }

    // Create webhook endpoint
    const webhookBody = new URLSearchParams();
    webhookBody.append("url", `https://${opts.projectName || "localhost"}/api/webhooks/stripe`);
    webhookBody.append("enabled_events[]", "checkout.session.completed");
    webhookBody.append("enabled_events[]", "payment_intent.succeeded");
    webhookBody.append("enabled_events[]", "customer.subscription.updated");

    const webhookRes = (await stripeApi(secretKey, "/v1/webhook_endpoints", {
      method: "POST",
      body: webhookBody,
    })) as { id: string; secret: string };

    console.log(`[stripe] Created webhook endpoint: ${webhookRes.id}`);

    return {
      vars: {
        STRIPE_SECRET_KEY: keyRes.secret,
        STRIPE_PUBLISHABLE_KEY: publishable.secret,
        STRIPE_WEBHOOK_SECRET: webhookRes.secret,
      },
      metadata: {
        projectUrl: "https://dashboard.stripe.com/apikeys",
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If keys were partially created, check dashboard.stripe.com/apikeys to clean up."
    );
  },
};

registry.register(stripeProvider);
