import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, loadSave, writeSave, clearSave, markSolved } from '../src/game/save.js';

const ROOMS = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('a new game has only the first room unlocked', () => {
  assert.deepEqual(freshSave(ROOMS), { unlocked: ['a'], solved: [], current: 'a' });
});

test('solving a room unlocks the next one, once', () => {
  const s = freshSave(ROOMS);
  markSolved(s, ROOMS, 'a');
  markSolved(s, ROOMS, 'a');
  assert.deepEqual(s.unlocked, ['a', 'b']);
  assert.deepEqual(s.solved, ['a']);
});

test('progress survives a save and load; clearing it means no save', () => {
  const store = memoryStore();
  const s = markSolved(freshSave(ROOMS), ROOMS, 'a');
  s.current = 'b';
  writeSave(s, store);
  assert.deepEqual(loadSave(ROOMS, store), s);
  clearSave(store);
  assert.equal(loadSave(ROOMS, store), null);
});

test('rooms that no longer exist are dropped, and the current room falls back to the first', () => {
  const store = memoryStore();
  store.setItem('color-puzzle-platformer-save-v1', JSON.stringify({ unlocked: ['a', 'gone'], solved: ['gone'], current: 'gone' }));
  assert.deepEqual(loadSave(ROOMS, store), { unlocked: ['a'], solved: [], current: 'a' });
});

test('a damaged save is ignored', () => {
  const store = memoryStore();
  store.setItem('color-puzzle-platformer-save-v1', '{not json');
  assert.equal(loadSave(ROOMS, store), null);
});
