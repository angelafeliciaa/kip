import { execFileSync } from "child_process";
import { createInterface } from "readline";

export function notify(message: string): void {
  try {
    execFileSync("osascript", [
      "-e",
      `display notification "${message.replace(/[\\"]/g, "")}" with title "Autoprovision"`,
    ]);
  } catch {
    // Ignore notification failures
  }
}

export async function waitForUser(message: string): Promise<void> {
  console.log(message);
  notify(message);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Press Enter to continue...", () => {
      rl.close();
      resolve();
    });
  });
}
