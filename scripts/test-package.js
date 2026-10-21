import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export async function runPackageTest({
  projectRoot = repositoryRoot,
  npmCli = process.env.npm_execpath,
  testArgs = [],
} = {}) {
  if (!npmCli) throw new Error("Run this script with npm run test:package.");

  const manifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const artifactRoot = join(projectRoot, ".artifacts", "package-test");
  await mkdir(artifactRoot, { recursive: true });
  const artifactsDirectory = await mkdtemp(join(artifactRoot, `node-${process.versions.node.split(".")[0]}-`));
  const temporaryRoot = await realpath(tmpdir());
  const installDirectory = await mkdtemp(join(temporaryRoot, "erq-package-test-"));
  const env = { ...process.env };
  // The installed CLI must resolve its own dependencies.
  delete env.NODE_PATH;
  // A fresh test runner must not inherit a parent's internal test context.
  delete env.NODE_TEST_CONTEXT;
  const log = [];

  function run(args, cwd, { quiet = false } = {}) {
    const result = spawnSync(process.execPath, args, {
      cwd,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    log.push(`$ node ${args.join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}\n`);
    if (result.stdout && !quiet) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    return result;
  }

  function npm(args, cwd = installDirectory, options = {}) {
    return run([npmCli, ...args], cwd, options);
  }

  function requireSuccess(result, operation) {
    if (result.status !== 0) {
      throw new Error(`${operation} failed (${result.signal ?? result.status}).`);
    }
  }

  try {
    const version = npm(["--version"], installDirectory, { quiet: true });
    requireSuccess(version, "Reading npm version");
    await writeFile(join(artifactsDirectory, "environment.json"), JSON.stringify({
      node: process.version,
      npm: version.stdout.trim(),
      platform: process.platform,
      arch: process.arch,
      package: `${manifest.name}@${manifest.version}`,
      testArgs,
      installDirectory,
    }, null, 2) + "\n");

    const packed = npm(["pack", "--json", "--pack-destination", installDirectory], projectRoot, { quiet: true });
    requireSuccess(packed, "npm pack");
    const [tarball] = JSON.parse(packed.stdout);
    if (!tarball?.filename || basename(tarball.filename) !== tarball.filename) {
      throw new Error("npm pack did not return a tarball filename.");
    }
    await writeFile(join(artifactsDirectory, "pack.json"), packed.stdout);
    await rename(join(installDirectory, tarball.filename), join(installDirectory, "erq-under-test.tgz"));
    await writeFile(join(installDirectory, "package.json"), JSON.stringify({
      name: "erq-package-test",
      version: "0.0.0",
      private: true,
      dependencies: { [manifest.name]: "file:./erq-under-test.tgz" },
    }, null, 2) + "\n");

    // Audit separately so its JSON report can be retained even when it fails.
    const installed = npm(["install", "--no-audit", "--no-fund"]);
    requireSuccess(installed, "Installing the packed CLI");
    const dependencies = npm(["ls", "--all", "--json"], installDirectory, { quiet: true });
    await writeFile(join(artifactsDirectory, "dependencies.json"), dependencies.stdout);
    const audit = npm(["audit", "--omit=dev", "--json"], installDirectory, { quiet: true });
    await writeFile(join(artifactsDirectory, "audit.json"), audit.stdout);
    console.log("Package audit exit code:", audit.status);

    const installedRoot = join(installDirectory, "node_modules", manifest.name);
    const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
    const bin = typeof installedManifest.bin === "string" ? installedManifest.bin : installedManifest.bin?.erq;
    if (!bin) throw new Error("The packed package does not declare the erq CLI.");
    env.ERQ_TEST_CLI = resolve(installedRoot, bin);
    const tests = run(["--test", ...testArgs, join(projectRoot, "erq-ci", "test-testcases.js")], projectRoot);
    await writeFile(join(artifactsDirectory, "test.log"), (tests.stdout ?? "") + (tests.stderr ?? ""));

    return {
      status: [dependencies, audit, tests].every(result => result.status === 0) ? 0 : 1,
      artifactsDirectory,
      installDirectory,
    };
  } finally {
    try {
      for (const name of ["package.json", "package-lock.json", "erq-under-test.tgz"]) {
        try {
          await copyFile(join(installDirectory, name), join(artifactsDirectory, name));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      await writeFile(join(artifactsDirectory, "commands.log"), log.join("\n"));
      console.log(`Package test artifacts: ${artifactsDirectory}`);
    } finally {
      // Only remove the temporary directory created by this invocation.
      if (dirname(await realpath(installDirectory)) !== temporaryRoot) {
        throw new Error("Refusing to remove a package test directory outside the temporary root.");
      }
      await rm(installDirectory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runPackageTest({ testArgs: process.argv.slice(2) });
    process.exitCode = result.status;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
