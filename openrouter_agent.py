"""
OpenRouter API key provisioner using browser-use + agentmail.
Uses system Chrome to bypass Cloudflare. Polls agentmail API for verification.
"""
import asyncio
import os
import re
import sys
from dotenv import load_dotenv

load_dotenv()

from browser_use import Agent, Browser, ChatAnthropic
from agentmail import AgentMail

AGENT_EMAIL = os.environ["AGENT_EMAIL"]
PASSWORD = os.environ["AGENT_PASSWORD"]


def get_verification_link() -> str | None:
    """Check agentmail inbox for ANY verification link from OpenRouter."""
    am = AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
    msgs = am.inboxes.messages.list(AGENT_EMAIL, limit=10)
    for m in (msgs.messages or []):
        full = am.inboxes.messages.get(AGENT_EMAIL, m.message_id)
        body = full.html or full.text or full.extracted_text or ""
        link = re.search(r'https://clerk\.openrouter\.ai/v1/verify[^\s"<>]+', body)
        if link:
            return link.group(0).replace("&amp;", "&")
    return None


async def poll_for_verification(timeout: int = 180) -> str | None:
    """Poll agentmail for a verification link, checking ALL messages each time."""
    print("[agentmail] Polling inbox for verification link...")
    for i in range(timeout // 3):
        link = get_verification_link()
        if link:
            print(f"[agentmail] Found verification link!")
            return link
        await asyncio.sleep(3)
        if i % 5 == 0 and i > 0:
            print(f"  {i * 3}s...")
    return None


async def main():
    browser = Browser.from_system_chrome()
    llm = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0.0)

    # Check if there's already a verification link waiting
    existing_link = get_verification_link()

    if existing_link:
        print(f"[main] Found existing verification link, skipping signup")
        # Go straight to verify + create key
        task = f"""
1. Navigate to this URL to verify the account: {existing_link}
2. Wait for it to load completely (may redirect you).
3. Then go to https://openrouter.ai/settings/keys
4. If asked to sign in, use email {AGENT_EMAIL} and password {PASSWORD}, click Continue.
5. Once on the keys page, click "Create Key" or similar button.
6. Name it "autoprovision", submit it.
7. CRITICAL: Copy the FULL API key that starts with "sk-or-". Shown only once.
8. Return ONLY the key. Nothing else.
"""
    else:
        print("[main] No existing link, starting signup flow")
        # Start polling in background BEFORE the agent starts
        poll_task = asyncio.create_task(poll_for_verification(timeout=180))

        # Phase 1: Sign up
        signup_task = f"""
Go to https://openrouter.ai/settings/keys

If redirected to sign-in:
1. Enter email {AGENT_EMAIL}, click Continue
2. If "Couldn't find your account", click "Sign up"
3. On sign-up: email {AGENT_EMAIL}, password {PASSWORD}, check "I agree to Terms", click Continue
4. If Cloudflare CAPTCHA appears, click it and wait

Once you see "Verify your email" page, say "VERIFICATION_NEEDED" and stop.
If you're already on /settings/keys, say "ON_KEYS_PAGE" and stop.
Do NOT open Gmail or any email client.
"""
        agent1 = Agent(task=signup_task, llm=llm, browser=browser)
        result1 = await agent1.run()
        result1_str = str(result1)

        if "ON_KEYS_PAGE" in result1_str:
            # Already logged in, go straight to key creation
            task = f"""
You're on https://openrouter.ai/settings/keys
1. Click "Create Key" button
2. Name it "autoprovision", submit
3. Copy the FULL API key starting with "sk-or-"
4. Return ONLY the key.
"""
        else:
            # Wait for verification link from agentmail
            print("[main] Waiting for verification link from agentmail...")
            link = await poll_task
            if not link:
                print("[main] No verification email received. Aborting.")
                return

            task = f"""
1. Navigate to this URL to verify the account: {link}
2. Wait for it to load completely.
3. Then go to https://openrouter.ai/settings/keys
4. If asked to sign in, use email {AGENT_EMAIL} and password {PASSWORD}.
5. Once on the keys page, click "Create Key" or similar button.
6. Name it "autoprovision", submit it.
7. CRITICAL: Copy the FULL API key that starts with "sk-or-". Shown only once.
8. Return ONLY the key. Nothing else.
"""

    agent = Agent(task=task, llm=llm, browser=browser)
    result = await agent.run()
    result_str = str(result)

    # Extract API key
    key_match = re.search(r'sk-or-[\w-]+', result_str)
    if key_match:
        api_key = key_match.group(0)
        # Print the full key so the Node.js CLI can extract it
        print(f"\nOPENROUTER_API_KEY={api_key}")

        # Also write to .env when run standalone
        if os.environ.get("AUTOPROVISION_STANDALONE", "1") == "1":
            env_path = os.path.join(os.getcwd(), ".env")
            lines = []
            found = False
            if os.path.exists(env_path):
                with open(env_path) as f:
                    for line in f:
                        if line.startswith("OPENROUTER_API_KEY="):
                            lines.append(f'OPENROUTER_API_KEY="{api_key}"\n')
                            found = True
                        else:
                            lines.append(line)
            if not found:
                lines.append(f'OPENROUTER_API_KEY="{api_key}"\n')

            with open(env_path + ".tmp", "w") as f:
                f.writelines(lines)
            os.rename(env_path + ".tmp", env_path)
            os.chmod(env_path, 0o600)
            print("Saved OPENROUTER_API_KEY to .env")
    else:
        print(f"Could not extract key. Result: {result_str[:500]}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
