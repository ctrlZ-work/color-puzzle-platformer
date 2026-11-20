// Progress saved in the browser (localStorage). The save holds which rooms are unlocked,
// which have been solved, and the room the player was last in.
// Rules: the first room is always unlocked; solving a room unlocks the next room in ROOMS;
// New game clears everything.

export const SAVE_KEY = 'color-puzzle-platformer-save-v1';

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function freshSave(rooms) {
  return { unlocked: [rooms[0].key], solved: [], current: rooms[0].key };
}

export function loadSave(rooms, store = storage()) {
  try {
    const raw = store && store.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.unlocked) || !Array.isArray(s.solved)) return null;
    if (!s.unlocked.includes(rooms[0].key)) s.unlocked.unshift(rooms[0].key);
    return s;
  } catch {
    return null;
  }
}

export function writeSave(save, store = storage()) {
  try {
    if (store) store.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable (private mode, blocked); the game still plays without saving.
  }
}

export function clearSave(store = storage()) {
  try {
    if (store) store.removeItem(SAVE_KEY);
  } catch {
    /* see writeSave */
  }
}

// Marks a room solved and unlocks the next one. Returns the same save object.
export function markSolved(save, rooms, key) {
  if (!save.solved.includes(key)) save.solved.push(key);
  const i = rooms.findIndex((r) => r.key === key);
  const next = rooms[i + 1];
  if (next && !save.unlocked.includes(next.key)) save.unlocked.push(next.key);
  return save;
}
