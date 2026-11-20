// One color character: a simple code-built shape with an Arcade physics body.
// Abilities per color live in COLORS; the spec gives each color one physical ability.

const SIZE = 16;

export const COLORS = {
  // Blue is the starting color and is a circle (Gabrielle, 2026-11-19). It swims and floats,
  // and can carry another color across water.
  blue: { fill: 0x3a6ee0, shape: 'circle', jumpSpeed: 320, swims: true },
  // Red jumps high. A square, so it is told apart from Blue by shape, not only hue.
  red: { fill: 0xe03a3a, shape: 'square', jumpSpeed: 440, swims: false },
};

export const MOVE_SPEED = 110;
export const SWIM_SPEED = 80;
export const COYOTE_MS = 100; // jump still allowed this long after leaving a ledge
export const JUMP_BUFFER_MS = 120; // a jump pressed this long before landing still happens

export class ColorCharacter {
  constructor(scene, name, x, y) {
    this.scene = scene;
    this.name = name;
    this.def = COLORS[name];
    this.startX = x;
    this.startY = y;

    this.sprite =
      this.def.shape === 'circle'
        ? scene.add.circle(x, y, SIZE / 2, this.def.fill)
        : scene.add.rectangle(x, y, SIZE, SIZE, this.def.fill);
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body;
    this.body.setSize(SIZE, SIZE);
    this.body.setMaxVelocity(400, 600);

    this.lastGroundedAt = -Infinity;
    this.jumpRequestedAt = -Infinity;
    this.jumpedAt = -Infinity;
    this.inWater = false;
    this.atSurface = false;
    this.supporter = null; // the character this one is standing on, if any
  }

  get onGround() {
    return this.body.blocked.down || this.supporter !== null || this.atSurface;
  }

  respawn() {
    this.body.reset(this.startX, this.startY);
    this.lastGroundedAt = -Infinity;
    this.jumpRequestedAt = -Infinity;
  }
}
