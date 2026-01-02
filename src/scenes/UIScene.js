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

    this.hud.add([this.title, this.bars]);

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

    // Listen to GameScene events
    this.game.events.on("ui:notify", (payload) => this._enqueue(payload), this);
    this.game.events.on("ui:gameover", (payload) => this._showGameOver(payload), this);
  }

  update() {
    // HUD refresh
    const hp = Math.round(this.registry.get("hp"));
    const hpMax = this.registry.get("hpMax");
    const hunger = Math.round(this.registry.get("hunger"));
    const hungerMax = this.registry.get("hungerMax");
    const xp = this.registry.get("xp");
    const lvl = this.registry.get("level");
    const offspring = this.registry.get("offspring");
    const threshold = this.registry.get("reproThreshold");

    const remaining = this.registry.get("timeRemainingMs") || 0;
    const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

    this.bars.setText(
      `HP: ${hp}/${hpMax}   Hunger: ${hunger}/${hungerMax}   XP: ${xp}   Lvl: ${lvl}\n` +
      `Offspring: ${offspring}   Next egg at XP: ${threshold}   Time left: ${mm}:${ss}`
    );

    // Restart
    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && this.gameOverBg.visible) {
      // Reset shared stats (minimal)
      this.registry.set("hp", this.registry.get("hpMax"));
      this.registry.set("hunger", this.registry.get("hungerMax"));
      this.registry.set("xp", 0);
      this.registry.set("level", 1);
      this.registry.set("speed", 220);
      this.registry.set("resist", 0);
      this.registry.set("magnet", 0);
      this.registry.set("offspring", 0);
      this.registry.set("reproThreshold", 200);

      // Hide game over UI and restart game scene
      this.gameOverBg.setVisible(false);
      this.gameOverText.setVisible(false);
      this.restartHint.setVisible(false);

      this.scene.get("GameScene").scene.restart();
      this._enqueue({ text: "New run started. Good luck, water bear!", kind: "note" });
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

    this.gameOverText.setText(
      `🧪 RUN COMPLETE\n\n` +
      `${reason}\n\n` +
      `Time survived: ${mm}:${ss}\n` +
      `Offspring produced: ${offspring}\n` +
      `XP earned: ${xp}\n\n` +
      `Tip: Stay fed. Hunger is the silent killer.`
    );

    // Clear any popups
    this.queue.length = 0;
    this.showing = false;
    this.popupBg.setVisible(false);
    this.popupText.setVisible(false);
  }
}

window.UIScene = UIScene;
