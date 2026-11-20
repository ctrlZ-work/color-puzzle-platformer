// One color character: a simple code-built shape with an Arcade physics body.
// Abilities per color live in COLORS; the spec gives each color one physical ability.

const SIZE = 16;

export const COLORS = {
  // Blue is the starting color and is a circle (Gabrielle, 2026-11-19). It swims and floats,
  // and can carry another color across water.
  blue: { fill: 0x3a6ee0, shape: 'circle', jumpSpeed: 320, swims: true },
  // Red jumps high. A square, so it is told apart from Blue by shape, not only hue.
  red: { fill: 0xe03a3a, shape: 'square', jumpSpeed: 440, swims: false },
  // Yellow's shape is reserved here so it never looks like Blue or Red; its glow ability arrives in 4.1.
  yellow: { fill: 0xe8c93a, shape: 'triangle', jumpSpeed: 320, swims: false },
};

// Colors in the order they're listed above; the first one present in a room starts active.
export const COLOR_ORDER = Object.keys(COLORS);

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

    const h = SIZE / 2;
    const shapes = {
      circle: () => scene.add.circle(x, y, h, this.def.fill),
      square: () => scene.add.rectangle(x, y, SIZE, SIZE, this.def.fill),
      triangle: () => scene.add.triangle(x, y, 0, SIZE, h, 0, SIZE, SIZE, this.def.fill),
    };
    this.sprite = shapes[this.def.shape]();
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
