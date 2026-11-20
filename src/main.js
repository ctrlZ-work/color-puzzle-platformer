import Phaser from 'phaser';
import { TestRoomScene } from './scenes/TestRoomScene.js';

// 480x270 internal resolution scaled to fit the window.
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  backgroundColor: '#1a1a1a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { gamepad: true },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 900 }, debug: false },
  },
  scene: [TestRoomScene],
};

window.game = new Phaser.Game(config);
