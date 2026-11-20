// Generates the five M3 prototype rooms (public/rooms/proto-1.json ... proto-5.json) as Tiled maps
// from the layouts in the "Prototype Room Designs (issue 3.1)" doc. Run: node tools/make-prototype-rooms.mjs
// After this first generation the JSON files are the source of truth; edit them in Tiled.
//
// Legend: # solid  ~ water  I ice  ^ spikes  B/R spawn (feet on the tile below)
//         P reacting platform on land  S platform sunk in water  O portal  . air
import { writeFileSync, readFileSync } from 'node:fs';

const W = 30, H = 17, T = 16;
const ROOMS = [
  { key: 'proto-1', name: 'Up together', step: true, rows: [
    '..............................', '..............................', '..............................',
    '..............................', '..............................', '..............................',
    '..............................', '........................OOO...', '........................OOO...',
    '....................##########', '....................##########', '....................##########',
    '...B.R...........PP.##########', '##############################', '##############################',
    '##############################', '##############################'] },
  { key: 'proto-2', name: 'Wide water', rows: [
    '..............................', '..............................', '..............................',
    '..............................', '..............................', '..............................',
    '..............................', '..............................', '..............................',
    '..............................', '..............................', '.........................OOO..',
    '..B.R....................OOO..', '#########..........###########', '#########~~~~~~~~~~###########',
    '#########~~~~SS~~~~###########', '##############################'] },
  { key: 'proto-3', name: 'The ice door', rows: [
    '.................###..........', '.................###..........', '.................###..........',
    '.................###..........', '.................###..........', '.................###..........',
    '.................###..........', '..............................', '..............................',
    '..................I...........', '..................I...........', '..................I......OOO..',
    '...B.R..........PPI......OOO..', '##############################', '##############################',
    '##############################', '##############################'] },
  { key: 'proto-4', name: 'Across and through', rows: [
    '##############################', '........................I.....', '........................I.....',
    '........................I.....', '........................I.....', '........................I.....',
    '........................I.....', '........................I.....', '........................I.....',
    '........................I.....', '........................I.....', '........................I.OOO.',
    '..B.R.................PPI.OOO.', '#######..........#############', '#######~~~~~~~~~~#############',
    '#######~~~~SS~~~~#############', '##############################'] },
  { key: 'proto-5', name: 'Who touches first', step: true, rows: [
    '..............................', '..............................', '..............................',
    '..............................', '..............................', '..............................',
    '.........................OOO..', '.........................OOO..', '......................########',
    '......................########', '......................########', '......................########',
    '...B.R...PP........PP.########', '##############################', '##############################',
    '##############################', '##############################'] },
];

const GID = { '#': 1, '~': 2, 'S': 2, 'I': 3, '^': 4 };
const template = JSON.parse(readFileSync('public/rooms/test-room.json', 'utf8'));

for (const room of ROOMS) {
  if (room.rows.length !== H || room.rows.some((r) => r.length !== W)) throw new Error(`${room.key}: grid must be ${W}x${H}`);
  const at = (c, r) => room.rows[r][c];
  const data = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) data.push(GID[at(c, r)] || 0);

  const objects = [];
  let id = 1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = at(c, r);
      if (ch === 'B' || ch === 'R') {
        objects.push({ id: id++, name: ch === 'B' ? 'blue' : 'red', type: 'spawn', point: true, x: c * T + 8, y: (r + 1) * T, width: 0, height: 0, rotation: 0, visible: true });
      }
      // Platforms: each horizontal run of P or S becomes one object.
      if ((ch === 'P' || ch === 'S') && (c === 0 || at(c - 1, r) !== ch)) {
        let end = c;
        while (end + 1 < W && at(end + 1, r) === ch) end++;
        const width = (end - c + 1) * T;
        const h = ch === 'P' && room.step ? T : 8; // steps are a full tile tall; slabs and sunken platforms 8 px
        const y = (r + 1) * T - h; // resting on the tile below
        objects.push({ id: id++, name: `platform-${id - 1}`, type: 'platform', x: c * T, y, width, height: h, rotation: 0, visible: true,
          properties: [{ name: 'reacts', type: 'bool', value: true }] });
      }
    }
  }
  // Portal: bounding box of the O tiles.
  const os = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(c, r) === 'O') os.push([c, r]);
  const c0 = Math.min(...os.map((o) => o[0])), c1 = Math.max(...os.map((o) => o[0]));
  const r0 = Math.min(...os.map((o) => o[1])), r1 = Math.max(...os.map((o) => o[1]));
  objects.push({ id: id++, name: 'exit', type: 'portal', x: c0 * T, y: r0 * T, width: (c1 - c0 + 1) * T, height: (r1 - r0 + 1) * T, rotation: 0, visible: true });

  const map = JSON.parse(JSON.stringify(template));
  map.properties = [
    { name: 'name', type: 'string', value: room.name },
    { name: 'goal', type: 'string', value: 'all-in-portal' },
    { name: 'background', type: 'string', value: 'proto-bg' },
  ];
  map.layers[0].data = data;
  map.layers[1].objects = objects;
  map.nextobjectid = id;
  writeFileSync(`public/rooms/${room.key}.json`, JSON.stringify(map, null, 1) + '\n');
  console.log(`${room.key}: ${objects.length} objects`);
}
