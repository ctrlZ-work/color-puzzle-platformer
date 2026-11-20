// The reaction table: object type x color -> what the object becomes.
// Any object type listed here can be placed in a Tiled room and will react. Each `effect` names a
// behavior in the EFFECTS list in RoomScene.js; `mark` is the pattern drawn on the object so the
// change can be read without telling hues apart (zigzag, waves or dots).

export const REACTIONS = {
  platform: {
    red: { effect: 'hot', fill: 0xe03a3a, mark: 'zigzag' }, // melts ice next to it; can't be stood on
    blue: { effect: 'float', fill: 0x3a6ee0, mark: 'waves' }, // floats up to the surface when it's in water
    yellow: { effect: 'glow', fill: 0xe8c93a, mark: 'dots' }, // defined now, used from issue 4.1
  },
};

// Core rule: the first color to touch an object decides what it becomes, for the rest of
// the room. Returns the reaction to apply, or null if nothing should happen.
export function touchObject(obj, color) {
  if (!obj.reacts || obj.touchedBy) return null;
  const reaction = (REACTIONS[obj.type] || {})[color];
  if (!reaction) return null;
  obj.touchedBy = color;
  return reaction;
}
