import Phaser from 'phaser';

// Placeholder scene for issue 1.1: proves the engine, physics and build work.
// A black-and-white floor with one red square that falls and lands on it.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const { width, height } = this.scale;

    const floor = this.add.rectangle(width / 2, height - 10, width, 20, 0xdddddd);
    this.physics.add.existing(floor, true);

    const red = this.add.rectangle(width / 2, 40, 16, 16, 0xe03a3a);
    this.physics.add.existing(red);
    this.physics.add.collider(red, floor);

    this.add
      .text(width / 2, height / 2 - 20, 'Color Puzzle Platformer\n(working title)', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#eeeeee',
        align: 'center',
      })
      .setOrigin(0.5);

    // Exposed for automated checks: true once the red square has landed.
    this.landed = false;
    this.red = red;
  }

  update() {
    if (!this.landed && this.red.body.blocked.down) {
      this.landed = true;
    }
  }
}
