/* global Phaser */

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // --- Real art assets ---
    // If you keep these exact keys, GameScene changes are tiny.
    this.load.image("player_tardi", "assets/player/tardigrade.png");

    this.load.image("food_algae", "assets/food/food_algae.png");
    this.load.image("food_proto", "assets/food/food_protozoa.png");

    this.load.image("haz_nematode", "assets/hazards/nematode.png");
    this.load.image("haz_amoeba", "assets/hazards/amoeba.png");
    this.load.image("haz_mite", "assets/hazards/mite.png");

    // --- Audio ---
    this.load.audio("sfx_eat", "assets/sounds/eat.wav");
    this.load.audio("sfx_ouch", "assets/sounds/ouch.wav");
    this.load.audio("bgm1", "assets/music/BGM1.wav");
    this.load.audio("bgm2", "assets/music/BGM2.wav");
    this.load.audio("bgm3", "assets/music/BGM3.wav");
    this.load.audio("bgm4", "assets/music/BGM4.wav");
    this.load.audio("bgm5", "assets/music/BGM5.wav");
  }

  create() {
    // If any image failed to load, generate a placeholder so the game still runs.
    this._ensureFallbackTexture("player_tardi", () => this._makeTardigradeFallback("player_tardi"));
    this._ensureFallbackTexture("food_algae", () => this._makeCircleTexture("food_algae", 12, 0x44dd88));
    this._ensureFallbackTexture("food_proto", () => this._makeCircleTexture("food_proto", 12, 0x33bbff));

    this._ensureFallbackTexture("haz_nematode", () => this._makeCircleTexture("haz_nematode", 16, 0xf2d14b));
    this._ensureFallbackTexture("haz_amoeba", () => this._makeCircleTexture("haz_amoeba", 18, 0xb86bff));
    this._ensureFallbackTexture("haz_mite", () => this._makeCircleTexture("haz_mite", 14, 0xff6b6b));

    // --- Shared registry defaults ---
    this.registry.set("hpMax", 100);
    this.registry.set("hp", 100);
    this.registry.set("hungerMax", 235);
    this.registry.set("hunger", 235);
    this.registry.set("xp", 0);
    this.registry.set("level", 1);
    this.registry.set("speed", 220);
    this.registry.set("resist", 0);
    this.registry.set("magnet", 0);
    this.registry.set("offspring", 0);
    this.registry.set("reproThreshold", 3000);

    if (!this.game.events) this.game.events = new Phaser.Events.EventEmitter();

    this.scene.start("GameScene");
    this.scene.launch("UIScene");
  }

  _ensureFallbackTexture(key, makeFn) {
    if (this.textures.exists(key)) return;
    // If it was loaded successfully, textures.exists(key) will be true.
    // If not, create a fallback.
    makeFn();
  }

  _makeCircleTexture(key, radius, color) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.lineStyle(3, 0x000000, 0.35);
    g.strokeCircle(radius, radius, radius - 1);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  _makeTardigradeFallback(key) {
    const w = 64, h = 44;
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0x7fffd4, 1);
    g.fillRoundedRect(6, 10, 52, 26, 14);

    g.fillStyle(0x73e6cf, 1);
    g.fillRoundedRect(2, 14, 18, 18, 10);

    g.fillStyle(0x4ccfb8, 1);
    const legs = [
      [14, 34], [22, 35], [30, 35], [38, 35],
      [14, 8],  [22, 7],  [30, 7],  [38, 7]
    ];
    legs.forEach(([x, y]) => g.fillRoundedRect(x, y, 8, 6, 3));

    g.fillStyle(0x000000, 0.7);
    g.fillCircle(12, 22, 3);
    g.fillCircle(18, 22, 3);

    g.lineStyle(3, 0x000000, 0.35);
    g.strokeRoundedRect(6, 10, 52, 26, 14);

    g.generateTexture(key, w, h);
    g.destroy();
  }
}

window.BootScene = BootScene;
