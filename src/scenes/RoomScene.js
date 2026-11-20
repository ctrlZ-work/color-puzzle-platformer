import Phaser from 'phaser';
import { Controls } from '../game/Controls.js';
import {
  ColorCharacter,
  MOVE_SPEED,
  SWIM_SPEED,
  COYOTE_MS,
  JUMP_BUFFER_MS,
} from '../game/ColorCharacter.js';

// Plays one room loaded from a Tiled JSON file (format described in docs/room-format.md).
// Restart (R, or the gamepad's Back/Select button) reloads the room exactly as authored.
// Falling out of the room, spikes, or a non-swimmer sinking in water send every color
// back to its start point; objects keep their state (that's what restart is for).

const TILE = 16;

export class RoomScene extends Phaser.Scene {
  constructor() {
    super('Room');
  }

  init(data) {
    this.roomKey = (data && data.room) || 'test-room';
  }

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    this.load.tilemapTiledJSON(this.roomKey, `rooms/${this.roomKey}.json`);
  }

  create() {
    const map = this.make.tilemap({ key: this.roomKey });
    this.map = map;
    const tileset = map.addTilesetImage('tiles', 'tiles');
    this.terrain = map.createLayer('terrain', tileset, 0, 0);
    this.terrain.setCollisionByProperty({ kind: ['solid', 'ice'] });

    // Water is drawn above the colors so Blue looks half under the surface.
    this.terrain.forEachTile((t) => {
      if (this.kindOf(t) !== 'water') return;
      t.setVisible(false);
      this.add.rectangle(t.pixelX, t.pixelY, TILE, TILE, 0x6f6f6f, 0.8).setOrigin(0, 0).setDepth(2);
    });

    // Objects from the Tiled object layer, keyed by their stable Tiled ID.
    this.objectsById = new Map();
    this.objectGroup = this.physics.add.staticGroup();
    const spawns = {};
    for (const o of map.getObjectLayer('objects').objects) {
      const props = Object.fromEntries((o.properties || []).map((p) => [p.name, p.value]));
      if (o.type === 'spawn') {
        spawns[o.name] = { x: o.x, y: o.y };
      } else if (o.type === 'platform') {
        // Black-and-white platform; its color reactions are added in issue 2.3.
        const r = this.add.rectangle(o.x, o.y, o.width, o.height, 0xbdbdbd).setOrigin(0, 0);
        r.setStrokeStyle(1, 0x7a7a7a);
        this.objectGroup.add(r);
        this.objectsById.set(o.id, { id: o.id, name: o.name, type: o.type, props, sprite: r });
      }
    }

    // Spawn points are the bottom-centre of each color. Blue starts active.
    const order = ['blue', 'red'].filter((n) => spawns[n]);
    this.chars = order.map((n) => new ColorCharacter(this, n, spawns[n].x, spawns[n].y - 8));
    for (const c of this.chars) {
      this.physics.add.collider(c.sprite, this.terrain);
      this.physics.add.collider(c.sprite, this.objectGroup);
    }
    this.activeIndex = 0;
    this.hazardResets = 0;

    this.marker = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 5, 0xffffff).setDepth(3);
    this.controls = new Controls(this);
    this.add
      .text(
        8,
        6,
        'Move: arrows/WASD or stick   Jump: Space/Up or A   Switch: Q/Tab or Y\nDive: Down   Restart room: R or Back',
        { fontFamily: 'monospace', fontSize: '8px', color: '#bbbbbb' },
      )
      .setDepth(3);

    this.ready = true; // for automated checks
  }

  kindOf(tile) {
    return tile && tile.index > 0 && tile.properties ? tile.properties.kind : null;
  }

  kindAt(x, y) {
    return this.kindOf(this.terrain.getTileAtWorldXY(x, y, true));
  }

  // Top of the water column at x, scanning up from a point inside the water.
  surfaceAt(x, y) {
    let row = Math.floor(y / TILE);
    while (row > 0 && this.kindAt(x, (row - 1) * TILE + 1) === 'water') row--;
    return row * TILE;
  }

  get active() {
    return this.chars[this.activeIndex];
  }

  restartRoom() {
    this.ready = false;
    this.scene.restart({ room: this.roomKey });
  }

  hazardReset() {
    this.hazardResets += 1;
    for (const c of this.chars) {
      c.respawn();
      c.supporter = null;
      c.inWater = false;
      c.atSurface = false;
      c.body.setAllowGravity(true);
    }
  }

  update(time) {
    const ctl = this.controls;
    ctl.update();
    if (ctl.restartPressed) {
      this.restartRoom();
      return;
    }

    // Physics has already stepped this frame; settle water, hazards and standing first.
    for (const c of this.chars) this.updateWater(c);
    if (this.chars.some((c) => this.inHazard(c))) this.hazardReset();
    this.resolveStanding();

    if (ctl.switchPressed) this.activeIndex = (this.activeIndex + 1) % this.chars.length;
    if (ctl.jumpPressed) this.active.jumpRequestedAt = time;

    // Horizontal speed: only the active color moves on its own; inactive colors stay put.
    const baseVx = new Map();
    for (const c of this.chars) {
      let vx = 0;
      if (c === this.active) {
        const speed = c.inWater ? SWIM_SPEED : MOVE_SPEED;
        vx = (ctl.right ? speed : 0) - (ctl.left ? speed : 0);
      }
      baseVx.set(c, vx);
    }
    for (const c of this.chars) {
      // A color standing on another moves with it (this is how Blue carries Red).
      const ride = c.supporter ? baseVx.get(c.supporter) : 0;
      c.body.setVelocityX(baseVx.get(c) + ride);
    }

    for (const c of this.chars) {
      if (c.onGround) c.lastGroundedAt = time;
      const canJump = time - c.lastGroundedAt <= COYOTE_MS;
      const wantsJump = time - c.jumpRequestedAt <= JUMP_BUFFER_MS;
      if (c === this.active && canJump && wantsJump) {
        c.body.setVelocityY(-c.def.jumpSpeed);
        c.jumpRequestedAt = -Infinity;
        c.lastGroundedAt = -Infinity;
        c.jumpedAt = time;
        c.supporter = null;
      }
      // Releasing jump early gives a shorter hop.
      if (c === this.active && !ctl.jumpHeld && c.body.velocity.y < 0 && time - c.jumpedAt < 400) {
        c.body.setVelocityY(c.body.velocity.y * 0.85);
      }
      if (c === this.active && c.inWater && c.def.swims && ctl.down) {
        c.body.setVelocityY(70); // dive
      }
    }

    // Marker above the active color, lifted above anyone riding on it so it stays readable.
    const a = this.active.body;
    let top = a.top;
    for (const c of this.chars) if (c.supporter === this.active) top = Math.min(top, c.body.top);
    this.marker.setPosition(a.center.x, top - 7);
  }

  inHazard(c) {
    const b = c.body;
    if (b.top > this.map.heightInPixels) return true; // fell out of the room
    for (const x of [b.left + 3, b.center.x, b.right - 3]) {
      const tile = this.terrain.getTileAtWorldXY(x, b.bottom - 2, true);
      // Spikes only hurt in the lower part of their tile, where they're drawn.
      if (this.kindOf(tile) === 'spikes' && b.bottom - 2 > tile.pixelY + 6) return true;
    }
    if (!c.def.swims && c.inWater && b.bottom > c.surfaceY + 6) return true; // Red sinks
    return false;
  }

  updateWater(c) {
    const b = c.body;
    const wasInWater = c.inWater;
    c.inWater = this.kindAt(b.center.x, b.bottom - 1) === 'water';
    if (c.inWater) c.surfaceY = this.surfaceAt(b.center.x, b.bottom - 1);

    if (!c.def.swims) {
      c.atSurface = false;
      return;
    }
    if (!c.inWater) {
      c.atSurface = false;
      if (wasInWater) b.setAllowGravity(true);
      return;
    }

    // Blue floats with its top half above the surface.
    b.setAllowGravity(false);
    const restTop = c.surfaceY - b.height / 2;
    const justJumped = this.time.now - c.jumpedAt < 250;
    c.atSurface = Math.abs(b.top - restTop) < 4;
    if (!justJumped) b.setVelocityY(Phaser.Math.Clamp((restTop - b.top) * 8, -160, 160));
  }

  // Colors can stand on each other. Handled here instead of with an Arcade collider so the
  // color underneath is never pushed down by the one on top (Blue must stay afloat).
  resolveStanding() {
    for (const rider of this.chars) {
      rider.supporter = null;
      if (this.time.now - rider.jumpedAt < 150) continue; // just jumped off
      for (const sup of this.chars) {
        if (sup === rider) continue;
        const r = rider.body;
        const s = sup.body;
        const overlapX = r.right > s.left + 2 && r.left < s.right - 2;
        const prevBottom = r.prev.y + r.height;
        const landing = prevBottom <= s.top + 3 && r.bottom >= s.top - 1;
        if (overlapX && landing) {
          r.y = s.top - r.height;
          r.velocity.y = Math.min(s.velocity.y, 0);
          rider.supporter = sup; // update() then gives the rider the supporter's sideways speed
          break;
        }
      }
    }
  }
}
