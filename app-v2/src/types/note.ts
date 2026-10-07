// ─────────────────────────────────────────────────────────────────────────────
// Note + folder data model. One note = one IndexedDB record at `path`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from './group';

export interface SummaryMetadata {
  folderName: string;
  selectedOptions: {
    includeTitle1?: boolean;
    includeTitle2?: boolean;
    includeTitle3?: boolean;
    includeBox?: boolean;
    includeCurly?: boolean;
    includeSquareBracket?: boolean;
    includeWavyBracket?: boolean;
    includeCircleBracket?: boolean;
  };
  importantItemCount: number;
}

export interface NoteRecord {
  /** path in the form "Folder/NoteName.json" or "Folder/__folder__.meta" */
  path: string;
  content: Group[];
  created_at: string;
  isSummaryNote?: boolean;
  summaryMetadata?: SummaryMetadata;
}

export interface FolderSummary {
  name: string;
  noteCount: number;
}

export interface NoteListEntry {
  path: string;
  createdAt: string;
  isSummaryNote: boolean;
}
