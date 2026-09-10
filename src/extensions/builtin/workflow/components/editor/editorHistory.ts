export interface EditorHistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  cleanRevision: string;
}

function revision(value: unknown): string {
  return JSON.stringify(value);
}

export function createEditorHistory<T>(initial: T): EditorHistoryState<T> {
  return { past: [], present: structuredClone(initial), future: [], cleanRevision: revision(initial) };
}

export function commitEditorHistory<T>(state: EditorHistoryState<T>, next: T, limit = 50): EditorHistoryState<T> {
  if (revision(state.present) === revision(next)) return state;
  return {
    ...state,
    past: [...state.past, structuredClone(state.present)].slice(-limit),
    present: structuredClone(next),
    future: [],
  };
}

export function replaceEditorPresent<T>(state: EditorHistoryState<T>, next: T): EditorHistoryState<T> {
  return { ...state, present: structuredClone(next) };
}

export function undoEditorHistory<T>(state: EditorHistoryState<T>): EditorHistoryState<T> {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    ...state,
    past: state.past.slice(0, -1),
    present: structuredClone(previous),
    future: [structuredClone(state.present), ...state.future],
  };
}

export function redoEditorHistory<T>(state: EditorHistoryState<T>): EditorHistoryState<T> {
  const next = state.future[0];
  if (!next) return state;
  return {
    ...state,
    past: [...state.past, structuredClone(state.present)].slice(-50),
    present: structuredClone(next),
    future: state.future.slice(1),
  };
}

export function markEditorHistoryClean<T>(state: EditorHistoryState<T>): EditorHistoryState<T> {
  return { ...state, cleanRevision: revision(state.present) };
}

export function isEditorHistoryDirty<T>(state: EditorHistoryState<T>): boolean {
  return state.cleanRevision !== revision(state.present);
}
