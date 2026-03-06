"""Phase 2+3: Verify email and create API key."""
import asyncio
import os
import re
from dotenv import load_dotenv

load_dotenv()

from browser_use import Agent, Browser, ChatAnthropic
from agentmail import AgentMail

AGENT_EMAIL = os.environ["AGENT_EMAIL"]
PASSWORD = os.environ["AGENT_PASSWORD"]


def get_latest_verification_link() -> str | None:
    am = AgentMail(api_key=os.environ["AGENTMAIL_API_KEY"])
    msgs = am.inboxes.messages.list(AGENT_EMAIL, limit=3)
    for m in (msgs.messages or []):
        full = am.inboxes.messages.get(AGENT_EMAIL, m.message_id)
        body = full.html or full.text or ""
        link = re.search(r'https://clerk\.openrouter\.ai/v1/verify[^\s"<>]+', body)
        if link:
            return link.group(0).replace("&amp;", "&")
    return None


async def main():
    link = get_latest_verification_link()
    if not link:
        print("No verification link found in agentmail!")
        return

    print(f"[verify] Got link: {link[:80]}...")

    browser = Browser.from_system_chrome()
    llm = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0.0)

    task = f"""
1. Navigate to this verification URL: {link}
2. Wait for the page to load and process the verification.
3. After verification, navigate to https://openrouter.ai/settings/keys
4. If asked to log in, use email {AGENT_EMAIL} and password {PASSWORD}
5. Once on the keys page, click the button to create a new API key
6. Name it "autoprovision"
7. Submit/create it
8. CRITICAL: Copy the FULL API key starting with "sk-or-". It is shown ONLY ONCE.
9. Return ONLY the API key. Nothing else. Just: sk-or-...
"""

    agent = Agent(task=task, llm=llm, browser=browser)
    result = await agent.run()
    result_str = str(result)

    key_match = re.search(r'sk-or-[\w-]+', result_str)
    if key_match:
        api_key = key_match.group(0)
        print(f"\nAPI Key: {api_key[:10]}...{api_key[-4:]}")

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


if __name__ == "__main__":
    asyncio.run(main())
