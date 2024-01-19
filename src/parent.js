import process, { stdin, stderr } from "node:process";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import chalk from "chalk";

import { options, DEBUG } from "./options.js";
import { loadHistory, saveHistory } from "./history.js";
import { isTTY } from "./io.js";
import * as parser from "../dist/erq.js";
import { ErqClient } from "./erq-client.js";

export async function parent() {
  if (DEBUG) {
    console.error("parent process start");
  }

  /** @type {string[] | undefined} */
  let history;

  // ipc setups

  const client = ErqClient.connect(process.argv.slice(2), {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  client.on("exit", (code, signal) => {
    if (isTTY && history) {
      saveHistory(history);
    }
    if (signal != null) {
      console.error(signal);
      process.exit(1);
    }
    process.exit(code);
  });

  // signal setups

  function handleSignal(signal) {
    return function () {
      client.kill(signal);
    }
  }
  process.on("SIGINT", handleSignal("SIGINT"));
  process.on("SIGTERM", handleSignal("SIGTERM"));
  process.on("SIGQUIT", handleSignal("SIGQUIT"));

  // const syntax = readFileSync(fileURLToPath(new URL("../src/erq.pegjs", import.meta.url).href), "utf-8")
  // const parser = peggy.generate(syntax, {
  //   allowedStartRules: ["start", "cli_readline"],
  //   trace: DEBUG,
  // });

  // global states

  /** @type {"read" | "eval" | "hang"} */
  let state = "read";
  let input = "";

  await client.ready;

  if (options.format) {
    const ok = await client.runCLICommand({ command: "format", args: [options.format] });
    if (!ok) {
      client.ipcSend("quit", [1], null);
      return;
    }
  }

  for (const l of options.load) {
    const ok = await client.runCLICommand({ command: "load", args: [l] });
    if (!ok) {
      client.ipcSend("quit", [1], null);
      return;
    }
  }

  if (options.init) {
    input = await readFile(options.init, "utf-8");
    input += "\n;;\n";
    while (input !== "") {
      const sqls = parseErq();
      if (sqls == null) {
        client.ipcSend("quit", [1], null);
        return;
      }
      const ok = await client.runSqls(sqls);
      if (!ok) {
        client.ipcSend("quit", [1], null);
        return;
      }
    }
  }

  function parseErq() {
    try {
      const sqls = parser.parse(input, { startRule: "cli_readline" });
      input = "";
      return sqls;
    } catch (error) {
      if (error.found === null) {
        return null;
      }
      if (DEBUG) {
        console.error(error);
      } else {
        console.error("%s: %s", error.name, error.message);
      }
      if (error && error.location) {
        console.error(" at line %d column %d", error.location.start.line, error.location.start.column);
        if (stderr.isTTY) {
          const startLine = error.location.start.line;
          const endLine = error.location.end.line;
          console.error("---");
          const reLine = /[^\n]*\n|[^\n]+/y;
          let i = 0, m;
          while (m = reLine.exec(input)) {
            i += 1;
            const line = m[0].slice(0, -1);
            if (startLine <= i && i <= endLine) {
              let highlited = "";
              if (i === startLine && i === endLine) {
                const start = error.location.start.column - 1;
                const end = error.location.end.column - 1;
                highlited += line.slice(0, start);
                highlited += chalk.bgRed.white(line.slice(start, end));
                highlited += line.slice(end);
              } else if (i === startLine) {
                const start = error.location.start.column - 1;
                highlited += line.slice(0, start);
                highlited += chalk.bgRed.white(line.slice(start));
              } else if (i === endLine) {
                const end = error.location.end.column - 1;
                highlited += chalk.bgRed.white(line.slice(0, end));
                highlited += line.slice(end);
              } else {
                highlited += chalk.bgRed.white(line);
              }
              console.error(`${chalk.cyan(i.toString().padStart(4, " ") + ": ")}${highlited}`);
            } else if (startLine - 2 <= i && i <= endLine + 2) {
              console.error(`${chalk.cyan(i.toString().padStart(4, " ") + ": ")}${line}`);
            }
          }
          console.error("---");
        }
      }
      input = "";
    }
    return null;
  }

  const historySize = process.env['ERQ_HISTORY_SIZE'] ? parseInt(process.env['ERQ_HISTORY_SIZE'], 10) : 1000;
  const rl = readline.createInterface({
    input: stdin,
    output: stderr,
    terminal: isTTY,
    completer: (line, callback) => {
      client.ipcCall("completer", [line]).then(value => {
        if (DEBUG) {
          console.error("[completer]: %s", JSON.stringify(value));
        }
        callback(null, value)
      });
    },
    prompt: 'erq> ',
    history: loadHistory(),
    historySize,
  });

  function setPrompt() {
    if (input === "") {
      rl.setPrompt("erq> ");
    } else {
      rl.setPrompt("...> ");
    }
  }

  function handleSigint() {
    if (state === "read") {
      // @ts-ignore
      rl.clearLine(0);
      input = "";
      setPrompt();
      if (isTTY) { rl.prompt(); }
    } else if (state === "eval") {
      let ok = false;
      client.ipcCall("interrupt", []).then(() => ok = true);
      setTimeout(() => {
        if (!ok) {
          state = "hang";
        }
      }, 200);
    } else {
      client.kill("SIGKILL");
    }
  }
  rl.on("SIGINT", handleSigint);

  function handleSigtstp() {
    client.kill("SIGSTOP");
    rl.pause();
    process.once("SIGCONT", () => {
      client.kill("SIGCONT");
      stdin.setRawMode(true);
      if (state === "read") {
        // resume the stream
        rl.prompt();
      }
    });
    stdin.setRawMode(false);
    process.kill(process.pid, "SIGTSTP");
  }
  rl.on("SIGTSTP", handleSigtstp)

  if (isTTY) { rl.prompt(); }
  rl.on("line", async (line) => {
    input += line + "\n";
    if (!isTTY) {
      // slurp all input before run
      return;
    }
    if (state === "read") {
      state = "eval";
      try {
        while (input !== "") {
          const sqls = parseErq();
          if (sqls == null) {
            break;
          }
          await client.runSqls(sqls);
        }
      } finally {
        state = "read";
        await client.ipcCall("resetSigint", []);
        setPrompt();
        if (isTTY) {
          rl.prompt();
        }
      }
    }
  });

  rl.on("history", (h) => {
    history = h;
  });
  rl.on("close", async () => {
    if (input !== null) {
      input += "\n;;\n";
      const sqls = await parseErq();
      if (sqls == null) {
        client.quit(1);
        return;
      }
      const ok = await client.runSqls(sqls);
      if (!ok) {
        client.quit(1);
      } else {
        client.quit(0);
      }
    }
  });
}
