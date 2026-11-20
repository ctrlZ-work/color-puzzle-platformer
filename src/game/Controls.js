import Phaser from 'phaser';

// Keyboard and gamepad read together, so every control works on both.
// Keyboard: arrows or WASD to move, Space / Up / W to jump, Q or Tab to switch color, S / Down to dive,
//   R to restart the room, E or Enter to use a portal or confirm, Esc to go back.
// Gamepad (standard layout): d-pad or left stick to move, A to jump or confirm, Y or a shoulder button
//   to switch, down to dive, Back/Select to restart, X to use a portal, B to go back.
export class Controls {
  constructor(scene) {
    this.scene = scene;
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,Q,TAB,R,E,ENTER,ESC');
    kb.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    this.prevPad = {};
  }

  pad() {
    const gp = this.scene.input.gamepad;
    return gp && gp.total > 0 ? gp.getPad(0) : null;
  }

  // True only on the frame a gamepad input goes from up to down.
  padEdge(name, down) {
    const was = this.prevPad[name];
    this.prevPad[name] = down;
    return down && !was;
  }

  // Call once per frame before reading the values below.
  update() {
    const k = this.keys;
    const jd = Phaser.Input.Keyboard.JustDown;
    const pad = this.pad();
    const btn = (i) => !!(pad && pad.buttons[i] && pad.buttons[i].pressed);
    const stickX = pad ? pad.leftStick.x : 0;
    const stickY = pad ? pad.leftStick.y : 0;
    const padUp = !!(pad && (pad.up || stickY < -0.5));
    const padDown = !!(pad && (pad.down || stickY > 0.5));

    this.left = k.LEFT.isDown || k.A.isDown || (pad && (pad.left || stickX < -0.4));
    this.right = k.RIGHT.isDown || k.D.isDown || (pad && (pad.right || stickX > 0.4));
    this.down = k.DOWN.isDown || k.S.isDown || padDown;

    // JustDown is true only once per key press, so read each key's edge once.
    const e = {};
    for (const name of ['SPACE', 'UP', 'W', 'DOWN', 'S', 'Q', 'TAB', 'R', 'E', 'ENTER', 'ESC']) e[name] = jd(k[name]);
    const padA = this.padEdge('a', btn(0));

    this.jumpHeld = k.SPACE.isDown || k.UP.isDown || k.W.isDown || btn(0);
    this.jumpPressed = e.SPACE || e.UP || e.W || padA;
    this.switchPressed = e.Q || e.TAB || this.padEdge('switch', btn(3) || btn(4) || btn(5));
    this.restartPressed = e.R || this.padEdge('back', btn(8));
    this.usePressed = e.E || e.ENTER || this.padEdge('x', btn(2));

    // Menu navigation (title and travel screens).
    this.menuUp = e.UP || e.W || this.padEdge('up', padUp);
    this.menuDown = e.DOWN || e.S || this.padEdge('down', padDown);
    this.confirmPressed = e.ENTER || e.E || e.SPACE || padA;
    this.backPressed = e.ESC || this.padEdge('b', btn(1));
  }
}
