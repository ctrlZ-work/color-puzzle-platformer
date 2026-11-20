# Room format

Each room is one [Tiled](https://www.mapeditor.org) map saved as JSON in `public/rooms/<room-key>.json`. The game loads it by its key (the file name without `.json`). New rooms start as a copy of `public/rooms/test-room.json`, the template room. The play order of rooms is the list in `src/game/rooms.js`.

## Map settings

- Orthogonal map, 16x16 tiles, 30 tiles wide and 17 tall (the 480x270 screen; the bottom row is partly off screen).
- Tileset: `public/assets/tiles.png`, embedded in the map, named `tiles`. The game always loads the image under that name, so the image path in the map only matters to the Tiled editor.

## Map properties (the room's goal)

Every room declares its goal as an end state in the map's custom properties. The game checks it every frame, so any route or order that reaches the end state counts.

| Property | Type | Meaning |
|---|---|---|
| `goal` | string | `all-in-portal`: every color standing inside the portal. `object-effect`: one object has a given reaction. |
| `goalObject` | int | For `object-effect`: the Tiled ID of the object. |
| `goalEffect` | string | For `object-effect`: the effect it must have (`hot`, `float`, ...). |
| `background` | string | Optional. Names a background pair in `public/assets/backgrounds/`: `<name>.png` (color) and `<name>-bw.png` (black-and-white, same size). The room starts black-and-white and fades to color as it's restored (see Room rules). |

## Layers (names must match)

1. **`terrain`** (tile layer). Every tile's behavior comes from the tileset's `kind` property:

   | Tile | `kind` | Behavior |
   |---|---|---|
   | 1 | `solid` | Ground and walls. Colors stand on it and can't pass through. |
   | 2 | `water` | Blue floats at the top of a water column and can dive. A color that can't swim (Red) that sinks into it sends the colors back to their starts. |
   | 3 | `ice` | Solid. A hot object melts the ice touching it, and any ice connected to that. |
   | 4 | `spikes` | Touching the lower part of the tile sends the colors back to their starts. |

   Keep water a little below the ground beside it (the template uses 16 px). A floating Blue then sits 8 px below the ground: Red can step down onto it, and has to hop to get off onto the ground.

2. **`objects`** (object layer). Every object keeps the stable ID Tiled gives it, and the game looks objects up by that ID.

   | Type | Shape | Meaning |
   |---|---|---|
   | `spawn` | point, named after a color (`blue`, `red`, later `yellow`) | Where that color starts, at its feet (bottom centre). A color without a spawn point isn't in the room. |
   | `platform` | rectangle | A black-and-white platform that colors can stand on. Custom property `reacts` (bool): whether colors react with it. Any other object type that has a row in `src/game/reactions.js` is placed the same way. |
| `portal` | rectangle | The exit portal. Gray and closed until the room's goal is met; then it turns violet and opens, and the active color standing in it can use it (E/Enter or gamepad X) to open the travel screen. |

## Color reactions

What an object becomes when a color touches it is set in `src/game/reactions.js` (object type x color). The first color to touch an object decides, and it stays that way until the room restarts. Current reactions for `platform`:

- Red: hot. It turns red, melts the ice touching it, and can no longer be stood on.
- Blue: floating. It turns blue, and if it's in water it rises to the surface, where colors can stand on it. A color swimming in the water passes under or beside a floating platform; it gets on top by jumping.
- Yellow: glowing (defined, not used until Yellow exists).

## Movement numbers for room design

From the movement settings in `src/game/ColorCharacter.js` (gravity 900, run speed 110), with the jump heights and Red's gap measured in the test room (16 px tiles):

- Blue's jump rises about 54 px (just over 3 tiles); Red's rises about 104 px (6.5 tiles).
- Red's running jump crosses about 107 px (6.5 tiles) of gap; Blue's about 78 px (worked out, not measured). A 6-tile (96 px) pool can be jumped by Red alone, so a water crossing meant to need Blue must be wider than 7 tiles.
- Blue standing on Red gains 16 px, so Blue reaches about 70 px above the ground Red stands on.

## Room rules the game applies

- Falling off the bottom of the room, spikes, or a non-swimmer sinking in water: every color goes back to its spawn point. Objects keep their current state.
- The room's left and right edges are walls. Colors stand on each other only by landing on top: a color jumping upward passes through a color above it instead of picking it up, and a color can't jump off another color that is in mid-air.
- Restart (R, or the gamepad's Back/Select button): the whole room reloads from this file, so objects are back as authored and the colors are back at their spawns.
- Blue is always the active color when a room starts.
- A room that's already solved starts with its portal open, so returning to it never traps the player.
- Background fade: each reacting object a color has touched counts one part of the room's color, and the open portal one more; the color background's opacity follows that share, so a solved room is in full color.
- Meeting the goal marks the room solved and unlocks the next room in `src/game/rooms.js`. Progress (unlocked rooms, solved rooms, current room) is saved in the browser's localStorage.

## Room lists

`src/game/rooms.js` holds the play order. The game plays the prototype rooms (`proto-1` to `proto-5`, generated once by `tools/make-prototype-rooms.mjs` from the issue 3.1 designs; the JSON files are now the source of truth). Opening the game with `?rooms=test` plays the M2 test rooms instead, which the systems check uses. Both lists share one save slot; a save from the other list falls back to that list's first room.
