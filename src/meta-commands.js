export const DOT_COMMANDS = [
  {
    name: "help",
    summary: "Show available dot commands or detailed help for one command.",
    usage: [".help", ".help COMMAND"],
    description: [
      "Without arguments, lists all dot commands with a short summary.",
      "Specify a command name to see its description and usage.",
    ],
  },
  {
    name: "load",
    summary: "Load a SQLite extension shared library.",
    usage: [".load PATH"],
    description: [
      "Wraps better-sqlite3's loadExtension().",
      "The path may be absolute or relative to the current working directory.",
    ],
    argumentHints: ["path"],
  },
  {
    name: "cd",
    summary: "Change the working directory for the child process.",
    usage: [".cd PATH"],
    description: [
      "Switches the current directory that the child process uses to resolve relative paths.",
    ],
    argumentHints: ["path"],
  },
  {
    name: "format",
    summary: "Change the default output format for subsequent queries.",
    usage: [".format array", ".format object"],
    description: [
      "Selects the default formatter used when output clauses are omitted.",
      "`array` results in NDJSON arrays; `object` yields NDJSON objects.",
    ],
    argumentHints: ["array", "object"],
  },
  {
    name: "debug",
    summary: "Inspect or change debug logging categories.",
    usage: [".debug", ".debug CATEGORY...", ".debug on", ".debug off"],
    description: [
      "Displays current debug logging configuration or updates it.",
      "Accepts the same values as the ERQ_DEBUG environment variable.",
    ],
  },
];

export const DOT_COMMANDS_BY_NAME = new Map(
  DOT_COMMANDS.map((command) => [command.name, command]),
);

export function findDotCommand(name) {
  return DOT_COMMANDS_BY_NAME.get(name);
}

export function listDotCommandNames() {
  return DOT_COMMANDS.map((command) => command.name);
}
