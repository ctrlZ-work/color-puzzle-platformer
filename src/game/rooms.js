// The rooms in play order. Solving a room unlocks the next one in this list.
// Each key is a Tiled map in public/rooms/<key>.json.

// The M3 prototype rooms (designs: "Prototype Room Designs (issue 3.1)" in the Drive project folder).
export const PROTOTYPE_ROOMS = [
  { key: 'proto-1', title: 'Room 1: Up together' },
  { key: 'proto-2', title: 'Room 2: Wide water' },
  { key: 'proto-3', title: 'Room 3: The ice door' },
  { key: 'proto-4', title: 'Room 4: Across and through' },
  { key: 'proto-5', title: 'Room 5: Who touches first' },
];

// The M2 test rooms, kept for the automated system checks. Open the game with ?rooms=test to play them.
export const TEST_ROOMS = [
  { key: 'test-room', title: 'Test room 1: across the water' },
  { key: 'test-room-2', title: 'Test room 2: the hot platform' },
];

function chosenSet() {
  try {
    return new URLSearchParams(globalThis.location.search).get('rooms');
  } catch {
    return null;
  }
}

export const ROOMS = chosenSet() === 'test' ? TEST_ROOMS : PROTOTYPE_ROOMS;
