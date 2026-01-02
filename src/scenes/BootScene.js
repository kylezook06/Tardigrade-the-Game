/* global Phaser */

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    // --- Generate simple textures (no external assets) ---
    this._makeTardigradeTexture();
    this._makeCircleTexture("food", 12, 0x44dd88);
    this._makeCircleTexture("haz_nematode", 16, 0xf2d14b);
    this._makeCircleTexture("haz_amoeba", 18, 0xb86bff);
    this._makeCircleTexture("haz_mite", 14, 0xff6b6b);
    this._makeCircleTexture("haz_fungus", 15, 0x9bd0ff);
    this._makeCircleTexture("haz_tardi", 16, 0xffffff);

    // --- Shared registry defaults ---
    this.registry.set("hpMax", 100);
    this.registry.set("hp", 100);
    this.registry.set("hungerMax", 100);
    this.registry.set("hunger", 100);
    this.registry.set("xp", 0);
    this.registry.set("level", 1);
    this.registry.set("speed", 220);
    this.registry.set("resist", 0);      // damage reduction in %
    this.registry.set("magnet", 0);      // food magnet radius (px)
    this.registry.set("offspring", 0);
    this.registry.set("reproThreshold", 200); // XP needed for first reproduction

    // Use game-wide event bus so scenes can talk cleanly.
    if (!this.game.events) this.game.events = new Phaser.Events.EventEmitter();

    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  _makeCircleTexture(key, radius, color) {
    if (this.textures.exists(key)) return;

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.lineStyle(3, 0x000000, 0.35);
    g.strokeCircle(radius, radius, radius - 1);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  _makeTardigradeTexture() {
    const key = "tardigrade";
    if (this.textures.exists(key)) return;

    const w = 64, h = 44;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // body
    g.fillStyle(0x7fffd4, 1);
    g.fillRoundedRect(6, 10, 52, 26, 14);

    // head bump
    g.fillStyle(0x73e6cf, 1);
    g.fillRoundedRect(2, 14, 18, 18, 10);

    // legs (8 nubs)
    g.fillStyle(0x4ccfb8, 1);
    const legs = [
      [14, 34], [22, 35], [30, 35], [38, 35],
      [14, 8],  [22, 7],  [30, 7],  [38, 7]
    ];
    legs.forEach(([x, y]) => g.fillRoundedRect(x, y, 8, 6, 3));

    // eyes
    g.fillStyle(0x000000, 0.7);
    g.fillCircle(12, 22, 3);
    g.fillCircle(18, 22, 3);

    // outline
    g.lineStyle(3, 0x000000, 0.35);
    g.strokeRoundedRect(6, 10, 52, 26, 14);

    g.generateTexture(key, w, h);
    g.destroy();
  }
}

window.BootScene = BootScene;
