"""
Resend API key provisioner using browser-use + agentmail.
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
    """Check agentmail inbox for a confirmation link from Resend."""
    am = AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
    msgs = am.inboxes.messages.list(AGENT_EMAIL, limit=10)
    for m in (msgs.messages or []):
        full = am.inboxes.messages.get(AGENT_EMAIL, m.message_id)
        subj = getattr(full, "subject", "")
        if "Resend" not in str(subj):
            continue
        body = full.html or full.text or full.extracted_text or ""
        link = re.search(r'https://resend\.com/auth/confirm-account[^\s"<>]+', body)
        if link:
            return link.group(0).replace("&amp;", "&")
    return None


async def poll_for_verification(timeout: int = 180) -> str | None:
    """Poll agentmail for a verification link."""
    print("[agentmail] Polling inbox for verification link...")
    for i in range(timeout // 3):
        link = get_verification_link()
        if link:
            print("[agentmail] Found verification link!")
            return link
        await asyncio.sleep(3)
        if i % 5 == 0 and i > 0:
            print(f"  {i * 3}s...")
    return None


async def main():
    browser = Browser.from_system_chrome()
    llm = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0.0)

    import time
    key_name = f"kip-{int(time.time())}"

    # Single agent task that handles everything in one shot
    task = f"""
Go to https://resend.com/api-keys

STEP 1 - LOGIN (if needed):
If redirected to a login page:
1. Enter email {AGENT_EMAIL} and password {PASSWORD}
2. Click "Log In" or "Continue"
3. If account doesn't exist, click "Sign up", fill email {AGENT_EMAIL}, password {PASSWORD}, agree to terms, submit
4. If you see "Verify your email", say "VERIFICATION_NEEDED" and stop
5. If Cloudflare CAPTCHA appears, click it and wait

STEP 2 - CREATE API KEY:
Once on the API keys page:
1. Look for a button that says "+ Create API Key" — it may be in the top-right corner or near the header. It could also just say "Create API Key" or have a "+" icon.
2. Click it. A modal or inline form will appear with fields for Name, Permission, and optionally Domain.
3. In the Name field, type "{key_name}"
4. For Permission, select "Full access" if there's a dropdown
5. Click the "Add" button to submit
6. IMPORTANT: After clicking Add, a success message or modal will show the FULL API key.
   The full key starts with "re_" and is 30+ characters long.
   Do NOT read the truncated key from the table (those end with "...").
   Read the key from the success/creation dialog that appears right after clicking Add.
7. Return ONLY the full key. Nothing else.

Do NOT open Gmail or any email client.
"""

    print("[main] Running browser agent...")
    agent = Agent(task=task, llm=llm, browser=browser)
    result = await agent.run()
    result_str = str(result)

    # Check if verification is needed
    if "VERIFICATION_NEEDED" in result_str:
        print("[main] Verification needed, polling agentmail...")
        link = await poll_for_verification(timeout=180)
        if not link:
            print("[main] No verification email received. Aborting.")
            sys.exit(1)

        verify_and_create_task = f"""
1. Navigate to this URL to verify the account: {link}
2. Wait for it to load completely.
3. Then go to https://resend.com/api-keys
4. If asked to sign in, use email {AGENT_EMAIL} and password {PASSWORD}.
5. Once on the API keys page, click "Create API Key" button.
6. Set the name to "kip-autoprovision".
7. Set permission to "Full access" if there's an option.
8. Click "Add" or "Create" to submit.
9. CRITICAL: Copy the FULL API key starting with "re_" (30+ chars). Shown only once.
10. Return ONLY the full key. Nothing else.
"""
        agent2 = Agent(task=verify_and_create_task, llm=llm, browser=browser)
        result = await agent2.run()
        result_str = str(result)

    # Extract API key (20+ chars to skip truncated dashboard previews)
    key_match = re.search(r're_[A-Za-z0-9_]{20,}', result_str)
    if key_match:
        api_key = key_match.group(0)
        print(f"\nRESEND_API_KEY={api_key}")

        if os.environ.get("AUTOPROVISION_STANDALONE", "1") == "1":
            env_path = os.path.join(os.getcwd(), ".env")
            lines = []
            found = False
            if os.path.exists(env_path):
                with open(env_path) as f:
                    for line in f:
                        if line.startswith("RESEND_API_KEY="):
                            lines.append(f'RESEND_API_KEY="{api_key}"\n')
                            found = True
                        else:
                            lines.append(line)
            if not found:
                lines.append(f'RESEND_API_KEY="{api_key}"\n')

            with open(env_path + ".tmp", "w") as f:
                f.writelines(lines)
            os.rename(env_path + ".tmp", env_path)
            os.chmod(env_path, 0o600)
            print("Saved RESEND_API_KEY to .env")
    else:
        print(f"Could not extract key. Result: {result_str[:500]}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
