import fs from "node:fs";
import path from "node:path";

const storageDir = path.join(process.cwd(), "storage");

function resolveFile(fileName) {
  return path.join(storageDir, fileName);
}

export function readCollection(fileName) {
  const filePath = resolveFile(fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf8");
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeCollection(fileName, data) {
  const filePath = resolveFile(fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}
