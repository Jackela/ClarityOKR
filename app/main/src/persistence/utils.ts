import { promises as fs } from 'node:fs';

export async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export async function writeJson<T>(file: string, value: T): Promise<void> {
  const payload = JSON.stringify(value, null, 2);
  await fs.writeFile(file, payload, 'utf-8');
}
