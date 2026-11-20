import Phaser from 'phaser';

// Keyboard and gamepad read together, so every control works on both.
// Keyboard: arrows or WASD to move, Space / Up / W to jump, Q or Tab to switch color, S / Down to dive, R to restart the room.
// Gamepad: d-pad or left stick to move, A (bottom face button) to jump, Y or a shoulder button to switch, down to dive, Back/Select to restart.
export class Controls {
  constructor(scene) {
    this.scene = scene;
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Q,TAB,R');
    kb.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    this.prevPadJump = false;
    this.prevPadSwitch = false;
    this.prevPadRestart = false;
    this.jumpPressed = false;
    this.switchPressed = false;
  }

  pad() {
    const gp = this.scene.input.gamepad;
    return gp && gp.total > 0 ? gp.getPad(0) : null;
  }

  // Call once per frame before reading the values below.
  update() {
    const k = this.keys;
    const pad = this.pad();
    const stickX = pad ? pad.leftStick.x : 0;
    const stickY = pad ? pad.leftStick.y : 0;

    this.left = k.LEFT.isDown || k.A.isDown || (pad && (pad.left || stickX < -0.4));
    this.right = k.RIGHT.isDown || k.D.isDown || (pad && (pad.right || stickX > 0.4));
    this.down = k.DOWN.isDown || k.S.isDown || (pad && (pad.down || stickY > 0.5));

    const padJump = !!(pad && pad.A);
    const padSwitch = !!(pad && (pad.Y || pad.L1 || pad.R1));
    const padRestart = !!(pad && pad.buttons[8] && pad.buttons[8].pressed); // Back / Select
    this.restartPressed = Phaser.Input.Keyboard.JustDown(k.R) || (padRestart && !this.prevPadRestart);
    this.prevPadRestart = padRestart;
    this.jumpHeld = k.SPACE.isDown || k.UP.isDown || k.W.isDown || padJump;
    this.jumpPressed =
      Phaser.Input.Keyboard.JustDown(k.SPACE) ||
      Phaser.Input.Keyboard.JustDown(k.UP) ||
      Phaser.Input.Keyboard.JustDown(k.W) ||
      (padJump && !this.prevPadJump);
    this.switchPressed =
      Phaser.Input.Keyboard.JustDown(k.Q) ||
      Phaser.Input.Keyboard.JustDown(k.TAB) ||
      (padSwitch && !this.prevPadSwitch);

    this.prevPadJump = padJump;
    this.prevPadSwitch = padSwitch;
  }
}
