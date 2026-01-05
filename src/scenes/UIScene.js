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

    // Freeze warning overlay
    this.freezeWarnBg = this.add.rectangle(0, 0, 640, 120, 0x000000, 0.55)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false);

    this.freezeWarnText = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "32px",
      color: "#ffffff",
      align: "center"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1201).setVisible(false);

    this._freezeWarnPulsing = false;

    // Freeze active overlay (cold tint + vignette)
    this.freezeTint = this.add.rectangle(0, 0, 10, 10, 0x9fd6ff, 0.0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false);

    this.freezeVignette = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1101)
      .setVisible(false);

    this.iceCracks = this.add.image(0, 0, "ice_cracks")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1103)
      .setVisible(false)
      .setAlpha(0);

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

    this.restartHint = this.add.text(640, 540, "Press R to restart • T for Title", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#cfe9ff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002).setVisible(false);

    this.restartKey = this.input.keyboard.addKey("R");
    this.titleKey = this.input.keyboard.addKey("T");
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.upgradeOpen = false;
    this.upgradeOptions = [];

    // Listen to GameScene events
    this.game.events.on("ui:notify", (payload) => this._enqueue(payload), this);
    this.game.events.on("ui:gameover", (payload) => this._showGameOver(payload), this);
    this.game.events.on("ui:biome", ({ name }) => {
      const label = (name === "open") ? "Open Water Film" : name[0].toUpperCase() + name.slice(1);
      this.biomeText.setText(`Biome: ${label}`);
    });
    this.game.events.on("ui:codexUnlock", () => {
      this._enqueue({ text: "Codex updated (press C)", kind: "note" });
    });
    this.game.events.on("ui:upgradeChoice", (payload) => this._showUpgradeChoice(payload), this);

    // --- Upgrade Choice Modal ---
    this.upgradeBg = this.add.rectangle(0, 0, 860, 420, 0x000000, 0.78)
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1500).setVisible(false);

    this.upgradeTitle = this.add.text(0, 0, "Choose an upgrade (1 / 2 / 3)", {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff"
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1501).setVisible(false);

    this.upgradeCards = [];
    for (let i = 0; i < 3; i++) {
      const card = this.add.container(0, 0).setScrollFactor(0).setDepth(1501).setVisible(false);

      const rect = this.add.rectangle(0, 0, 250, 260, 0x0b1a2a, 0.92)
        .setStrokeStyle(2, 0x2a4d6a, 1);

      const num = this.add.text(-110, -112, String(i + 1), {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#cfe9ff"
      });

      const t = this.add.text(0, -82, "Upgrade", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: 220 }
      }).setOrigin(0.5, 0);

      const d = this.add.text(0, -30, "Description", {
        fontFamily: "Arial",
        fontSize: "15px",
        color: "#d7e7ff",
        align: "center",
        wordWrap: { width: 220 }
      }).setOrigin(0.5, 0);

      rect.setInteractive({ useHandCursor: true });
      rect.on("pointerdown", () => this._pickUpgrade(i));
      rect.on("pointerover", () => rect.setStrokeStyle(2, 0x6fb6ff, 1));
      rect.on("pointerout", () => rect.setStrokeStyle(2, 0x2a4d6a, 1));

      card.add([rect, num, t, d]);
      card._rect = rect;
      card._title = t;
      card._desc = d;

      this.upgradeCards.push(card);
    }

    this._layoutFreezeWarning();
    this._layoutFreezeFx();
    this._layoutCracks();
    this._layoutUpgradeModal();
    this.scale.on("resize", () => {
      this._layoutFreezeWarning();
      this._layoutFreezeFx();
      this._layoutCracks();
      this._layoutUpgradeModal();
    });
  }

  update() {
    // Restart
    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && this.gameOverBg.visible) {
      this.registry.set("runEnded", false);
      this.gameOverBg.setVisible(false);
      this.gameOverText.setVisible(false);
      this.restartHint.setVisible(false);

      const mode = this.registry.get("gameMode") || "normal";
      this.scene.get("GameScene").scene.restart({ mode });
      this._enqueue({ text: "New run started. Good luck, water bear!", kind: "note" });
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.titleKey) && this.gameOverBg.visible) {
      this.registry.set("runEnded", false);
      this.scene.stop("GameScene");
      this.scene.stop("CodexScene");
      this.scene.start("TitleScene");
      this.scene.stop();
      return;
    }

    if (this.upgradeOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.key1)) this._pickUpgrade(0);
      else if (Phaser.Input.Keyboard.JustDown(this.key2)) this._pickUpgrade(1);
      else if (Phaser.Input.Keyboard.JustDown(this.key3)) this._pickUpgrade(2);
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
    const extinctionCountdown = this.registry.get("extinctionCountdownMs") || 0;
    const freezeActive = !!this.registry.get("freezeActive");

    const mode = this.registry.get("gameMode") || "normal";
    let timeLabel = "Time left:";
    let timeMs = this.registry.get("timeRemainingMs") || 0;
    if (mode !== "normal") {
      timeLabel = "Time:";
      timeMs = this.registry.get("timeElapsedMs") || 0;
    }
    const mm = String(Math.floor(timeMs / 60000)).padStart(2, "0");
    const ss = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, "0");

    this.bars.setText(
      `HP: ${hp}/${hpMax}   Hunger: ${hunger}/${hungerMax}   XP: ${xp}   Lvl: ${lvl}\n` +
      `Offspring: ${offspring}   Next egg at XP: ${threshold}   ${timeLabel} ${mm}:${ss}`
    );

    if (freezeActive) {
      this.freezeTint.setVisible(true);
      this.freezeVignette.setVisible(true);
      this.freezeTint.setFillStyle(0x9fd6ff, 0.18);
      this.freezeVignette.setFillStyle(0x000000, 0.10);
      if (!this.iceCracks.visible) {
        this.iceCracks.setVisible(true);
        this.tweens.add({
          targets: this.iceCracks,
          alpha: { from: 0.0, to: 0.55 },
          duration: 300,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: this.iceCracks,
          alpha: { from: 0.45, to: 0.6 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
    } else {
      this.freezeTint.setVisible(false);
      this.freezeVignette.setVisible(false);
      if (this.iceCracks.visible || this.iceCracks.alpha > 0) {
        this.tweens.killTweensOf(this.iceCracks);
        this.iceCracks.setAlpha(0);
        this.iceCracks.setVisible(false);
      }
    }

    if (extinctionCountdown > 0) {
      const sec = Math.ceil(extinctionCountdown / 1000);
      this.tunText.setText(`Freeze in: ${sec}s — enter Tun [SPACE]`);

      this.freezeWarnBg.setVisible(true);
      this.freezeWarnText.setVisible(true);
      this.freezeWarnText.setText(`❄ FREEZE IN ${sec}s\nENTER TUN [SPACE]`);

      if (!this._freezeWarnPulsing) {
        this._freezeWarnPulsing = true;
        this.tweens.add({
          targets: [this.freezeWarnBg, this.freezeWarnText],
          alpha: { from: 0.35, to: 1 },
          duration: 380,
          yoyo: true,
          repeat: 4
        });
      }
    } else if (tunActive) {
      this.tunText.setText(`Tun: ACTIVE (${Math.ceil(tunEndsIn / 1000)}s) [SPACE]`);
      this.freezeWarnBg.setVisible(false);
      this.freezeWarnText.setVisible(false);
      this._freezeWarnPulsing = false;
    } else if (tunReadyIn > 0) {
      this.tunText.setText(`Tun: Cooldown (${Math.ceil(tunReadyIn / 1000)}s) [SPACE]`);
      this.freezeWarnBg.setVisible(false);
      this.freezeWarnText.setVisible(false);
      this._freezeWarnPulsing = false;
    } else {
      this.tunText.setText("Tun: Ready [SPACE]");
      this.freezeWarnBg.setVisible(false);
      this.freezeWarnText.setVisible(false);
      this._freezeWarnPulsing = false;
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

  _layoutFreezeWarning() {
    const cx = Math.floor(this.scale.width / 2);
    const cy = Math.floor(this.scale.height / 2);
    this.freezeWarnBg.setPosition(cx, cy);
    this.freezeWarnText.setPosition(cx, cy);
  }

  _layoutFreezeFx() {
    this.freezeTint.setSize(this.scale.width, this.scale.height);
    this.freezeVignette.setSize(this.scale.width, this.scale.height);
  }

  _layoutCracks() {
    const sx = this.scale.width / this.iceCracks.width;
    const sy = this.scale.height / this.iceCracks.height;
    this.iceCracks.setScale(sx, sy);
  }

  _layoutUpgradeModal() {
    const cx = Math.floor(this.scale.width / 2);
    const cy = Math.floor(this.scale.height / 2);
    this.upgradeBg.setPosition(cx, cy);
    this.upgradeTitle.setPosition(cx, cy - 170);

    const spacing = 290;
    if (this.upgradeCards && this.upgradeCards.length === 3) {
      this.upgradeCards[0].setPosition(cx - spacing, cy + 20);
      this.upgradeCards[1].setPosition(cx, cy + 20);
      this.upgradeCards[2].setPosition(cx + spacing, cy + 20);
    }
  }

  _showUpgradeChoice({ options }) {
    if (!options || options.length !== 3) return;

    this.upgradeOpen = true;
    this.registry.set("upgradeOpen", true);
    this.upgradeOptions = options;

    this.upgradeBg.setVisible(true);
    this.upgradeTitle.setVisible(true);

    for (let i = 0; i < 3; i++) {
      const opt = options[i];
      const card = this.upgradeCards[i];
      card._title.setText(opt.title);
      card._desc.setText(opt.desc);
      card.setVisible(true);
    }

    this.queue.length = 0;
    this.showing = false;
    this.popupBg.setVisible(false);
    this.popupText.setVisible(false);
  }

  _hideUpgradeChoice() {
    this.upgradeOpen = false;
    this.registry.set("upgradeOpen", false);
    this.upgradeOptions = [];

    this.upgradeBg.setVisible(false);
    this.upgradeTitle.setVisible(false);
    for (const c of this.upgradeCards) c.setVisible(false);
  }

  _pickUpgrade(index) {
    if (!this.upgradeOpen) return;
    const opt = this.upgradeOptions[index];
    if (!opt) return;

    const gs = this.scene.get("GameScene");
    if (gs && gs.applyUpgradeById) {
      gs.applyUpgradeById(opt.id);
    }

    this._hideUpgradeChoice();
    if (gs) gs.scene.resume();
  }
}

window.UIScene = UIScene;
