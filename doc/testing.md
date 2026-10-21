# Testing

Install development and test dependencies from the root lockfile:

```sh
npm ci
npm test
```

`npm ci` also builds the parser through the `prepare` script.
All maintained dependencies, including the image comparison tool, belong to
the root `package.json` and `package-lock.json`. The `erq-ci` directory
contains CLI test cases and data; it is not a separate npm project.

| Command | What it checks |
| --- | --- |
| `npm run test:unit` | Unit tests with c8 coverage |
| `npm run test:integration` | CLI test cases against the checkout and locked dependencies |
| `npm run test:package` | The same CLI cases against a freshly installed tarball |
| `npm run test:ci` | Compatibility alias for `test:package` |

`npm test` runs unit and integration tests. CI also runs the package tests
and audits the root dependency tree.

## Package tests

The package runner uses `npm pack --json`, installs the tarball in a new
directory outside the repository, and passes the installed CLI's absolute path
to the test harness through `ERQ_TEST_CLI`. Test tools resolve from the checkout;
the installed CLI resolves its own production dependencies. All CLI children
use the same Node.js executable as the test runner.

The runner uses the normal npm cache. It audits the installed production
dependencies and fails if the audit, dependency-tree check, or CLI tests fail.
The temporary installation is removed after each run, including failures.

The root lockfile fixes development and normal integration dependencies.
Package tests intentionally resolve the tarball's allowed dependency ranges,
as a new consumer installation would. Their resolved tree is recorded in
`.artifacts/package-test/node-*/`:

- `package.json`, `package-lock.json`, and `erq-under-test.tgz`
- `environment.json` with the Node.js and npm versions
- `dependencies.json`, `audit.json`, and `pack.json`
- `commands.log` and `test.log`

CI uploads these files for both successful and failed package tests. Failures
before installation can leave a partial set of files.

To repeat a recorded installation, copy the artifact directory outside the
repository and run `npm ci` there with the recorded Node.js and npm versions.
Then run the checkout's harness with `ERQ_TEST_CLI` set to the absolute path
`<artifact-directory>/node_modules/@mandel59/erq/bin/erq-cli.js`:

```sh
ERQ_TEST_CLI=/absolute/path/to/installed/erq-cli.js node --test erq-ci/test-testcases.js
```

A package test can be limited to selected cases using Node.js test flags:

```sh
npm run test:package -- --test-name-pattern=basic/aggregate
```

## Platform coverage

CI runs the tests on Ubuntu and Windows with Node.js 22, 24, and 26.
Windows CI enables Git symlinks before checkout so the filesystem fixtures
retain their file and directory links. Local Windows checkouts also need
symlink support enabled.

The filesystem fixture normalizes path separators in its query; CLI path
functions retain the host platform's native path behavior. The sinecurve PNG
fixture sets padding and disables autosizing so its 110-by-110 canvas does
not depend on Vega's automatic bounds calculation. Its expected image was
checked against both the locked and freshly resolved Vega dependencies.
