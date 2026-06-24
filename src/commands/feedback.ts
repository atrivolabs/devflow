import chalk from "chalk";
import { createInterface } from "node:readline";
import {
  buildContext,
  describeContext,
  submitFeedback,
  buildIssueUrl,
  tryOpen,
  type FeedbackContext,
} from "../lib/feedback.js";

// `devflow feedback` — a complete in-CLI bug/feedback submission flow. No
// browser: we collect a multi-line message, show the anonymous context that
// will be attached, confirm, and POST it to the server endpoint which files the
// GitHub issue. If the endpoint is unreachable we fall back to a pre-filled
// GitHub new-issue URL so feedback is never a dead end.
export async function feedbackCmd(message: string[] = []): Promise<void> {
  console.log();
  console.log(chalk.bold("  Report a bug or send feedback"));
  console.log();

  // Pre-seed from any inline summary (`devflow feedback "music stops"`).
  const seed = message.join(" ").trim();
  console.log(
    chalk.dim("  Describe the issue. Finish with an empty line (or Ctrl+D).")
  );
  if (seed) console.log(chalk.dim("  Starting from your summary; add detail or just submit.\n"));
  else console.log();

  const { body, confirmed } = await collect(seed);

  if (!body) {
    console.log(chalk.dim("\n  Nothing entered — cancelled.\n"));
    return;
  }
  if (!confirmed) {
    console.log(chalk.dim("\n  Cancelled — nothing sent.\n"));
    return;
  }

  // Context is anonymous and deterministic for this run; rebuild it for the
  // actual send (it's what the preview showed).
  const context = buildContext();
  process.stdout.write(chalk.dim("  submitting…"));
  const result = await submitFeedback(body, context);
  process.stdout.write("\r\x1b[K");

  if (result.ok) {
    console.log(chalk.green("  ✓ Thanks — your feedback was submitted."));
    if (result.url) console.log("  " + chalk.cyan(result.url));
    console.log();
    return;
  }

  // Endpoint unreachable — fall back to a pre-filled GitHub issue URL.
  const url = buildIssueUrl(body, context);
  console.log(chalk.yellow("  Couldn't reach the feedback service."));
  console.log(chalk.dim("  File it on GitHub instead (pre-filled):"));
  console.log("  " + chalk.cyan(url));
  console.log();
  tryOpen(url);
}

// Drive the whole interaction over a single persistent `line` listener: collect
// message lines until a blank line, print the preview, then read one more line
// as the y/N confirmation. Using one listener (rather than closing/reopening
// readline between reads) means no input buffered on a piped stdin is dropped.
function collect(seed: string): Promise<{ body: string; confirmed: boolean }> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const lines: string[] = seed ? [seed] : [];
    let phase: "message" | "confirm" = "message";

    const finish = (confirmed: boolean) => {
      rl.off("line", onLine);
      rl.off("close", onClose);
      rl.close();
      resolve({ body: lines.join("\n").trim(), confirmed });
    };

    const onLine = (line: string) => {
      if (phase === "message") {
        if (line.trim() !== "") {
          lines.push(line);
          rl.prompt();
          return;
        }
        // Blank line ends the message. Bail early if nothing was entered.
        if (lines.join("\n").trim() === "") return finish(false);
        showPreview(lines.join("\n").trim(), buildContext());
        phase = "confirm";
        rl.setPrompt("");
        process.stdout.write(chalk.dim("  Send this? [y/N] "));
        return;
      }
      // confirm phase: this line is the answer
      finish(/^y(es)?$/i.test(line.trim()));
    };
    const onClose = () => finish(false);

    rl.on("line", onLine);
    rl.on("close", onClose);
    rl.setPrompt(chalk.dim("  > "));
    rl.prompt();
  });
}

// Show exactly what will be sent before submitting — anonymous context only.
function showPreview(body: string, context: FeedbackContext): void {
  console.log();
  console.log(chalk.dim("  This will be sent:"));
  console.log();
  console.log(chalk.dim("  Message:"));
  for (const line of body.split("\n")) console.log("    " + line);
  console.log();
  console.log(chalk.dim("  Context (anonymous):"));
  for (const line of describeContext(context)) console.log(chalk.dim(line));
  console.log();
}
