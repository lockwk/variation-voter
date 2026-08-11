import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const generateId = customAlphabet(alphabet, 10);

export function newId(): string {
  return generateId();
}
