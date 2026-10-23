// Make pending pipe writes deterministic when testing CLI shutdown.
import { Writable } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

for (const name of ["stdout", "stderr"]) {
  const destination = process[name];
  Object.defineProperty(process, name, {
    value: new Writable({
      write(chunk, encoding, callback) {
        setTimeout(() => destination.write(chunk, encoding, callback), 5);
      },
    }),
  });
}
syncBuiltinESMExports();
