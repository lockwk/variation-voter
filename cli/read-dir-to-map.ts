import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Recursively read every file under `dir` from disk into a flat map of
 * POSIX relative-path -> bytes, ready to hand to `fflate.zipSync` for
 * upload as an app bundle. Directories are walked but not included in the
 * result; paths use `/` separators regardless of platform.
 *
 * Symlinks are followed: a symlinked file is read and included, a
 * symlinked directory is walked. Each directory's resolved (real) path is
 * tracked to guard against symlink cycles.
 */
export async function readDirToMap(dir: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const visitedRealDirs = new Set<string>();

  async function addFile(fullPath: string): Promise<void> {
    const relativePath = path.relative(dir, fullPath).split(path.sep).join("/");
    files.set(relativePath, new Uint8Array(await readFile(fullPath)));
  }

  async function walk(currentDir: string): Promise<void> {
    const realCurrentDir = await realpath(currentDir);
    if (visitedRealDirs.has(realCurrentDir)) return;
    visitedRealDirs.add(realCurrentDir);

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        await addFile(fullPath);
      } else if (entry.isSymbolicLink()) {
        let targetStat;
        try {
          targetStat = await stat(fullPath);
        } catch {
          // Broken symlink (target doesn't exist) — skip it.
          continue;
        }
        if (targetStat.isDirectory()) {
          await walk(fullPath);
        } else if (targetStat.isFile()) {
          await addFile(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return files;
}
