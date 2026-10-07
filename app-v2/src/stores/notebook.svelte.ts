// ─────────────────────────────────────────────────────────────────────────────
// Notebook store — folders + notes-in-current-folder, reactive for the shelf.
// ─────────────────────────────────────────────────────────────────────────────

import type { FolderSummary, NoteListEntry } from '$types/note';

let _folders = $state<FolderSummary[]>([]);
let _notesInFolder = $state<NoteListEntry[]>([]);
let _loading = $state<boolean>(false);

export const notebook = {
  get folders() {
    return _folders;
  },
  get notesInFolder() {
    return _notesInFolder;
  },
  get loading() {
    return _loading;
  },

  setFolders(f: FolderSummary[]) {
    _folders = f;
  },
  setNotesInFolder(n: NoteListEntry[]) {
    _notesInFolder = n;
  },
  setLoading(v: boolean) {
    _loading = v;
  },
};
