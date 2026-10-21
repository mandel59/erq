import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runPackageTest } from "../scripts/test-package.js";

const fakeNpm = `
import fs from "node:fs";
import path from "node:path";
const command = process.argv[2];
if (command === "--version") {
  console.log("fixture-npm");
} else if (command === "pack") {
  const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (manifest.fixture.packFailure) {
    console.error("fixture pack failure");
    process.exit(2);
  }
  const destination = process.argv[process.argv.indexOf("--pack-destination") + 1];
  fs.writeFileSync(path.join(destination, "fixture.tgz"), JSON.stringify(manifest));
  console.log(JSON.stringify([{ filename: "fixture.tgz" }]));
} else if (command === "install") {
  const manifest = JSON.parse(fs.readFileSync("erq-under-test.tgz", "utf8"));
  const installed = path.join("node_modules", manifest.name);
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(path.join(installed, "package.json"), JSON.stringify({
    ...manifest, bin: { erq: "cli.js" },
  }));
  fs.writeFileSync(path.join(installed, "cli.js"),
    "console.log(process.version); process.exitCode = " + (manifest.fixture.testFailure ? 1 : 0));
  fs.writeFileSync("package-lock.json", JSON.stringify({
    lockfileVersion: 3,
    packages: { "": JSON.parse(fs.readFileSync("package.json", "utf8")) },
  }));
} else if (command === "ls") {
  console.log(JSON.stringify({ dependencies: { "fixture-erq": { version: "1.0.0" } } }));
} else if (command === "audit") {
  const manifest = JSON.parse(fs.readFileSync("node_modules/fixture-erq/package.json", "utf8"));
  const total = manifest.fixture.auditFailure ? 1 : 0;
  console.log(JSON.stringify({ metadata: { vulnerabilities: { total } } }));
  process.exitCode = total;
} else {
  throw new Error("Unexpected npm command: " + command);
}
`;

const harness = `
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("installed CLI uses the test runner's Node.js", () => {
  assert.equal(process.env.NODE_PATH, undefined);
  const child = spawnSync(process.execPath, [process.env.ERQ_TEST_CLI], { encoding: "utf8" });
  assert.equal(child.stdout.trim(), process.version);
  assert.equal(child.status, 0);
});
`;

async function createFixture(t, options = {}) {
  const temporaryRoot = await realpath(tmpdir());
  const projectRoot = await mkdtemp(join(temporaryRoot, "erq-runner-test-"));
  t.after(async () => {
    assert.strictEqual(dirname(await realpath(projectRoot)), temporaryRoot);
    await rm(projectRoot, { recursive: true, force: true, maxRetries: 3 });
  });
  await mkdir(join(projectRoot, "erq-ci"));
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({
    name: "fixture-erq", version: "1.0.0", type: "module", fixture: options,
  }));
  await writeFile(join(projectRoot, "package-lock.json"), "original lockfile\n");
  await writeFile(join(projectRoot, "fake-npm.js"), fakeNpm);
  await writeFile(join(projectRoot, "erq-ci", "test-testcases.js"), harness);
  return {
    projectRoot,
    npmCli: join(projectRoot, "fake-npm.js"),
    testArgs: ["--test-reporter=tap"],
  };
}

test("package tests retain a portable installation and clean the temporary tree", async t => {
  const fixture = await createFixture(t);
  const result = await runPackageTest(fixture);
  assert.strictEqual(result.status, 0);
  assert.notStrictEqual(dirname(result.installDirectory), fixture.projectRoot);
  await assert.rejects(access(result.installDirectory), { code: "ENOENT" });
  assert.deepStrictEqual((await readdir(result.artifactsDirectory)).sort(), [
    "audit.json", "commands.log", "dependencies.json", "environment.json",
    "erq-under-test.tgz", "pack.json", "package-lock.json", "package.json", "test.log",
  ]);
  const installed = JSON.parse(await readFile(join(result.artifactsDirectory, "package.json"), "utf8"));
  assert.deepStrictEqual(installed.dependencies, { "fixture-erq": "file:./erq-under-test.tgz" });
  assert.strictEqual(await readFile(join(fixture.projectRoot, "package-lock.json"), "utf8"), "original lockfile\n");
});

for (const [name, options] of [
  ["audit failures fail package tests even when the CLI succeeds", { auditFailure: true }],
  ["CLI failures fail package tests even when the audit succeeds", { testFailure: true }],
]) {
  test(name, async t => {
    const fixture = await createFixture(t, options);
    const result = await runPackageTest(fixture);
    assert.strictEqual(result.status, 1);
    const audit = JSON.parse(await readFile(join(result.artifactsDirectory, "audit.json"), "utf8"));
    assert.strictEqual(audit.metadata.vulnerabilities.total, options.auditFailure ? 1 : 0);
    assert.match(await readFile(join(result.artifactsDirectory, "test.log"), "utf8"), options.testFailure ? /# fail 1/ : /# pass 1/);
    await assert.rejects(access(result.installDirectory), { code: "ENOENT" });
  });
}

test("pack failures preserve diagnostics and clean the temporary tree", async t => {
  const fixture = await createFixture(t, { packFailure: true });
  await assert.rejects(runPackageTest(fixture), /npm pack failed/);
  const artifactRoot = join(fixture.projectRoot, ".artifacts", "package-test");
  const [name] = await readdir(artifactRoot);
  const artifacts = join(artifactRoot, name);
  const environment = JSON.parse(await readFile(join(artifacts, "environment.json"), "utf8"));
  assert.match(await readFile(join(artifacts, "commands.log"), "utf8"), /fixture pack failure/);
  await assert.rejects(access(environment.installDirectory), { code: "ENOENT" });
});
