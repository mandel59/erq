import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import commandLineArgs from "command-line-args";

export const optionList = [
  { name: 'help', alias: 'h', type: Boolean, description: 'show Usage' },
  { name: 'version', alias: 'v', type: Boolean, description: 'show Version' },
  { name: 'load', alias: 'l', typeLabel: '{underline path}', type: String, lazyMultiple: true, defaultValue: [], description: 'load extension' },
  { name: 'init', alias: 'i', type: String, typeLabel: '{underline path}', description: 'path to initialize Erq file' },
  { name: 'format', alias: 'f', type: String, typeLabel: '{underline mode}', description: 'output format' },
  { name: 'db', type: String, typeLabel: '{underline path}', defaultOption: true, description: 'path to SQLite database file' },
];

export async function showUsage() {
  const { default: commandLineUsage } = await import("command-line-usage");
  const sections = [
    {
      header: 'Erq CLI',
      content: 'Erq-powered SQLite client',
    },
    {
      header: 'Options',
      optionList
    }
  ];
  const usage = commandLineUsage(sections);
  console.error(usage);
}

export async function showVersion() {
  const [
    { default: Database },
    packagejson,
  ] = await Promise.all([
    import("better-sqlite3"),
    readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf-8"),
  ]);
  const erqVersion = JSON.parse(packagejson).version;
  const db = new Database(":memory:");
  const sqliteVersion = db.prepare("select sqlite_version()").pluck().get();
  console.log("Erq CLI version %s", erqVersion);
  console.log("SQLite version %s", sqliteVersion);
}

async function getOptions() {
  const options = commandLineArgs(optionList);
  if (options.help) {
    await showUsage();
    process.exit();
  }
  if (options.version) {
    await showVersion();
    process.exit();
  }
  return options;
}

export const options = await getOptions();
