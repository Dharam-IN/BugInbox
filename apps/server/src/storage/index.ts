import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.ts';

export interface StoredObject {
  key: string;
  byteSize: number;
}

/**
 * Private file storage behind a narrow adapter. V1 ships a local-disk
 * implementation backed by a Docker volume; swapping in object storage means
 * implementing this interface only.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<StoredObject>;
  createReadStream(key: string): NodeJS.ReadableStream;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** All keys currently held, used by the orphan sweeper. */
  list(): Promise<string[]>;
}

/** Storage keys are generated, never derived from user input. */
export function generateStorageKey(projectId: string, extension: 'png' | 'jpg'): string {
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${projectId}/${yyyymm}/${randomBytes(16).toString('hex')}.${extension}`;
}

const KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9]{6}\/[0-9a-f]{32}\.(png|jpg)$/;

export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolveKey(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Storage key escapes the storage root');
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true, mode: 0o750 });
    // Non-executable, owner read/write only.
    await writeFile(full, data, { mode: 0o640, flag: 'wx' });
    return { key, byteSize: data.byteLength };
  }

  createReadStream(key: string): NodeJS.ReadableStream {
    return createReadStream(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
        else if (entry.isFile() && KEY_PATTERN.test(rel)) out.push(rel);
      }
    };
    await walk(this.root, '');
    return out;
  }
}

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  adapter ??= new LocalDiskStorage(resolve(config().STORAGE_DIR));
  return adapter;
}

export async function ensureStorageReady(): Promise<void> {
  await mkdir(resolve(config().STORAGE_DIR), { recursive: true, mode: 0o750 });
}
