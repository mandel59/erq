import process, { stdin, stderr } from "node:process";
import readline from "node:readline";

import chalk from "chalk";

import { options } from "./options.js";
import { debugEnabled, debugLog, setDebugLogging, resolveDebugInput } from "./debug.js";
import { loadHistory, saveHistory } from "./history.js";
import { isTTY } from "./io.js";
import { parser } from "./parser.js";
import { ErqClient } from "./erq-client.js";

export async function parent() {
  debugLog(["general", "lifecycle"], "parent process start");

  /** @type {string[] | undefined} */
  let history;

  // ipc setups

  const client = await ErqClient.connect(process.argv.slice(2), {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    setup: (client) => {
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
    },
  });

  // global states

  /** @type {"read" | "eval" | "hang"} */
  let state = "read";
  let input = "";
  const editorState = {
    active: false,
    buffer: "",
    finishing: false,
    flushPending: false,
  };

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

  function parseErq() {
    try {
      const sqls = parser.parse(input, { startRule: "cli_readline" });
      input = "";
      return sqls;
    } catch (error) {
      if (error.expected != null && error.found == null) {
        // Incomplete query detected - waiting for continuation on next line
        return null;
      }
      if (debugEnabled(["general", "stack"])) {
        debugLog(["general", "stack"], error);
      } else {
        console.error("%s: %s", error.name, error.message);
      }
      if (error && error.location) {
        const startLine = error.location.start.line;
        const startColumn = error.location.start.column;
        const endLine = error.location.end.line;
        const endColumn = error.location.end.column
        console.error(" at line %d column %d", startLine, startColumn);
        if (stderr.isTTY) {
          console.error("---");
          const reLine = /[^\n]*\n|[^\n]+/y;
          let i = 0, m;
          while (m = reLine.exec(input)) {
            i += 1;
            const line = m[0].slice(0, -1);
            if (startLine <= i && i <= endLine) {
              let highlited = "";
              if (i === startLine && i === endLine) {
                const start = startColumn - 1;
                const end = endColumn - 1;
                highlited += line.slice(0, start);
                highlited += chalk.bgRed.white(line.slice(start, end));
                highlited += line.slice(end);
              } else if (i === startLine) {
                const start = startColumn - 1;
                highlited += line.slice(0, start);
                highlited += chalk.bgRed.white(line.slice(start) + " ");
              } else if (i === endLine) {
                const end = endColumn - 1;
                highlited += chalk.bgRed.white(line.slice(0, end));
                highlited += line.slice(end);
              } else {
                highlited += chalk.bgRed.white(line + " ");
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

/**
 * Applies local-side effects for debug commands so the parent process stays in sync.
 * @param {any[]} statements
 */
function applyDebugDirectives(statements) {
  if (!Array.isArray(statements)) return;
  for (const statement of statements) {
    if (statement == null || typeof statement !== "object") continue;
    if (statement.type !== "command" || statement.command !== "debug") continue;
    const args = Array.isArray(statement.args) ? statement.args : [];
    if (args.length === 0) continue;
    const resolved = resolveDebugInput(args.join(" "));
    if (!resolved.ok) continue;
    const nextValue = resolved.value ?? "";
    if (nextValue === "") {
      delete process.env["ERQ_DEBUG"];
    } else {
      process.env["ERQ_DEBUG"] = nextValue;
    }
    setDebugLogging(nextValue);
  }
}

  const historySize = process.env['ERQ_HISTORY_SIZE'] ? parseInt(process.env['ERQ_HISTORY_SIZE'], 10) : 1000;
  const rl = readline.createInterface({
    input: stdin,
    output: stderr,
    terminal: isTTY,
    completer: (line, callback) => {
      if (editorState.active) {
        callback(null, [[], line]);
        return;
      }
      client.ipcCall("completer", [line]).then(value => {
        debugLog(["general", "ipc"], "[completer]: %s", JSON.stringify(value));
        callback(null, value)
      });
    },
    prompt: 'erq> ',
    history: loadHistory(),
    historySize,
  });

  // @ts-ignore accessing readline internals to hook editor shortcuts
  const defaultTtyWrite = (isTTY && typeof rl._ttyWrite === "function")
    // @ts-ignore node readline ships _ttyWrite on terminal interfaces
    ? rl._ttyWrite.bind(rl)
    : null;
  if (defaultTtyWrite) {
    // @ts-ignore override private method intentionally
    rl._ttyWrite = function ttyWriteWithEditorHook(chunk, key) {
      if (editorState.active && key) {
        if (key.ctrl && !key.meta && !key.shift && key.name === "d") {
          handleEditorCtrlD();
          return;
        }
        if (key.name === "up" || key.name === "down") {
          return;
        }
        if (key.ctrl && !key.meta && !key.shift && (key.name === "n" || key.name === "p")) {
          return;
        }
        if (key.name === "tab") {
          return;
        }
      }
      defaultTtyWrite(chunk, key);
    };
  }

  function startEditorMode() {
    editorState.active = true;
    editorState.buffer = "";
    editorState.finishing = false;
    editorState.flushPending = false;
    cancelScheduledPrompt();
    rl.setPrompt("");
    console.error("-- Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)");
  }

  function handleEditorCtrlD() {
    if (!editorState.active || editorState.finishing) {
      return;
    }
    editorState.finishing = true;
    const hasPendingLine = typeof rl.line === "string" && rl.line.length > 0;
    if (hasPendingLine && defaultTtyWrite) {
      editorState.flushPending = true;
      defaultTtyWrite("", { name: "return" });
      return;
    }
    if (hasPendingLine) {
      editorState.buffer += rl.line;
      editorState.buffer += "\n";
      // @ts-ignore accessing readline internals to clear the buffer
      rl.line = "";
    }
    editorState.flushPending = false;
    void finalizeEditorSubmission();
  }

  async function finalizeEditorSubmission() {
    if (!editorState.active) {
      editorState.finishing = false;
      editorState.flushPending = false;
      return;
    }
    const script = editorState.buffer;
    editorState.buffer = "";
    editorState.active = false;
    editorState.flushPending = false;
    editorState.finishing = false;
    setPrompt();
    if (script.trim() === "") {
      schedulePrompt();
      return;
    }
    const previousInput = input;
    let editorInput = script;
    if (!editorInput.endsWith("\n")) {
      editorInput += "\n";
    }
    editorInput += ";;\n";
    input = editorInput;
    try {
      await evaluateInput();
    } finally {
      input = previousInput;
      setPrompt();
      schedulePrompt();
    }
  }

  function cancelEditorMode() {
    if (!editorState.active) {
      return;
    }
    editorState.active = false;
    editorState.buffer = "";
    editorState.finishing = false;
    editorState.flushPending = false;
    // @ts-ignore clearLine is available on readline.Interface
    rl.clearLine(0);
    stderr.write("\n");
    console.error("-- Editor input canceled");
    setPrompt();
    schedulePrompt();
  }

  function setPrompt() {
    if (editorState.active) {
      rl.setPrompt("");
      return;
    }
    if (input === "") {
      rl.setPrompt("erq> ");
    } else {
      rl.setPrompt("...> ");
    }
  }

  /** @type {NodeJS.Timeout | null} */
  let scheduledPrompt = null;
  function schedulePrompt() {
    if (!isTTY || editorState.active) return;
    if (scheduledPrompt) {
      return;
    }
    scheduledPrompt = setTimeout(() => {
      scheduledPrompt = null;
      if (state === "read" && !editorState.active) {
        rl.prompt();
      }
    }, 10);
  }
  function cancelScheduledPrompt() {
    if (scheduledPrompt) {
      clearTimeout(scheduledPrompt);
      scheduledPrompt = null;
    }
  }

  async function evaluateInput() {
    if (!isTTY) {
      return;
    }
    state = "eval";
    try {
      while (input !== "") {
        const sqls = parseErq();
        if (sqls == null) {
          break;
        }
        applyDebugDirectives(sqls);
        if (handleLocalCommands(sqls)) {
          continue;
        }
        await client.runSqls(sqls);
      }
    } finally {
      state = "read";
      await client.ipcCall("resetSigint", []);
      setPrompt();
      schedulePrompt();
    }
  }

  function handleLocalCommands(sqls) {
    if (!Array.isArray(sqls) || sqls.length !== 1) {
      return false;
    }
    const [statement] = sqls;
    if (!statement || typeof statement !== "object") {
      return false;
    }
    if (statement.type !== "command" || statement.command !== "editor") {
      return false;
    }
    const args = Array.isArray(statement.args) ? statement.args : [];
    if (args.length > 0) {
      console.error("usage: .editor");
      return true;
    }
    if (!isTTY) {
      console.error(".editor is only available when stdin is a TTY");
      return true;
    }
    if (editorState.active) {
      console.error("Already in editor mode");
      return true;
    }
    if (input !== "") {
      console.error("Finish the current statement before entering editor mode");
      return true;
    }
    startEditorMode();
    return true;
  }

  function handleSigint() {
    if (editorState.active) {
      cancelEditorMode();
      return;
    }
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
  (async () => {
    for await (const line of rl) {
      cancelScheduledPrompt();
      if (editorState.active) {
        editorState.buffer += line;
        editorState.buffer += "\n";
        // @ts-ignore
        if (Array.isArray(rl.history) && rl.history[0] === line) {
          // @ts-ignore
          rl.history.shift();
        }
        if (editorState.flushPending) {
          editorState.flushPending = false;
          await finalizeEditorSubmission();
        }
        continue;
      }
      input += line + "\n";
      if (!isTTY) {
        // slurp all input before run
        continue;
      }
      await evaluateInput();
    }
  })().catch((error) => {
    console.error(error);
    rl.close();
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
      if (!isTTY && handleLocalCommands(sqls)) {
        client.quit(1);
        return;
      }
      applyDebugDirectives(sqls);
      const ok = await client.runSqls(sqls);
      if (!ok) {
        client.quit(1);
      } else {
        client.quit(0);
      }
    }
  });
}
