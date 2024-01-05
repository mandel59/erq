import { stdin, stderr } from "node:process";
export const isTTY = Boolean(stdin.isTTY && stderr.isTTY);
