# Room format

Each room is one [Tiled](https://www.mapeditor.org) map saved as JSON in `public/rooms/<room-key>.json`. The game loads it by its key (the file name without `.json`). New rooms start as a copy of `public/rooms/test-room.json`, the template room.

## Map settings

- Orthogonal map, 16x16 tiles, 30 tiles wide and 17 tall (the 480x270 screen; the bottom row is partly off screen).
- Tileset: `public/assets/tiles.png`, embedded in the map, named `tiles`. The game always loads the image under that name, so the image path in the map only matters to the Tiled editor.

## Layers (names must match)

1. **`terrain`** (tile layer). Every tile's behavior comes from the tileset's `kind` property:

   | Tile | `kind` | Behavior |
   |---|---|---|
   | 1 | `solid` | Ground and walls. Colors stand on it and can't pass through. |
   | 2 | `water` | Blue floats at the top of a water column and can dive. A color that can't swim (Red) that sinks into it sends the colors back to their starts. |
   | 3 | `ice` | Solid for now. Issue 2.3 lets a hot object melt ice next to it. |
   | 4 | `spikes` | Touching the lower part of the tile sends the colors back to their starts. |

   Keep water a little below the ground beside it (the template uses 16 px), so a floating Blue sits level with the ground and Red can step onto it.

2. **`objects`** (object layer). Every object keeps the stable ID Tiled gives it, and the game looks objects up by that ID.

   | Type | Shape | Meaning |
   |---|---|---|
   | `spawn` | point, named `blue` or `red` | Where that color starts, at its feet (bottom centre). A color without a spawn point isn't in the room. |
   | `platform` | rectangle | A black-and-white platform that colors can stand on. Custom property `reacts` (bool): whether colors react with it (issue 2.3). |

## Room rules the game applies

- Falling off the bottom of the room, spikes, or a non-swimmer sinking in water: every color goes back to its spawn point. Objects keep their current state.
- Restart (R, or the gamepad's Back/Select button): the whole room reloads from this file, so objects are back as authored and the colors are back at their spawns.
- Blue is always the active color when a room starts.
