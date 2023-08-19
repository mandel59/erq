import { stdin, stderr } from "node:process";
export const isTTY = stdin.isTTY && stderr.isTTY;
