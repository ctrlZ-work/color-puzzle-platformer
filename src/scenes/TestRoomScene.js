import Phaser from 'phaser';
import { Controls } from '../game/Controls.js';
import {
  ColorCharacter,
  MOVE_SPEED,
  SWIM_SPEED,
  COYOTE_MS,
  JUMP_BUFFER_MS,
} from '../game/ColorCharacter.js';

// Issue 2.1 test room (built in code; rooms move to Tiled files in 2.2).
// Shows: switching, inactive colors staying put, standing on each other,
// Blue swimming and carrying Red across water, and Red's high jump.
//
// Layout (480x270): ground on both sides of a water pool, and a high ledge on the
// left that Red can reach by jumping and Blue can reach only by standing on Red.

const GROUND_TOP = 230;
const POOL_LEFT = 190;
const POOL_RIGHT = 330;
const WATER_TOP = 238; // Blue floats with its top level with the ground, so Red can step on
const POOL_BOTTOM = 266;
const GRAY = 0xdddddd;
const WATER_GRAY = 0x6f6f6f;

export class TestRoomScene extends Phaser.Scene {
  constructor() {
    super('TestRoom');
  }

  create() {
    const { width, height } = this.scale;

    this.solids = this.physics.add.staticGroup();
    this.addSolid(0, GROUND_TOP, POOL_LEFT, height - GROUND_TOP); // left ground
    this.addSolid(POOL_RIGHT, GROUND_TOP, width - POOL_RIGHT, height - GROUND_TOP); // right ground
    this.addSolid(POOL_LEFT, POOL_BOTTOM, POOL_RIGHT - POOL_LEFT, height - POOL_BOTTOM); // pool floor
    this.addSolid(20, 160, 70, 8); // high ledge
    this.addSolid(-10, 0, 10, height); // left wall
    this.addSolid(width, 0, 10, height); // right wall

    this.water = new Phaser.Geom.Rectangle(POOL_LEFT, WATER_TOP, POOL_RIGHT - POOL_LEFT, POOL_BOTTOM - WATER_TOP);
    this.add
      .rectangle(this.water.x, this.water.y, this.water.width, this.water.height, WATER_GRAY, 0.8)
      .setOrigin(0, 0)
      .setDepth(2);

    // Blue starts active (Gabrielle, 2026-11-19: start as a blue circle).
    this.chars = [
      new ColorCharacter(this, 'blue', 140, GROUND_TOP - 8),
      new ColorCharacter(this, 'red', 160, GROUND_TOP - 8),
    ];
    for (const c of this.chars) this.physics.add.collider(c.sprite, this.solids);
    this.activeIndex = 0;

    this.marker = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 5, 0xffffff).setDepth(3);
    this.controls = new Controls(this);

    this.add
      .text(
        8,
        6,
        'Move: arrows/WASD or stick   Jump: Space/Up or A   Switch: Q/Tab or Y   Dive: Down',
        { fontFamily: 'monospace', fontSize: '8px', color: '#bbbbbb' },
      )
      .setDepth(3);

    this.ready = true; // for automated checks
  }

  addSolid(x, y, w, h) {
    const r = this.add.rectangle(x, y, w, h, GRAY).setOrigin(0, 0);
    this.solids.add(r);
    return r;
  }

  get active() {
    return this.chars[this.activeIndex];
  }

  update(time) {
    const ctl = this.controls;
    ctl.update();

    // Physics has already stepped this frame; settle standing and water first.
    for (const c of this.chars) this.updateWater(c);
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

  updateWater(c) {
    const b = c.body;
    const wasInWater = c.inWater;
    c.inWater =
      b.bottom > this.water.top + 1 && b.center.x > this.water.left && b.center.x < this.water.right;

    if (!c.def.swims) {
      // Red can't swim: sinking into the water sends it back to where it started.
      c.atSurface = false;
      if (b.bottom > this.water.top + 6 && c.inWater) c.respawn();
      return;
    }

    if (!c.inWater) {
      c.atSurface = false;
      if (wasInWater) b.setAllowGravity(true);
      return;
    }

    // Blue floats with its top half above the surface.
    b.setAllowGravity(false);
    const restTop = this.water.top - b.height / 2;
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
