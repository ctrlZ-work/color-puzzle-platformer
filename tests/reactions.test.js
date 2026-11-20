import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchObject, REACTIONS } from '../src/game/reactions.js';

const platform = () => ({ type: 'platform', reacts: true, touchedBy: null });

test('the first color to touch an object decides its reaction', () => {
  const p = platform();
  assert.equal(touchObject(p, 'red'), REACTIONS.platform.red);
  assert.equal(p.touchedBy, 'red');
});

test('a second color touching it has no effect, and neither does the same color again', () => {
  const p = platform();
  touchObject(p, 'blue');
  assert.equal(touchObject(p, 'red'), null);
  assert.equal(touchObject(p, 'blue'), null);
  assert.equal(p.touchedBy, 'blue');
});

test('objects that do not react, and colors with no reaction, change nothing', () => {
  const still = { type: 'platform', reacts: false, touchedBy: null };
  assert.equal(touchObject(still, 'red'), null);
  assert.equal(still.touchedBy, null);
  const p = platform();
  assert.equal(touchObject(p, 'green'), null);
  assert.equal(p.touchedBy, null);
});
