// Autosave contract: saving never starts work while a pointer is down, sends only
// what changed, never reports a stroke as saved unless it was, and survives the
// worker dying. Runs the real autosave + mirror with an in-memory "worker".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Group } from '../src/types/group';
import type { NoteRecord } from '../src/types/note';
import type { SaveRequest, SaveResponse } from '../src/persistence/saveMirror';
import { createMirror } from '../src/persistence/saveMirror';
import { fingerprintGroup } from '../src/persistence/fingerprint';

const disk = new Map<string, NoteRecord>();
vi.mock('../src/persistence/notes', () => ({
  saveNote: async (path: string, content: Group[]) => {
    disk.set(path, { path, content: structuredClone(content), created_at: 'main' });
  },
}));
let putGate: Promise<void> = Promise.resolve();
let failPuts = 0;
let hang = false;
let workersMade = 0;
let live: FakeWorker | null = null;
const patched: number[] = [];

const store = {
  load: async (path: string) => structuredClone(disk.get(path) ?? null),
  put: async (rec: NoteRecord) => {
    await putGate;
    if (failPuts > 0) {
      failPuts--;
      throw new Error('disk full');
    }
    disk.set(rec.path, structuredClone(rec));
  },
};

class FakeWorker {
  onmessage: ((e: { data: SaveResponse }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  dead = false;
  private mirror = createMirror(store);
  private queue: Promise<void> = Promise.resolve();
  constructor() {
    workersMade++;
    live = this;
  }
  postMessage(msg: SaveRequest) {
    const copy = structuredClone(msg);
    if (copy.type === 'patch') patched.push(...copy.items.map((i) => i.uid));
    if (hang) return;
    this.queue = this.queue.then(async () => {
      const res = await this.mirror.handle(copy);
      if (res && !this.dead) this.onmessage?.({ data: res });
    });
  }
  terminate() {
    this.dead = true;
  }
}
vi.stubGlobal('Worker', FakeWorker);

const listeners = new Map<string, (e: { pointerId: number }) => void>();
vi.stubGlobal('window', {
  location: { hostname: 'localhost' },
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  addEventListener: (t: string, fn: (e: { pointerId: number }) => void) => listeners.set(t, fn),
});
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });

const { note } = await import('../src/stores/note.svelte');
const { saveState } = await import('../src/stores/save.svelte');
const auto = await import('../src/persistence/autosave');
auto.installLifecycleHooks();

function stroke(id: number, x = 0): Group {
  return {
    id,
    type: 'stroke',
    color: '#000',
    size: 2,
    stroke: [
      { x, y: 0, p: 0.5, t: 1 },
      { x: x + 10, y: 10, p: 0.5, t: 2 },
    ],
    bbox: { x, y: 0, w: 10, h: 10 },
  } as Group;
}

const PATH = 'F/n.json';
const ids = (path = PATH) => disk.get(path)?.content.map((g) => g.id);
const write = (g: Group) => {
  note.addGroup(g);
  auto.markDirty();
};
const settle = async () => {
  for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(1000);
};

function open(groups: Group[] = [], path = PATH) {
  disk.set(path, { path, content: structuredClone(groups), created_at: 'then' });
  note.set(groups, path);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  await settle();
  auto.noteActivity(); // the fake clock restarts each test
  listeners.get('pointerup')?.({ pointerId: 1 });
  disk.clear();
  patched.length = 0;
  putGate = Promise.resolve();
  failPuts = 0;
  hang = false;
});
afterEach(async () => {
  await settle();
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves a stroke and sends only the changed group', async () => {
    open([stroke(1), stroke(2), stroke(3)]);
    write(stroke(4));
    await settle();
    expect(ids()).toEqual([1, 2, 3, 4]);
    expect(patched).toHaveLength(1);
    expect(note.dirty).toBe(false);
    expect(saveState.status).toBe('saved');
    expect(disk.get(PATH)?.created_at).toBe('then');
  });

  it('never starts a save while the pen is down', async () => {
    open();
    write(stroke(1));
    listeners.get('pointerdown')?.({ pointerId: 1 });
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      auto.noteActivity();
    }
    expect(ids()).toEqual([]);
    listeners.get('pointerup')?.({ pointerId: 1 });
    await settle();
    expect(ids()).toEqual([1]);
  });

  it('keeps a stroke finished during a write unsaved-and-dirty, then saves it', async () => {
    open();
    let release = () => {};
    putGate = new Promise((r) => (release = r));
    write(stroke(1));
    await vi.advanceTimersByTimeAsync(2000); // write of stroke 1 now in progress
    write(stroke(2));
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(note.dirty).toBe(true);
    expect(saveState.status).not.toBe('saved');
    await settle();
    expect(ids()).toEqual([1, 2]);
    expect(note.dirty).toBe(false);
  });

  it('saves during steady writing that never pauses for the idle gap', async () => {
    open();
    for (let i = 1; i <= 8; i++) {
      write(stroke(i));
      auto.noteActivity();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(ids()?.length).toBeGreaterThan(0);
  });

  it('sees in-place edits and erases, and keeps repeated ids apart', async () => {
    const a = stroke(1);
    open([a, stroke(1, 50), stroke(2)]);
    a.color = '#f00';
    (a as Group & { revealed?: boolean }).revealed = true;
    note.groups.splice(2, 1);
    note.commit();
    auto.markDirty();
    await settle();
    expect(disk.get(PATH)?.content.map((g) => g.bbox.x)).toEqual([0, 50]);
    expect(disk.get(PATH)?.content[0].color).toBe('#f00');
    expect(patched).toHaveLength(1);
  });

  it('flushNow waits for a write in progress, then saves what came after', async () => {
    open();
    let release = () => {};
    putGate = new Promise((r) => (release = r));
    write(stroke(1));
    await vi.advanceTimersByTimeAsync(2000);
    write(stroke(2));
    const done = auto.flushNow();
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(await done).toBe(true);
    expect(ids()).toEqual([1, 2]);
  });

  it('retries a failed write and reports it meanwhile', async () => {
    open();
    failPuts = 1;
    write(stroke(1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveState.status).toBe('error');
    expect(note.dirty).toBe(true);
    await settle();
    expect(ids()).toEqual([1]);
    expect(note.dirty).toBe(false);
  });

  it('restarts a crashed worker from the last saved record', async () => {
    open([stroke(1)]);
    write(stroke(2));
    await settle();
    const before = workersMade;
    patched.length = 0;
    live?.onerror?.({ message: 'boom' });
    write(stroke(3));
    await settle();
    expect(ids()).toEqual([1, 2, 3]);
    expect(workersMade).toBe(before + 1);
    expect(patched).toHaveLength(1);
  });

  it('kills a worker that stops answering, then recovers', async () => {
    open();
    write(stroke(0));
    await settle();
    const before = workersMade;
    hang = true;
    write(stroke(1));
    await vi.advanceTimersByTimeAsync(33000);
    expect(workersMade).toBeGreaterThanOrEqual(before);
    expect(saveState.status).toBe('error');
    hang = false;
    await vi.advanceTimersByTimeAsync(40000);
    expect(ids()).toEqual([0, 1]);
    expect(note.dirty).toBe(false);
  });

  it('a worker hung while opening a note is recovered too', async () => {
    hang = true;
    open([], 'F/other.json');
    write(stroke(1));
    await vi.advanceTimersByTimeAsync(33000);
    hang = false;
    await vi.advanceTimersByTimeAsync(40000);
    expect(ids('F/other.json')).toEqual([1]);
  });

  it('flushNow writes on the main thread when the worker cannot', async () => {
    open();
    write(stroke(0));
    await settle();
    hang = true;
    write(stroke(1));
    const done = auto.flushNow();
    await vi.advanceTimersByTimeAsync(6000);
    expect(await done).toBe(true);
    expect(ids()).toEqual([0, 1]);
    expect(disk.get(PATH)?.created_at).toBe('main');
    expect(note.dirty).toBe(false);
    hang = false;
  });

  it('a rename leaves no copy at the old path', async () => {
    open();
    write(stroke(1));
    await auto.withSavesPaused(async () => {
      const rec = disk.get(PATH) as NoteRecord;
      disk.delete(PATH);
      disk.set('F/m.json', { ...rec, path: 'F/m.json' });
      note.set(note.groups, 'F/m.json');
    });
    write(stroke(2));
    await settle();
    expect(disk.has(PATH)).toBe(false);
    expect(ids('F/m.json')).toEqual([1, 2]);
  });
});

describe('fingerprint', () => {
  it('matches across a structured clone and changes with any edit', () => {
    const g = { ...stroke(1), dataUrl: 'data:' + 'x'.repeat(5000) } as Group;
    const fp = fingerprintGroup(g);
    expect(fingerprintGroup(structuredClone(g))).toBe(fp);
    const moved = structuredClone(g);
    moved.stroke[1].x += 1;
    expect(fingerprintGroup(moved)).not.toBe(fp);
    const late = structuredClone(g);
    late.crop = { sx: 0.1, sy: 0, sw: 1, sh: 1 };
    expect(fingerprintGroup(late)).not.toBe(fp);
  });
});
