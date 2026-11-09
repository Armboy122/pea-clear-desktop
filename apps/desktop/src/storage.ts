import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { historySchema, settingsSchema, type HistoryEntry, type Settings } from '@pea/contracts';

async function loadJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class Storage {
  constructor(private readonly root: string, private readonly defaults: Settings) {}

  async settings(): Promise<Settings> {
    const stored = await loadJson(path.join(this.root, 'settings.json'));
    return stored === undefined ? this.defaults : settingsSchema.parse(stored);
  }

  async saveSettings(settings: Settings) {
    await writeJson(path.join(this.root, 'settings.json'), settings);
    return settings;
  }

  async history() {
    const directory = path.join(this.root, 'trips');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = (await readdir(directory)).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name));
    const trips = await Promise.all(names.map(async (name) => historySchema.parse(await loadJson(path.join(directory, name)))));
    return trips.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async trip(id: string) {
    const value = await loadJson(path.join(this.root, 'trips', id + '.json'));
    return value === undefined ? undefined : historySchema.parse(value);
  }

  async saveTrip(entry: HistoryEntry) {
    await writeJson(path.join(this.root, 'trips', entry.trip.id + '.json'), entry);
    return entry;
  }
}
