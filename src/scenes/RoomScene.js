import Phaser from 'phaser';
import { Controls } from '../game/Controls.js';
import { touchObject, REACTIONS } from '../game/reactions.js';
import { ROOMS } from '../game/rooms.js';
import { loadSave, freshSave, writeSave, markSolved } from '../game/save.js';
import {
  ColorCharacter,
  COLOR_ORDER,
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
const BW_FILL = 0xbdbdbd;
const PORTAL_OPEN_FILL = 0xb07cf0;

// What each reaction effect does in the room. A new effect is one entry here plus its row in
// src/game/reactions.js; an effect with no entry only changes the object's color and pattern.
const EFFECTS = {
  hot: {
    apply(scene, obj) {
      obj.sprite.body.enable = false; // too hot to stand on
      scene.meltIceAround(obj.sprite.getBounds());
    },
  },
  float: {
    step(scene, obj) {
      scene.floatStep(obj);
    },
  },
  // glow: its light behavior arrives with Yellow in issue 4.1.
};

export class RoomScene extends Phaser.Scene {
  constructor() {
    super('Room');
  }

  init(data) {
    this.roomKey = (data && data.room) || ROOMS[0].key;
    this.ready = false;
  }

  preload() {
    this.load.image('tiles', 'assets/tiles.png');
    // A room's background pair is named by its map's "background" property, so it's only known once
    // the map file has loaded. (On a restart everything is already cached and this doesn't fire.)
    this.load.once(`filecomplete-tilemapJSON-${this.roomKey}`, (key, type, file) => {
      const json = file && file.data ? file.data : file;
      const bg = ((json && json.properties) || []).find((p) => p.name === 'background');
      if (!bg) return;
      this.load.image(bg.value, `assets/backgrounds/${bg.value}.png`);
      this.load.image(`${bg.value}-bw`, `assets/backgrounds/${bg.value}-bw.png`);
    });
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

    // The room's goal, from the map's custom properties (see docs/room-format.md).
    this.roomProps = Object.fromEntries((map.properties || []).map((p) => [p.name, p.value]));
    this.portal = null;
    this.portalOpen = false;

    // Background: the black-and-white version underneath, the color version on top of it, fading in
    // as the room is restored (see updateRestored). Placeholder art proving the technique (issue 3.2).
    this.bgColor = null;
    const bg = this.roomProps.background;
    if (bg && this.textures.exists(bg) && this.textures.exists(`${bg}-bw`)) {
      this.add.image(0, 0, `${bg}-bw`).setOrigin(0, 0).setDepth(-11);
      this.bgColor = this.add.image(0, 0, bg).setOrigin(0, 0).setDepth(-10).setAlpha(0);
    }
    this.restored = 0;

    // Objects from the Tiled object layer, keyed by their stable Tiled ID.
    this.objectsById = new Map();
    this.objectGroup = this.physics.add.staticGroup();
    const spawns = {};
    for (const o of map.getObjectLayer('objects').objects) {
      const props = Object.fromEntries((o.properties || []).map((p) => [p.name, p.value]));
      if (o.type === 'spawn') {
        spawns[o.name] = { x: o.x, y: o.y };
      } else if (REACTIONS[o.type]) {
        // Any object type listed in the reaction table: black-and-white until the first color
        // touches it, which decides what it becomes.
        const r = this.add.rectangle(o.x, o.y, o.width, o.height, BW_FILL).setOrigin(0, 0);
        r.setStrokeStyle(1, 0x7a7a7a);
        this.objectGroup.add(r);
        const rec = {
          id: o.id, name: o.name, type: o.type, props, sprite: r,
          reacts: props.reacts === true, touchedBy: null, effect: null,
        };
        r.setData('obj', rec);
        this.objectsById.set(o.id, rec);
      } else if (o.type === 'portal') {
        // Exit portal: black-and-white and closed until the room's goal is met.
        const r = this.add.rectangle(o.x, o.y, o.width, o.height, 0x555555, 0.6).setOrigin(0, 0); // drawn behind the colors
        r.setStrokeStyle(1, BW_FILL);
        this.portal = { id: o.id, sprite: r, area: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height) };
      }
    }

    // Spawn points are the bottom-centre of each color. The first color in COLOR_ORDER (Blue) starts active.
    const order = COLOR_ORDER.filter((n) => spawns[n]);
    this.chars = order.map((n) => new ColorCharacter(this, n, spawns[n].x, spawns[n].y - 8));
    for (const c of this.chars) {
      this.physics.add.collider(c.sprite, this.terrain);
      this.physics.add.collider(c.sprite, this.objectGroup, null, (cs, os) => this.objectBlocks(c, os.getData('obj')));
    }
    // The room's left and right edges are walls; falling out of the bottom is still a hazard.
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.world.setBoundsCollision(true, true, false, false);
    for (const c of this.chars) c.body.setCollideWorldBounds(true);
    this.activeIndex = 0;
    this.hazardResets = 0;

    this.marker = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 5, 0xffffff).setDepth(3);
    this.controls = new Controls(this);
    this.add
      .text(
        8,
        6,
        'Move: arrows/WASD or stick   Jump: Space/Up or A   Switch: Q/Tab or Y\nDive: Down   Restart room: R or Back   Use open portal: E/Enter or X',
        { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
      )
      .setDepth(3);

    // Remember where the player is, so Continue returns here.
    this.save = loadSave(ROOMS) || freshSave(ROOMS);
    this.save.current = this.roomKey;
    writeSave(this.save);

    // A room already solved keeps its portal open, so returning to it (backtracking) never traps you.
    if (this.portal && this.save.solved.includes(this.roomKey)) this.openPortal(true);

    this.registry.inc('roomStarts', 1); // counted for automated checks
    this.ready = true; // for automated checks
  }

  // The goal is an end state, checked every frame, so any route or order that reaches it counts.
  //   goal = "all-in-portal": every color is standing inside the portal's area.
  //   goal = "object-effect": the object with ID goalObject has the effect goalEffect.
  goalMet() {
    const g = this.roomProps;
    if (g.goal === 'all-in-portal' && this.portal) {
      return this.chars.every((c) => {
        const b = c.body;
        return Phaser.Geom.Rectangle.Contains(this.portal.area, b.center.x, b.bottom - 1) && c.onGround;
      });
    }
    if (g.goal === 'object-effect') {
      const o = this.objectsById.get(g.goalObject);
      return !!o && o.effect === g.goalEffect;
    }
    return false;
  }

  openPortal(instant = false) {
    this.portalOpen = true;
    if (instant) this.portal.sprite.setFillStyle(PORTAL_OPEN_FILL, 0.6);
    else this.fadeTo(this.portal.sprite, PORTAL_OPEN_FILL, 0x555555);
    markSolved(this.save, ROOMS, this.roomKey);
    writeSave(this.save);
    this.updateRestored(instant);
  }

  // How much of the room's color is back: each object a color has touched counts one part, and the
  // open portal counts one more. The color background's opacity follows it.
  updateRestored(instant = false) {
    const objs = [...this.objectsById.values()].filter((o) => o.reacts);
    const parts = objs.length + (this.portal ? 1 : 0);
    const done = objs.filter((o) => o.touchedBy).length + (this.portalOpen ? 1 : 0);
    this.restored = parts ? done / parts : 0;
    if (!this.bgColor) return;
    this.tweens.killTweensOf(this.bgColor);
    if (instant) this.bgColor.setAlpha(this.restored);
    else this.tweens.add({ targets: this.bgColor, alpha: this.restored, duration: 900 });
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
    this.updateObjects();
    this.resolveStanding();
    if (this.portal && !this.portalOpen && this.goalMet()) this.openPortal();
    if (this.portalOpen && ctl.usePressed) {
      const b = this.active.body;
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.portal.area, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) {
        // The room waits, paused, under the travel screen; backing out resumes it as it was.
        this.scene.launch('Travel', { from: this.roomKey });
        this.scene.pause();
        return;
      }
    }

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
    // A color standing on another moves with it (this is how Blue carries Red), down a whole stack.
    const ride = (c, depth = 0) => (c.supporter && depth < 4 ? baseVx.get(c.supporter) + ride(c.supporter, depth + 1) : 0);
    for (const c of this.chars) c.body.setVelocityX(baseVx.get(c) + ride(c));

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

  // A color swimming in the water passes under or beside a floating raft instead of being pushed up
  // onto it; it can still climb onto the raft from above, by jumping.
  objectBlocks(c, obj) {
    if (!obj || obj.effect !== 'float' || !c.inWater) return true;
    return c.body.bottom <= obj.sprite.y + 2;
  }

  // Touching an object (standing on it or against its side) gives it that color's reaction,
  // if no color has touched it yet in this room.
  updateObjects() {
    for (const obj of this.objectsById.values()) {
      const handler = EFFECTS[obj.effect];
      if (handler && handler.step) handler.step(this, obj);
      if (obj.touchedBy || !obj.reacts) continue;
      const r = obj.sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(r, 2, 2);
      for (const c of this.chars) {
        const b = c.body;
        const body = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
        if (!Phaser.Geom.Intersects.RectangleToRectangle(r, body)) continue;
        const reaction = touchObject(obj, c.name);
        if (reaction) this.applyEffect(obj, reaction);
        break;
      }
    }
  }

  applyEffect(obj, reaction) {
    obj.effect = reaction.effect;
    this.fadeTo(obj.sprite, reaction.fill);
    this.drawMark(obj, reaction.mark);
    const handler = EFFECTS[reaction.effect];
    if (handler && handler.apply) handler.apply(this, obj);
    this.updateRestored();
  }

  // Each reaction also gets a pattern, so a changed object never relies on hue alone (spec section 8).
  drawMark(obj, mark) {
    if (!mark) return;
    const s = obj.sprite;
    const g = this.add.graphics({ x: s.x, y: s.y }).setDepth(1);
    g.lineStyle(1, 0xffffff, 0.9);
    const w = s.width, h = s.height;
    if (mark === 'zigzag') {
      g.beginPath(); g.moveTo(1, h - 2);
      for (let x = 3; x < w; x += 4) g.lineTo(x, (x / 4) % 2 < 1 ? 1 : h - 2);
      g.strokePath();
    } else if (mark === 'waves') {
      g.lineBetween(2, h / 2, w - 2, h / 2);
      g.lineBetween(4, h / 2 - 2, w - 4, h / 2 - 2);
    } else if (mark === 'dots') {
      g.fillStyle(0xffffff, 0.9);
      for (let x = 3; x < w; x += 6) g.fillRect(x, h / 2 - 1, 2, 2);
    }
    obj.markGraphics = g;
  }

  // Restored objects fade from black-and-white to their new color.
  fadeTo(rect, fill, start = BW_FILL) {
    const from = Phaser.Display.Color.ValueToColor(start);
    const to = Phaser.Display.Color.ValueToColor(fill);
    this.tweens.addCounter({
      from: 0, to: 100, duration: 400,
      onUpdate: (tw) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.getValue());
        rect.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  // Removes every ice tile touching the given area, and any ice connected to those tiles.
  meltIceAround(area) {
    const x0 = Math.floor((area.left - 1) / TILE), x1 = Math.floor((area.right) / TILE);
    const y0 = Math.floor((area.top - 1) / TILE), y1 = Math.floor((area.bottom) / TILE);
    const queue = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) queue.push([tx, ty]);
    const seen = new Set();
    while (queue.length) {
      const [tx, ty] = queue.pop();
      const key = tx + ',' + ty;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.kindOf(this.terrain.getTileAt(tx, ty, true)) !== 'ice') continue;
      this.terrain.removeTileAt(tx, ty);
      queue.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]);
    }
  }

  // A floating platform rises to the top of the water it's in, half above the surface.
  floatStep(obj) {
    const s = obj.sprite;
    const cx = s.x + s.width / 2;
    if (this.kindAt(cx, s.y + s.height - 1) !== 'water') return;
    const target = this.surfaceAt(cx, s.y + s.height - 1) - s.height / 2;
    if (s.y <= target) return;
    s.y = Math.max(target, s.y - 1.5);
    s.body.updateFromGameObject();
    if (obj.markGraphics) obj.markGraphics.y = s.y;
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
      const was = rider.supporter;
      rider.supporter = null;
      if (this.time.now - rider.jumpedAt < 150) continue; // just jumped off
      for (const sup of this.chars) {
        if (sup === rider) continue;
        // A color jumping upward can't scoop up another color from below; it passes through, as
        // when it jumps from under a color already standing on it.
        if (was !== sup && sup.body.velocity.y < 0 && !sup.inWater) continue;
        const r = rider.body;
        const s = sup.body;
        const overlapX = r.right > s.left + 2 && r.left < s.right - 2;
        const prevBottom = r.prev.y + r.height;
        // A rider that was already standing here stays on even if the two drift a few pixels apart.
        const landing = prevBottom <= s.top + 3 && r.bottom >= s.top - (was === sup ? 4 : 1);
        if (overlapX && landing) {
          r.y = s.top - r.height;
          r.velocity.y = s.velocity.y; // falls or rises with the color underneath
          rider.supporter = sup; // update() then gives the rider the supporter's sideways speed
          break;
        }
      }
    }
  }
}
