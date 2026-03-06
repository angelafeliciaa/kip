import { maskKey } from "./env.js";

export interface ProviderResult {
  provider: string;
  keys: { name: string; value: string }[];
  status: "written" | "skipped" | "failed";
  error?: string;
}

export function printSummary(results: ProviderResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log(" Provisioning Summary");
  console.log("=".repeat(70));

  const rows: string[][] = [];
  rows.push(["Provider", "Key", "Value", "Status"]);
  rows.push(["--------", "---", "-----", "------"]);

  for (const result of results) {
    if (result.keys.length === 0) {
      rows.push([result.provider, "-", "-", result.status]);
    } else {
      for (let i = 0; i < result.keys.length; i++) {
        const key = result.keys[i];
        rows.push([
          i === 0 ? result.provider : "",
          key.name,
          maskKey(key.value),
          i === 0 ? result.status : "",
        ]);
      }
    }
    if (result.error) {
      rows.push(["", "  Error:", result.error, ""]);
    }
  }

  // Calculate column widths
  const colWidths = [0, 0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].length);
    }
  }

  for (const row of rows) {
    const line = row
      .map((cell, i) => cell.padEnd(colWidths[i]))
      .join("  ");
    console.log(" " + line);
  }

  console.log("=".repeat(70) + "\n");
}
