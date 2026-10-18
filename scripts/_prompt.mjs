// Tiny terminal prompt helpers for the setup scripts (no dependencies).
import readline from "node:readline";

/** Normal question — what you type is shown. */
export function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Secret question — keystrokes are read directly in raw mode and NEVER echoed:
 * every character shows as "*". (Node's readline echo can't be relied on to hide
 * typed characters across terminals, so we don't use it for secrets.)
 * Backspace works; Ctrl-C cancels. Returns the exact text typed.
 */
export function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buf = "";
    let inEscape = false; // swallow arrow-key / function-key sequences

    const finish = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (inEscape) {
          if (/[A-Za-z~]/.test(ch)) inEscape = false;
          continue;
        }
        if (ch === "\u001b") { inEscape = true; continue; }
        if (ch === "\r" || ch === "\n") {
          finish();
          process.stdout.write("\n");
          resolve(buf);
          return;
        }
        if (ch === "\u0003" || ch === "\u0004") { // Ctrl-C / Ctrl-D
          finish();
          process.stdout.write("\nCancelled. Nothing was changed.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (buf.length) { buf = buf.slice(0, -1); process.stdout.write("\b \b"); }
          continue;
        }
        if (ch < " ") continue; // ignore other control characters
        buf += ch;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
