/* global Phaser */

class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: "TitleScene" });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55);

    const panel = this.add.rectangle(w / 2, h / 2, 720, 520, 0x000000, 0.85);
    panel.setStrokeStyle(2, 0xffffff, 0.18);

    this.add.text(w / 2, h / 2 - 210, "Tardigrade: The Game", {
      fontFamily: "Arial",
      fontSize: "38px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2 - 160, "Choose a mode", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#d7e6ff",
      alpha: 0.9
    }).setOrigin(0.5);

    const options = [
      {
        key: "1",
        title: "Short game",
        desc: "Survive long enough to produce 1 offspring.",
        mode: "short"
      },
      {
        key: "2",
        title: "Normal game",
        desc: "Survive 20 minutes OR reproduce 4 times.",
        mode: "normal"
      },
      {
        key: "3",
        title: "Infinite mode",
        desc: "Survive as long as you can. Timer counts up.\nExtinction events every 10 minutes.",
        mode: "infinite"
      }
    ];

    const startY = h / 2 - 90;
    const lineH = 120;

    options.forEach((o, i) => {
      const y = startY + i * lineH;

      const box = this.add.rectangle(w / 2, y, 640, 92, 0x102035, 0.55);
      box.setStrokeStyle(2, 0xffffff, 0.10);
      box.setInteractive({ useHandCursor: true });

      this.add.text(w / 2 - 300, y - 30, `${o.key}) ${o.title}` , {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold"
      }).setOrigin(0, 0);

      this.add.text(w / 2 - 300, y + 2, o.desc, {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#d7e6ff",
        wordWrap: { width: 600 }
      }).setOrigin(0, 0);

      box.on("pointerdown", () => this._startMode(o.mode));
    });

    this.add.text(w / 2, h / 2 + 228, "Tip: C opens Codex • M cycles music • SPACE enters Tun", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#ffffff",
      alpha: 0.75
    }).setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys("ONE,TWO,THREE");
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this._startMode("short");
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this._startMode("normal");
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this._startMode("infinite");
  }

  _startMode(mode) {
    this.registry.set("gameMode", mode);

    if (this.scene.isActive("UIScene")) this.scene.stop("UIScene");
    if (this.scene.isActive("CodexScene")) this.scene.stop("CodexScene");
    if (this.scene.isActive("GameScene")) this.scene.stop("GameScene");

    this.scene.start("GameScene", { mode });
  }
}

window.TitleScene = TitleScene;
