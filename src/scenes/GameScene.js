/* global Phaser */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });

    this.worldW = 2400;
    this.worldH = 2400;

    this.foodSpawnInterval = 1200;   // ms
    this.hazardSpawnInterval = 2600; // ms

    this.runLengthMs = 20 * 60 * 1000; // 20 minutes
  }

  create() {
    // --- World + camera ---
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this._createBackground();

    // --- Player ---
    this.player = this.physics.add.sprite(this.worldW / 2, this.worldH / 2, "tardigrade");
    this.player.setDepth(5);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(46, 22, true);

    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.0);

    // --- Input (keyboard + optional click-to-move) ---
    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT");
    this.pointerMoveTarget = null;

    this.input.on("pointerdown", (p) => {
      // Set a world-space target for click-to-move
      this.pointerMoveTarget = new Phaser.Math.Vector2(p.worldX, p.worldY);
      this._emitNote("Click-to-move: target set.");
    });

    // --- Groups ---
    this.food = this.physics.add.group({ immovable: true, allowGravity: false });
    this.hazards = this.physics.add.group({ immovable: false, allowGravity: false });

    // --- Collisions ---
    this.physics.add.overlap(this.player, this.food, this._onEatFood, null, this);
    this.physics.add.overlap(this.player, this.hazards, this._onHitHazard, null, this);

    // --- Timers ---
    this.runStart = this.time.now;

    this.foodTimer = this.time.addEvent({
      delay: this.foodSpawnInterval,
      loop: true,
      callback: () => this._spawnFood(2)
    });

    this.hazardTimer = this.time.addEvent({
      delay: this.hazardSpawnInterval,
      loop: true,
      callback: () => this._spawnHazard()
    });

    this.factTimer = this.time.addEvent({
      delay: 15000,
      loop: true,
      callback: () => this._emitRandomFact()
    });

    // Initial spawns
    this._spawnFood(14);
    for (let i = 0; i < 7; i++) this._spawnHazard();

    // Teach the premise once
    this._emitNote("You are a tardigrade! Eat biofilm, avoid micro-predators, survive—and reproduce.");
    this._emitRandomFact();

    // Make hazards drift around
    this._hazardWanderTimer = this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => this._hazardWander()
    });
  }

  update(time, delta) {
    const dt = delta / 1000;

    // End run at 20 minutes
    const elapsed = time - this.runStart;
    const remaining = Math.max(0, this.runLengthMs - elapsed);
    this.registry.set("timeRemainingMs", remaining);

    if (remaining <= 0) {
      this._endRun("Time’s up! You survived the full observation window.");
      return;
    }

    this._updateNeeds(dt);
    this._updateMovement(dt);
    this._applyFoodMagnet(dt);

    // Death check
    if (this.registry.get("hp") <= 0) {
      this._endRun("You didn’t make it… the micro-world is brutal.");
    }
  }

  // -----------------------------
  // Gameplay systems
  // -----------------------------

  _updateNeeds(dt) {
    // Hunger drains; when empty, HP drains
    let hunger = this.registry.get("hunger");
    const hungerMax = this.registry.get("hungerMax");

    hunger -= 6.5 * dt; // tweak for ~20-min run pacing
    hunger = Phaser.Math.Clamp(hunger, 0, hungerMax);
    this.registry.set("hunger", hunger);

    if (hunger <= 0) {
      let hp = this.registry.get("hp");
      hp -= 8.0 * dt;
      this.registry.set("hp", Phaser.Math.MaxAdd(hp, 0, 0)); // clamp >= 0
    }

    // Occasional passive XP drip could go here later (MVP: none)
  }

  _updateMovement(dt) {
    const speed = this.registry.get("speed");

    // Keyboard intent
    let vx = 0, vy = 0;
    if (this.keys.LEFT.isDown || this.keys.A.isDown) vx -= 1;
    if (this.keys.RIGHT.isDown || this.keys.D.isDown) vx += 1;
    if (this.keys.UP.isDown || this.keys.W.isDown) vy -= 1;
    if (this.keys.DOWN.isDown || this.keys.S.isDown) vy += 1;

    const usingKeyboard = (vx !== 0 || vy !== 0);

    // If keyboard is used, cancel click target (so it feels responsive)
    if (usingKeyboard) this.pointerMoveTarget = null;

    if (usingKeyboard) {
      const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(speed);
      this.player.setVelocity(v.x, v.y);
    } else if (this.pointerMoveTarget) {
      // Click-to-move steering
      const to = new Phaser.Math.Vector2(
        this.pointerMoveTarget.x - this.player.x,
        this.pointerMoveTarget.y - this.player.y
      );

      const dist = to.length();
      if (dist < 10) {
        this.pointerMoveTarget = null;
        this.player.setVelocity(0, 0);
      } else {
        to.normalize();
        this.player.setVelocity(to.x * speed, to.y * speed);
      }
    } else {
      this.player.setVelocity(0, 0);
    }

    // Face direction of travel (cute)
    const pv = this.player.body.velocity;
    if (Math.abs(pv.x) > 1) this.player.setFlipX(pv.x < 0);
  }

  _applyFoodMagnet(dt) {
    const magnet = this.registry.get("magnet");
    if (!magnet || magnet <= 0) return;

    const px = this.player.x, py = this.player.y;
    const pull = 220 * dt;

    this.food.children.iterate((f) => {
      if (!f) return;
      const d = Phaser.Math.Distance.Between(px, py, f.x, f.y);
      if (d < magnet && d > 1) {
        const t = pull / d;
        f.x = Phaser.Math.Linear(f.x, px, t);
        f.y = Phaser.Math.Linear(f.y, py, t);
      }
    });
  }

  // -----------------------------
  // Spawning
  // -----------------------------

  _spawnFood(count) {
    for (let i = 0; i < count; i++) {
      const p = this._randomPointFarFromPlayer(140);
      const f = this.food.create(p.x, p.y, "food");
      f.setDepth(3);
      f.body.setCircle(10);
    }
  }

  _spawnHazard() {
    const kinds = [
      { key: "haz_nematode", name: "Nematode", speed: 120, dmg: 10 },
      { key: "haz_amoeba", name: "Amoeba", speed: 90,  dmg: 12 },
      { key: "haz_mite", name: "Mite", speed: 140, dmg: 14 },
      { key: "haz_fungus", name: "Fungal Spore", speed: 110, dmg: 9 },
      { key: "haz_tardi", name: "Carnivorous Tardigrade", speed: 150, dmg: 16 }
    ];
    const pick = Phaser.Utils.Array.GetRandom(kinds);

    const p = this._randomPointFarFromPlayer(260);
    const h = this.hazards.create(p.x, p.y, pick.key);
    h.setDepth(4);
    h.setData("kindName", pick.name);
    h.setData("baseSpeed", pick.speed);
    h.setData("damage", pick.dmg);

    h.body.setCircle(14);
    h.body.setCollideWorldBounds(true);
    h.body.onWorldBounds = true;

    // initial drift
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    h.setVelocity(Math.cos(a) * pick.speed * 0.35, Math.sin(a) * pick.speed * 0.35);
  }

  _hazardWander() {
    // Small chance for nearest hazards to “notice” you (simple pressure)
    const px = this.player.x, py = this.player.y;

    this.hazards.children.iterate((h) => {
      if (!h) return;
      const base = h.getData("baseSpeed") || 110;
      const d = Phaser.Math.Distance.Between(px, py, h.x, h.y);

      if (d < 320 && Math.random() < 0.35) {
        // drift toward player
        const to = new Phaser.Math.Vector2(px - h.x, py - h.y).normalize().scale(base * 0.65);
        h.setVelocity(to.x, to.y);
      } else if (Math.random() < 0.65) {
        // random wander
        const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
        h.setVelocity(Math.cos(a) * base * 0.4, Math.sin(a) * base * 0.4);
      }
    });
  }

  _randomPointFarFromPlayer(minDist) {
    const px = this.player ? this.player.x : this.worldW / 2;
    const py = this.player ? this.player.y : this.worldH / 2;

    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(40, this.worldW - 40);
      const y = Phaser.Math.Between(40, this.worldH - 40);
      if (Phaser.Math.Distance.Between(px, py, x, y) >= minDist) return { x, y };
    }
    // fallback
    return { x: Phaser.Math.Between(40, this.worldW - 40), y: Phaser.Math.Between(40, this.worldH - 40) };
  }

  // -----------------------------
  // Collisions
  // -----------------------------

  _onEatFood(player, food) {
    food.destroy();

    // Restore hunger + gain XP
    const hungerMax = this.registry.get("hungerMax");
    let hunger = this.registry.get("hunger");
    hunger = Phaser.Math.Clamp(hunger + 18, 0, hungerMax);
    this.registry.set("hunger", hunger);

    let xp = this.registry.get("xp");
    xp += 12;
    this.registry.set("xp", xp);

    this._emitNote("Nom! Biofilm consumed (+Hunger, +XP).");
    if (Math.random() < 0.45) this._emitRandomFact();

    // Upgrade pacing: every 80 XP
    const level = this.registry.get("level");
    const nextLevelXP = level * 80;
    if (xp >= nextLevelXP) {
      this.registry.set("level", level + 1);
      this._applyAutoUpgrade();
    }

    // Reproduction check
    this._checkReproduction();
  }

  _onHitHazard(player, hazard) {
    // brief invuln window to prevent “audio fatigue” style spam
    if (this._invulnUntil && this.time.now < this._invulnUntil) return;
    this._invulnUntil = this.time.now + 550;

    const resist = this.registry.get("resist") || 0;
    const baseDmg = hazard.getData("damage") || 10;
    const dmg = Math.max(1, Math.round(baseDmg * (1 - resist / 100)));

    let hp = this.registry.get("hp");
    hp = Phaser.Math.Clamp(hp - dmg, 0, this.registry.get("hpMax"));
    this.registry.set("hp", hp);

    const kindName = hazard.getData("kindName") || "Hazard";
    this._emitNote(`${kindName} bumped you! (-${dmg} HP)`);

    // Knockback
    const v = new Phaser.Math.Vector2(player.x - hazard.x, player.y - hazard.y).normalize().scale(260);
    player.setVelocity(v.x, v.y);
  }

  // -----------------------------
  // Upgrades + reproduction
  // -----------------------------

  _applyAutoUpgrade() {
    const options = [
      () => {
        const m = this.registry.get("hungerMax") + 15;
        this.registry.set("hungerMax", m);
        this.registry.set("hunger", Phaser.Math.Clamp(this.registry.get("hunger") + 15, 0, m));
        this._emitNote("Upgrade: Bigger belly (+Max Hunger).");
      },
      () => {
        const s = this.registry.get("speed") + 18;
        this.registry.set("speed", s);
        this._emitNote("Upgrade: Faster feet (+Move Speed).");
      },
      () => {
        const r = Math.min(45, (this.registry.get("resist") || 0) + 6);
        this.registry.set("resist", r);
        this._emitNote("Upgrade: Tougher cuticle (+Resistance).");
      },
      () => {
        const m = Math.min(220, (this.registry.get("magnet") || 0) + 40);
        this.registry.set("magnet", m);
        this._emitNote("Upgrade: Sticky vibes (+Food Magnet).");
      }
    ];

    Phaser.Utils.Array.GetRandom(options)();
    this._emitRandomFact();
  }

  _checkReproduction() {
    let xp = this.registry.get("xp");
    let threshold = this.registry.get("reproThreshold");

    if (xp >= threshold) {
      let offspring = this.registry.get("offspring") + 1;
      this.registry.set("offspring", offspring);

      // Increase threshold each time (keeps it run-based, not instant)
      threshold = Math.round(threshold * 1.35);
      this.registry.set("reproThreshold", threshold);

      this._emitNote(`Reproduction success! Egg laid 🥚 (Offspring: ${offspring})`);
      this._emitNote("Science note: Some tardigrades can reproduce via parthenogenesis depending on species.");
    }
  }

  // -----------------------------
  // UI event helpers
  // -----------------------------

  _emitNote(text) {
    this.game.events.emit("ui:notify", { text, kind: "note" });
  }

  _emitRandomFact() {
    const facts = [
      "Tardigrades are also called “water bears.”",
      "Many tardigrades survive drying out by entering a cryptobiotic “tun” state.",
      "Some tardigrades can tolerate extreme cold, heat, and radiation better than most animals.",
      "They eat by piercing cells and sucking out nutrients—tiny, but serious.",
      "They have 8 legs with tiny claws—great for gripping biofilm.",
      "Not all tardigrades are peaceful: some species are predators of other microfauna.",
      "Their habitat includes moss, lichens, soil, and freshwater films."
    ];
    this.game.events.emit("ui:notify", { text: Phaser.Utils.Array.GetRandom(facts), kind: "fact" });
  }

  // -----------------------------
  // End run
  // -----------------------------

  _endRun(reason) {
    // Stop timers & movement; show summary via UI
    this.time.removeAllEvents();
    this.player.setVelocity(0, 0);
    this.physics.pause();

    const survivedMs = this.time.now - this.runStart;
    const offspring = this.registry.get("offspring");

    this.game.events.emit("ui:gameover", {
      reason,
      survivedMs,
      offspring,
      xp: this.registry.get("xp")
    });
  }

  _createBackground() {
    // A lightweight “microscope slide” vibe: grid + specks
    const bg = this.add.graphics();
    bg.setDepth(0);

    bg.fillStyle(0x0b1020, 1);
    bg.fillRect(0, 0, this.worldW, this.worldH);

    bg.lineStyle(1, 0x20304a, 0.35);
    const step = 120;
    for (let x = 0; x <= this.worldW; x += step) bg.lineBetween(x, 0, x, this.worldH);
    for (let y = 0; y <= this.worldH; y += step) bg.lineBetween(0, y, this.worldW, y);

    // specks
    bg.fillStyle(0x1b2a46, 0.6);
    for (let i = 0; i < 900; i++) {
      const x = Phaser.Math.Between(0, this.worldW);
      const y = Phaser.Math.Between(0, this.worldH);
      const r = Phaser.Math.Between(1, 3);
      bg.fillCircle(x, y, r);
    }
  }
}

window.GameScene = GameScene;
