import Phaser from 'phaser';
import { Controls } from '../game/Controls.js';

// A simple vertical menu used by the title and travel screens.
// Subclasses set this.heading and this.items ([{ label, action }]) in buildMenu().
export class MenuScene extends Phaser.Scene {
  create() {
    this.controls = new Controls(this);
    this.selected = 0;
    this.buildMenu();
    const { width } = this.scale;
    this.add.text(width / 2, 50, this.heading, { fontFamily: 'monospace', fontSize: '14px', color: '#eeeeee' }).setOrigin(0.5);
    this.labels = this.items.map((item, i) =>
      this.add.text(width / 2, 100 + i * 20, item.label, { fontFamily: 'monospace', fontSize: '10px', color: '#bbbbbb' }).setOrigin(0.5),
    );
    this.add
      .text(width / 2, 250, this.hint || 'Up/Down to choose, Enter or A to confirm', { fontFamily: 'monospace', fontSize: '8px', color: '#888888' })
      .setOrigin(0.5);
    this.refresh();
    this.ready = true; // for automated checks
  }

  refresh() {
    this.labels.forEach((t, i) => {
      t.setColor(i === this.selected ? '#ffffff' : '#888888');
      t.setText((i === this.selected ? '> ' : '  ') + this.items[i].label);
    });
  }

  update() {
    const c = this.controls;
    c.update();
    if (c.menuUp) this.selected = (this.selected + this.items.length - 1) % this.items.length;
    if (c.menuDown) this.selected = (this.selected + 1) % this.items.length;
    if (c.menuUp || c.menuDown) this.refresh();
    if (c.confirmPressed) this.items[this.selected].action();
    else if (c.backPressed && this.onBack) this.onBack();
  }
}
