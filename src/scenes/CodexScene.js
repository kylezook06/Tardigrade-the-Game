/* global Phaser */

class CodexScene extends Phaser.Scene {
  constructor() {
    super({ key: "CodexScene" });
    this.isOpen = false;
    this.scrollY = 0;
    this.maxScroll = 0;
  }

  create() {
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyUP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDOWN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);

    this.dimmer = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.45)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900)
      .setVisible(false);

    this.panel = this.add.rectangle(0, 0, 760, 520, 0x000000, 0.82)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(901)
      .setVisible(false);

    this.title = this.add.text(0, 0, "CODEX", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(902)
      .setVisible(false);

    this.viewport = { x: 0, y: 0, w: 700, h: 380 };

    this.content = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(903)
      .setVisible(false);

    this.body = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#d7e6ff",
      wordWrap: { width: this.viewport.w }
    }).setOrigin(0, 0);

    this.content.add(this.body);

    this.maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillRect(0, 0, this.viewport.w, this.viewport.h);
    this.contentMask = this.maskGfx.createGeometryMask();
    this.content.setMask(this.contentMask);

    this.hint = this.add.text(0, 0, "C / ESC to close • Mouse wheel or ↑/↓ to scroll", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#ffffff",
      alpha: 0.85
    }).setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(904)
      .setVisible(false);

    this.input.on("wheel", (pointer, dx, dy) => {
      if (!this.isOpen) return;
      this._scrollBy(dy * 0.6);
    });

    this.scale.on("resize", () => this._layout());
    this._layout();
  }

  _layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.dimmer.setSize(w, h);

    this.panel.setPosition(w / 2, h / 2);
    this.title.setPosition(w / 2, h / 2 - 240);

    this.viewport.x = w / 2 - 350;
    this.viewport.y = h / 2 - 190;

    this.maskGfx.clear();
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillRect(this.viewport.x, this.viewport.y, this.viewport.w, this.viewport.h);

    this.content.setPosition(this.viewport.x, this.viewport.y + this.scrollY);

    this.hint.setPosition(w / 2, h / 2 + 250);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.isOpen ? this.close() : this.open();
    }
    if (this.isOpen && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
      this.close();
    }

    if (!this.isOpen) return;

    if (this.keyUP.isDown) this._scrollBy(-8);
    if (this.keyDOWN.isDown) this._scrollBy(8);
  }

  open() {
    this.isOpen = true;
    this.registry.set("codexOpen", true);
    this.registry.set("codexPauseStartedAt", this.game.loop.now);

    if (this.scene.isActive("GameScene")) this.scene.pause("GameScene");
    if (this.scene.isActive("UIScene")) this.scene.pause("UIScene");

    this._refreshText();
    this._recalcScrollBounds();
    this.scrollY = 0;
    this._layout();

    this.dimmer.setVisible(true);
    this.panel.setVisible(true);
    this.title.setVisible(true);
    this.content.setVisible(true);
    this.hint.setVisible(true);
  }

  close() {
    this.isOpen = false;
    this.registry.set("codexOpen", false);

    if (this.scene.isPaused("GameScene")) this.scene.resume("GameScene");
    if (this.scene.isPaused("UIScene")) this.scene.resume("UIScene");

    const pauseStartedAt = this.registry.get("codexPauseStartedAt");
    if (pauseStartedAt) {
      const durationMs = this.game.loop.now - pauseStartedAt;
      const gameScene = this.scene.get("GameScene");
      if (gameScene && gameScene.applyCodexPauseDuration) {
        gameScene.applyCodexPauseDuration(durationMs);
      }
    }
    this.registry.set("codexPauseStartedAt", 0);

    this.dimmer.setVisible(false);
    this.panel.setVisible(false);
    this.title.setVisible(false);
    this.content.setVisible(false);
    this.hint.setVisible(false);
  }

  _scrollBy(amount) {
    this.scrollY -= amount;
    this.scrollY = Phaser.Math.Clamp(this.scrollY, -this.maxScroll, 0);
    this.content.y = this.viewport.y + this.scrollY;
  }

  _recalcScrollBounds() {
    const textH = this.body.height;
    this.maxScroll = Math.max(0, textH - this.viewport.h);
  }

  _refreshText() {
    const codex = this.registry.get("codex") || {};
    const entries = codex.entries || {};
    const hungerMax = this.registry.get("hungerMax") || 0;
    const speed = this.registry.get("speed") || 0;
    const resist = this.registry.get("resist") || 0;
    const magnet = this.registry.get("magnet") || 0;

    const catalog = [
      { key: "food_algae", title: "Algae / Biofilm", text: "Primary grazing food source in water films; boosts hunger steadily." },
      { key: "food_proto", title: "Protozoa", text: "Protein-rich snack. Many microfauna prey on smaller protists." },
      { key: "haz_nematode", title: "Nematode", text: "Roundworms common in soil/water films; some are predators or scavengers." },
      { key: "haz_amoeba", title: "Amoeba", text: "Single-celled shapeshifters; engulf food via phagocytosis." },
      { key: "haz_mite", title: "Mite", text: "Tiny arthropods; many thrive in moss and soil microhabitats." },
      { key: "pred_carnivorous_tardigrade", title: "Carnivorous Tardigrade", text: "Some tardigrades are predators of other microfauna (even other tardigrades)." },
      { key: "biome_moss", title: "Moss", text: "A micro-forest. Water films between leaves create habitats for microfauna." },
      { key: "biome_lichen", title: "Lichen", text: "Fungus + algae partnership. Rough terrain with pockets of moisture." },
      { key: "biome_soil", title: "Soil", text: "Dense particle maze. Great shelter—and a wall you can’t pass through." },
      { key: "tun_cryptobiosis", title: "Tun Mode", text: "Cryptobiosis lets tardigrades endure freezing and desiccation by suspending metabolism." }
    ];

    const lines = [];
    let any = false;

    lines.push("CURRENT UPGRADES");
    lines.push("----------------------------------------");
    lines.push(`Bigger Belly: Max Hunger ${hungerMax}`);
    lines.push(`Faster Feet: Move Speed ${speed}`);
    lines.push(`Tougher Cuticle: Resistance ${resist}`);
    lines.push(`Sticky Vibes: Magnet Radius ${magnet}`);
    lines.push("");
    lines.push("CODEX ENTRIES");
    lines.push("----------------------------------------");
    lines.push("");

    catalog.forEach((item) => {
      if (entries[item.key] && entries[item.key].unlocked) {
        any = true;
        lines.push(item.title);
        lines.push("----------------------------------------");
        lines.push(item.text);
        lines.push("");
      }
    });

    if (!any) {
      lines.push("Codex is empty.");
      lines.push("");
      lines.push("Explore, eat, and survive to unlock fact entries.");
    }

    this.body.setText(lines.join("\n"));
  }
}

window.CodexScene = CodexScene;
