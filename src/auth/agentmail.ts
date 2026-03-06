import { AgentMailClient } from "agentmail";
import dotenv from "dotenv";
import path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getAgentEmail(): string {
  const email = process.env.AGENT_EMAIL;
  if (!email) {
    throw new Error("AGENT_EMAIL not set. Add it to your .env file.");
  }
  return email;
}

let client: AgentMailClient | null = null;

export function getAgentMailClient(): AgentMailClient {
  if (!client) {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AGENTMAIL_API_KEY not set. Get one at https://console.agentmail.to and set it in your environment or .env file."
      );
    }
    client = new AgentMailClient({ apiKey });
  }
  return client;
}

export { getAgentEmail };

export interface AgentInbox {
  inboxId: string;
  email: string;
}

/**
 * Find the permanent agentmail inbox.
 */
export async function getInbox(): Promise<AgentInbox> {
  const am = getAgentMailClient();
  const email = getAgentEmail();
  const username = email.split("@")[0];

  const existing = await am.inboxes.list();
  const found = existing.inboxes?.find((inbox) => inbox.inboxId === email);

  if (found) {
    console.log(`[agentmail] Using inbox: ${email} (${found.inboxId})`);
    return { inboxId: found.inboxId, email };
  }

  // Try creating — if it already exists, catch the error
  try {
    const inbox = await am.inboxes.create({ username });
    console.log(`[agentmail] Created inbox: ${email}`);
    return { inboxId: inbox.inboxId, email };
  } catch (err: any) {
    if (err?.message?.includes("AlreadyExists") || err?.body?.name === "AlreadyExistsError") {
      const allInboxes = await am.inboxes.list({ limit: 100 });
      for (const inbox of allInboxes.inboxes ?? []) {
        const raw = inbox as any;
        if (raw.email === email || raw.username === username) {
          console.log(`[agentmail] Found inbox: ${email} (${inbox.inboxId})`);
          return { inboxId: inbox.inboxId, email };
        }
      }
      console.log("[agentmail] Available inboxes:");
      for (const inbox of allInboxes.inboxes ?? []) {
        console.log(`  - ${inbox.inboxId} (${(inbox as any).email || "no email field"})`);
      }
      throw new Error(
        `Inbox ${email} exists but could not find its ID. Check agentmail console.`
      );
    }
    throw err;
  }
}

/**
 * Poll for a new email and extract a verification code or link.
 */
export async function waitForVerificationEmail(
  inboxId: string,
  opts: {
    fromFilter?: string;
    subjectFilter?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<{ code: string | null; link: string | null; body: string }> {
  const am = getAgentMailClient();
  const timeout = opts.timeoutMs ?? 120_000;
  const pollInterval = opts.pollIntervalMs ?? 3_000;
  const startTime = Date.now();

  console.log("[agentmail] Waiting for verification email...");

  const initialMessages = await am.inboxes.messages.list(inboxId, { limit: 5 });
  const initialIds = new Set(
    initialMessages.messages?.map((m) => m.messageId) ?? []
  );

  while (Date.now() - startTime < timeout) {
    const messages = await am.inboxes.messages.list(inboxId, { limit: 10 });

    for (const msgItem of messages.messages ?? []) {
      if (initialIds.has(msgItem.messageId)) continue;

      if (
        opts.fromFilter &&
        !msgItem.from?.toLowerCase().includes(opts.fromFilter.toLowerCase())
      ) {
        continue;
      }
      if (
        opts.subjectFilter &&
        !msgItem.subject?.toLowerCase().includes(opts.subjectFilter.toLowerCase())
      ) {
        continue;
      }

      const msg = await am.inboxes.messages.get(inboxId, msgItem.messageId);
      const body = msg.extractedText || msg.text || msg.html || "";

      console.log(
        `\n[agentmail] Got email from ${msgItem.from}: "${msgItem.subject}"`
      );

      const codeMatch = body.match(/\b(\d{4,8})\b/);
      const linkMatch = body.match(
        /https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|code|auth|callback)[^\s"'<>]*/i
      );

      return {
        code: codeMatch ? codeMatch[1] : null,
        link: linkMatch ? linkMatch[0] : null,
        body,
      };
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Polling... ${elapsed}s elapsed`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  console.log("");
  throw new Error(
    `No verification email received within ${timeout / 1000}s.`
  );
}
