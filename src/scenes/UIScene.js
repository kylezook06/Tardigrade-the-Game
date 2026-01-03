/* global Phaser */

class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });

    this.queue = [];
    this.showing = false;
  }

  create() {
    // HUD container
    this.hud = this.add.container(16, 16).setScrollFactor(0).setDepth(1000);

    this.title = this.add.text(0, 0, "Tardigrade: The Game", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#cfe9ff"
    });

    this.bars = this.add.text(0, 26, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#cfe9ff"
    });

    this.biomeText = this.add.text(0, 62, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#cfe9ff"
    });

    this.tunText = this.add.text(0, 84, "", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#cfe9ff"
    });

    this.hud.add([this.title, this.bars, this.biomeText, this.tunText]);

    // Notification popup
    this.popupBg = this.add.rectangle(640, 660, 980, 70, 0x000000, 0.55).setScrollFactor(0).setDepth(1000);
    this.popupText = this.add.text(640, 660, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      align: "center",
      wordWrap: { width: 920 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.popupBg.setVisible(false);
    this.popupText.setVisible(false);

    // Game over panel
    this.gameOverBg = this.add.rectangle(640, 360, 820, 420, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(2000).setVisible(false);

    this.gameOverText = this.add.text(640, 360, "", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      align: "center",
      wordWrap: { width: 760 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setVisible(false);

    this.restartHint = this.add.text(640, 540, "Press R to restart", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#cfe9ff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002).setVisible(false);

    this.restartKey = this.input.keyboard.addKey("R");
    this.codexOpen = false;
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Listen to GameScene events
    this.game.events.on("ui:notify", (payload) => this._enqueue(payload), this);
    this.game.events.on("ui:gameover", (payload) => this._showGameOver(payload), this);
    this.game.events.on("ui:biome", ({ name }) => {
      const label = (name === "open") ? "Open Water Film" : name[0].toUpperCase() + name.slice(1);
      this.biomeText.setText(`Biome: ${label}`);
    });
    this.game.events.on("ui:codexUnlock", () => {
      if (!this.codexOpen) {
        this._enqueue({ text: "Codex updated (press C)", kind: "note" });
      }
    });

    this.codexBg = this.add.rectangle(0, 0, 760, 520, 0x000000, 0.78)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.codexTitle = this.add.text(0, 0, "CODEX", {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#ffffff"
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1001).setVisible(false);

    this.codexBody = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#d7e7ff",
      wordWrap: { width: 700 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001).setVisible(false);

    this.codexHint = this.add.text(0, 0, "C: close   ESC: close", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#b7c7dd"
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1001).setVisible(false);

    this._layoutCodex();
    this.scale.on("resize", () => this._layoutCodex());
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this._toggleCodex();
    }
    if (this.codexOpen && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
      this._toggleCodex(false);
    }
    // Restart
    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && this.gameOverBg.visible) {
      // Hide game over UI and restart game scene
      this.gameOverBg.setVisible(false);
      this.gameOverText.setVisible(false);
      this.restartHint.setVisible(false);

      this.scene.get("GameScene").scene.restart();
      this._enqueue({ text: "New run started. Good luck, water bear!", kind: "note" });
      return;
    }

    if (this.gameOverBg.visible) return;

    // HUD refresh
    const hp = Math.round(this.registry.get("hp"));
    const hpMax = this.registry.get("hpMax");
    const hunger = Math.round(this.registry.get("hunger"));
    const hungerMax = this.registry.get("hungerMax");
    const xp = this.registry.get("xp");
    const lvl = this.registry.get("level");
    const offspring = this.registry.get("offspring");
    const threshold = this.registry.get("reproThreshold");
    const tunActive = this.registry.get("tunActive");
    const tunReadyIn = this.registry.get("tunReadyInMs") || 0;
    const tunEndsIn = this.registry.get("tunEndsInMs") || 0;

    const remaining = this.registry.get("timeRemainingMs") || 0;
    const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

    this.bars.setText(
      `HP: ${hp}/${hpMax}   Hunger: ${hunger}/${hungerMax}   XP: ${xp}   Lvl: ${lvl}\n` +
      `Offspring: ${offspring}   Next egg at XP: ${threshold}   Time left: ${mm}:${ss}`
    );

    if (tunActive) {
      this.tunText.setText(`Tun: ACTIVE (${Math.ceil(tunEndsIn / 1000)}s) [SPACE]`);
    } else if (tunReadyIn > 0) {
      this.tunText.setText(`Tun: Cooldown (${Math.ceil(tunReadyIn / 1000)}s) [SPACE]`);
    } else {
      this.tunText.setText("Tun: Ready [SPACE]");
    }

    // Pump queue
    if (!this.showing && this.queue.length > 0 && !this.gameOverBg.visible) {
      this._dequeueAndShow();
    }
  }

  _enqueue(payload) {
    if (!payload || !payload.text) return;
    this.queue.push(payload);
    // Keep queue sane
    if (this.queue.length > 8) this.queue.shift();
  }

  _dequeueAndShow() {
    const { text, kind } = this.queue.shift();
    this.showing = true;

    this.popupBg.setVisible(true);
    this.popupText.setVisible(true);

    // Slight style difference for "fact"
    const prefix = (kind === "fact") ? "🔬 " : "🧫 ";
    this.popupText.setText(prefix + text);

    // Fade in/out
    this.popupBg.alpha = 0;
    this.popupText.alpha = 0;

    this.tweens.add({
      targets: [this.popupBg, this.popupText],
      alpha: 1,
      duration: 180,
      onComplete: () => {
        this.time.delayedCall(2400, () => {
          this.tweens.add({
            targets: [this.popupBg, this.popupText],
            alpha: 0,
            duration: 220,
            onComplete: () => {
              this.popupBg.setVisible(false);
              this.popupText.setVisible(false);
              this.showing = false;
            }
          });
        });
      }
    });
  }

  _showGameOver({ reason, survivedMs, offspring, xp }) {
    const seconds = Math.floor(survivedMs / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");

    this.gameOverBg.setVisible(true);
    this.gameOverText.setVisible(true);
    this.restartHint.setVisible(true);

    let resultLine = "Result: ❌ Lineage ends here.";
    if (offspring === 1) {
      resultLine = "Result: ✅ Species propagated.";
    } else if (offspring > 1) {
      resultLine = `Result: ⭐ Thriving lineage (${offspring} offspring).`;
    }

    this.gameOverText.setText(
      `🧪 OBSERVATION COMPLETE\n\n` +
      `${reason}\n\n` +
      `Time survived: ${mm}:${ss}\n` +
      `Offspring produced: ${offspring}\n` +
      `${resultLine}\n\n` +
      `Tip: Stay fed. Hunger is the silent killer.`
    );

    // Clear any popups
    this.queue.length = 0;
    this.showing = false;
    this.popupBg.setVisible(false);
    this.popupText.setVisible(false);
  }

  _layoutCodex() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    this.codexBg.setPosition(cx, cy);
    this.codexTitle.setPosition(cx, cy - 220);
    this.codexBody.setPosition(cx, cy - 180);
    this.codexHint.setPosition(cx, cy + 225);
  }

  _toggleCodex(forceState) {
    const open = (forceState === undefined) ? !this.codexOpen : forceState;
    this.codexOpen = open;
    this.registry.set("codexOpen", open);

    this.codexBg.setVisible(open);
    this.codexTitle.setVisible(open);
    this.codexBody.setVisible(open);
    this.codexHint.setVisible(open);

    if (open) this._renderCodex();
  }

  _renderCodex() {
    const codex = this.registry.get("codex");
    const entries = (codex && codex.entries) ? codex.entries : {};

    const lines = [];
    lines.push("Unlocked entries:");
    lines.push("");

    const list = [
      { key: "food_algae", title: "Algae / Biofilm", text: "Primary grazing food source in water films; boosts hunger steadily." },
      { key: "food_proto", title: "Protozoa", text: "Protein-rich snack. Many microfauna prey on smaller protists." },
      { key: "haz_nematode", title: "Nematode", text: "Roundworms common in soil/water films; some are predators or scavengers." },
      { key: "haz_amoeba", title: "Amoeba", text: "Single-celled shapeshifters; engulf food via phagocytosis." },
      { key: "haz_mite", title: "Mite", text: "Tiny arthropods; some live in moss/lichen microhabitats and can threaten microfauna." },
      { key: "pred_carnivorous_tardigrade", title: "Carnivorous Tardigrade", text: "Not all tardigrades are peaceful—some species hunt and eat other microfauna (even other tardigrades)." }
    ];

    let unlockedAny = false;
    for (const entry of list) {
      if (entries[entry.key] && entries[entry.key].unlocked) {
        unlockedAny = true;
        lines.push(`• ${entry.title}`);
        lines.push(`  ${entry.text}`);
        lines.push("");
      }
    }

    if (!unlockedAny) {
      lines.length = 0;
      lines.push("Codex is empty.");
      lines.push("");
      lines.push("Explore, eat, and survive to unlock facts.");
    }

    this.codexBody.setText(lines.join("\n"));
  }
}

window.UIScene = UIScene;
