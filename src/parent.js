import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import process, { stdin, stderr } from "node:process";
import { readFile } from "node:fs/promises";
import readline from "node:readline";

import { options, DEBUG } from "./options.js";
import { loadHistory, saveHistory } from "./history.js";
import { isTTY } from "./io.js";
import * as parser from "../dist/erq.js";

export async function parent() {
  if (DEBUG) {
    console.error("parent process start");
  }

  /** @type {string[] | undefined} */
  let history;

  // ipc setups

  const child = fork(fileURLToPath(new URL("../bin/erq-cli.js", import.meta.url)), process.argv.slice(2), {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']
  });

  child.on("exit", (code, signal) => {
    if (isTTY && history) {
      saveHistory(history);
    }
    if (signal != null) {
      console.error(signal);
      process.exit(1);
    }
    process.exit(code);
  });

  let ipcCallId = 0;
  function ipcCall(method, params) {
    ++ipcCallId;
    const id = ipcCallId;
    return new Promise((resolve, reject) => {
      const callback = (message) => {
        if (message == null || typeof message !== "object") return;
        if (message.id !== id) return;
        if ("error" in message) {
          reject(message.error);
        } else {
          resolve(message.result);
        }
        child.off("message", callback);
      }
      child.on("message", callback);
      ipcSend(method, params, id);
    })
  }
  function ipcSend(method, params, id) {
    child.send({ method, params, id })
  }

  const readyPromise = new Promise((resolve) => {
    const callback = (message) => {
      if (message === "ready") {
        resolve();
        child.off("message", callback);
      }
    }
    child.on("message", callback);
  });

  /**
   * 
   * @param {{ command: string, args: any[] }} param0 
   * @returns {Promise<boolean>}
   */
  async function runCLICommand({ command, args }) {
    return ipcCall("runCLICommand", [{ command, args }]);
  }

  function runSqls(statements) {
    return ipcCall("runSqls", [statements]);
  }

  // signal setups

  function handleSignal(signal) {
    return function () {
      child.kill(signal);
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

  await readyPromise;

  if (options.format) {
    const ok = await runCLICommand({ command: "format", args: [options.format] });
    if (!ok) {
      ipcSend("quit", [1], null);
      return;
    }
  }

  for (const l of options.load) {
    const ok = await runCLICommand({ command: "load", args: [l] });
    if (!ok) {
      ipcSend("quit", [1], null);
      return;
    }
  }

  if (options.init) {
    input = await readFile(options.init, "utf-8");
    input += "\n;;";
    while (input !== "") {
      const sqls = parseErq();
      if (sqls == null) {
        ipcSend("quit", [1], null);
        return;
      }
      const ok = await runSqls(sqls);
      if (!ok) {
        ipcSend("quit", [1], null);
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
        const start = error.location.start.offset;
        const end = error.location.end.offset;
        console.error(" at line %d column %d", error.location.start.line, error.location.start.column);
        if (stderr.isTTY) {
          console.error("---");
          console.error(
            '%s',
            input.slice(0, start)
            + '\x1b[1m\x1b[37m\x1b[41m'
            + input.slice(start, end)
            + '\x1b[0m' + input.slice(end));
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
    completer: (line, callback) => {
      ipcCall("completer", [line]).then(value => callback(null, value));
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
      ipcCall("interrupt", []).then(() => ok = true);
      setTimeout(() => {
        if (!ok) {
          state = "hang";
        }
      }, 200);
    } else {
      child.kill("SIGKILL");
    }
  }
  rl.on("SIGINT", handleSigint);

  function handleSigtstp() {
    child.kill("SIGSTOP");
    rl.pause();
    process.once("SIGCONT", () => {
      child.kill("SIGCONT");
      stdin.setRawMode(true);
      if (state === "read" && isTTY) {
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
    if (input !== "") {
      input += "\n";
    }
    input += line;
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
          await runSqls(sqls);
        }
      } finally {
        state = "read";
      }
      setPrompt();
      if (isTTY) {
        rl.prompt();
      }
    }
  });

  rl.on("history", (h) => {
    history = h;
  });
  rl.on("close", async () => {
    if (input !== null) {
      input += "\n;;";
      const sqls = await parseErq();
      if (sqls == null) {
        ipcSend("quit", [1], null);
        return;
      }
      const ok = await runSqls(sqls);
      if (!ok) {
        ipcSend("quit", [1], null);
      } else {
        ipcSend("quit", [0], null);
      }
    }
  });
}
