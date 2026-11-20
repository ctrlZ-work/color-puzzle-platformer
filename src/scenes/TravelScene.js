import { MenuScene } from './MenuScene.js';
import { ROOMS } from '../game/rooms.js';
import { loadSave, freshSave } from '../game/save.js';

// The travel portal's choice screen: pick any unlocked room.
export class TravelScene extends MenuScene {
  constructor() {
    super('Travel');
  }

  init(data) {
    this.from = data && data.from;
  }

  buildMenu() {
    this.heading = 'Where to?';
    this.hint = 'Up/Down to choose, Enter or A to travel, Esc or B to stay';
    const save = loadSave(ROOMS) || freshSave(ROOMS);
    this.items = ROOMS.filter((r) => save.unlocked.includes(r.key)).map((r) => ({
      label: r.title + (save.solved.includes(r.key) ? '  (solved)' : ''),
      key: r.key,
      action: () => this.scene.start('Room', { room: r.key }),
    }));
    // Start on the room after the one we came from, if it's unlocked (reset each visit).
    this.selectedStart = 0;
    const fromIndex = this.items.findIndex((i) => i.key === this.from);
    if (fromIndex >= 0 && fromIndex + 1 < this.items.length) this.selectedStart = fromIndex + 1;
    // Back out: the room underneath was only paused, so it carries on exactly as it was.
    this.onBack = () => {
      this.scene.stop();
      this.scene.resume('Room');
    };
  }

  create() {
    super.create();
    if (this.selectedStart) {
      this.selected = this.selectedStart;
      this.refresh();
    }
  }
}
