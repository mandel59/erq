import { stdout, stderr } from "node:process";
import { createWriteStream } from "node:fs";

/**
 * @param {object} dest 
 * @param {"stdout"|"stderr"|"file"} dest.type
 * @param {string} [dest.file]
 * @returns {{ outputStream: NodeJS.WritableStream, closeOutputStream?: () => void }}
 */
export function evalDestination(dest) {
  switch (dest.type) {
    case "stdout":
      return { outputStream: stdout };
    case "stderr":
      return { outputStream: stderr };
    case "file":
      const stream = createWriteStream(dest.file);
      return { outputStream: stream, closeOutputStream: () => stream.close() };
  }
}
