import { MenuScene } from './MenuScene.js';
import { ROOMS } from '../game/rooms.js';
import { loadSave, freshSave, writeSave, clearSave } from '../game/save.js';

export class TitleScene extends MenuScene {
  constructor() {
    super('Title');
  }

  buildMenu() {
    this.heading = 'Color Puzzle Platformer (working title)';
    const save = loadSave(ROOMS);
    this.items = [];
    if (save) this.items.push({ label: 'Continue', action: () => this.scene.start('Room', { room: save.current }) });
    this.items.push({
      label: 'New game',
      action: () => {
        clearSave();
        writeSave(freshSave(ROOMS));
        this.scene.start('Room', { room: ROOMS[0].key });
      },
    });
  }
}
