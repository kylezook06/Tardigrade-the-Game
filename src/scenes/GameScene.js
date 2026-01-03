/* global Phaser */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });

    this.worldW = 2400;
    this.worldH = 2400;

    this.foodSpawnInterval = 1200;   // ms
    this.hazardSpawnInterval = 2600; // ms

    this.runLengthMs = 20 * 60 * 1000; // 20 minutes

    this.currentBiome = "open";      // open | moss | lichen | soil
    this.speedMult = 1.0;
    this.hungerMult = 1.0;
  }

  create() {
    // --- World + camera ---
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this._createBackground();

    // --- Player ---
    this.player = this.physics.add.sprite(this.worldW / 2, this.worldH / 2, "player_tardi");
    this.player.setDepth(5);
    this.player.setOrigin(0.5, 0.5);
    this.player.setCollideWorldBounds(true);
    this.player.body.setDrag(600);
    this.player.body.setMaxVelocity(260);
    this.player.body.setDamping(true);

    const radius = Math.floor(this.player.width * 0.32);
    this.player.body.setCircle(
      radius,
      this.player.width / 2 - radius,
      this.player.height / 2 - radius
    );

    this.player.idleScale = 1;
    this.tweens.add({
      targets: this.player,
      idleScale: 1.03,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

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

    // --- Biomes ---
    this.biomeZones = this.add.group();
    this.soilWalls = this.add.group();  // impassable obstacles

    // Soil is solid
    this.physics.add.collider(this.player, this.soilWalls);
    this.physics.add.collider(this.hazards, this.soilWalls, this._onHazardHitsSoil, null, this);

    // --- Collisions ---
    this.physics.add.overlap(this.player, this.food, this._onEatFood, null, this);
    this.physics.add.overlap(this.player, this.hazards, this._onHitHazard, null, this);

    // --- Timers ---
    this.runStart = this.time.now;
    this.lastReproductionTime = 0;

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
    this._createBiomes();

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
      const offspring = this.registry.get("offspring");
      if (offspring > 0) {
        this._endRun("Observation complete. Reproduction successful.");
      } else {
        this._endRun("Observation complete. No reproduction occurred.");
      }
      return;
    }

    this._resolveBiome();
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

    hunger -= (6.5 * this.hungerMult) * dt; // tweak for ~20-min run pacing
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
    const speed = this.registry.get("speed") * this.speedMult;

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
    const moveSpeed = pv.length();
    const squash = Phaser.Math.Clamp(moveSpeed / 300, 0, 0.06);
    const idle = this.player.idleScale || 1;
    this.player.setScale(idle + squash, idle - squash);

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
      const key = (Math.random() < 0.6) ? "food_algae" : "food_proto";
      const f = this.food.create(p.x, p.y, key);
      f.setDepth(3);
      const r = Math.max(6, Math.floor(Math.min(f.width, f.height) * 0.35));
      f.body.setCircle(r);
    }
  }

  _spawnHazard() {
    const kinds = [
      { key: "haz_nematode", name: "Nematode", speed: 120, dmg: 10 },
      { key: "haz_amoeba", name: "Amoeba", speed: 95,  dmg: 12 },
      { key: "haz_mite", name: "Mite", speed: 140, dmg: 14 }
    ];
    const pick = Phaser.Utils.Array.GetRandom(kinds);

    const p = this._randomPointFarFromPlayer(260);
    const h = this.hazards.create(p.x, p.y, pick.key);
    h.setDepth(4);
    h.setData("kindName", pick.name);
    h.setData("baseSpeed", pick.speed);
    h.setData("damage", pick.dmg);

    const r = Math.max(8, Math.floor(Math.min(h.width, h.height) * 0.35));
    h.body.setCircle(r);
    h.body.setCollideWorldBounds(true);
    h.body.onWorldBounds = true;
    h.body.setBounce(1, 1);

    // initial drift
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    h.setVelocity(Math.cos(a) * pick.speed * 0.35, Math.sin(a) * pick.speed * 0.35);
  }

  // -----------------------------
  // Biomes
  // -----------------------------

  _setBiome(name) {
    if (this.currentBiome === name) return;
    this.currentBiome = name;

    if (name === "moss") {
      this.speedMult = 1.08;
      this.hungerMult = 0.90;
    } else if (name === "lichen") {
      this.speedMult = 0.95;
      this.hungerMult = 0.85;
    } else {
      this.speedMult = 1.00;
      this.hungerMult = 1.00;
    }

    this.game.events.emit("ui:biome", { name });
  }

  _resolveBiome() {
    let found = null;

    this.biomeZones.getChildren().forEach((z) => {
      if (found) return;
      if (this.physics.overlap(this.player, z)) {
        found = z.getData("biome");
      }
    });

    this._setBiome(found || "open");
  }

  _createBiomes() {
    this._clearBiomesAndSoil();

    const mossCount = 2;
    const lichenCount = 2;
    const soilCount = 3;

    const mossSize = { wMin: 420, wMax: 720, hMin: 360, hMax: 620 };
    const lichenSize = { wMin: 420, wMax: 720, hMin: 360, hMax: 620 };
    const soilSize = { wMin: 260, wMax: 620, hMin: 220, hMax: 520 };

    const pad = 140;
    const minFromPlayer = 520;
    const minBetweenPatches = 260;
    const minBetweenSoil = 320;

    this._placedRects = [];

    for (let i = 0; i < soilCount; i++) {
      const w = Phaser.Math.Between(soilSize.wMin, soilSize.wMax);
      const h = Phaser.Math.Between(soilSize.hMin, soilSize.hMax);

      const pos = this._findPlacement(w, h, pad, minFromPlayer, minBetweenSoil, 40);
      if (!pos) continue;

      this._placedRects.push({ x: pos.x, y: pos.y, w, h, type: "soil" });
      this._addSoilObstacle(pos.x, pos.y, w, h);
    }

    for (let i = 0; i < mossCount; i++) {
      const w = Phaser.Math.Between(mossSize.wMin, mossSize.wMax);
      const h = Phaser.Math.Between(mossSize.hMin, mossSize.hMax);

      const pos = this._findPlacement(w, h, pad, minFromPlayer, minBetweenPatches, 40);
      if (!pos) continue;

      this._placedRects.push({ x: pos.x, y: pos.y, w, h, type: "moss" });
      this._addBiomePatch(pos.x, pos.y, w, h, "moss", 0x1f6f3a, 0.22);
    }

    for (let i = 0; i < lichenCount; i++) {
      const w = Phaser.Math.Between(lichenSize.wMin, lichenSize.wMax);
      const h = Phaser.Math.Between(lichenSize.hMin, lichenSize.hMax);

      const pos = this._findPlacement(w, h, pad, minFromPlayer, minBetweenPatches, 40);
      if (!pos) continue;

      this._placedRects.push({ x: pos.x, y: pos.y, w, h, type: "lichen" });
      this._addBiomePatch(pos.x, pos.y, w, h, "lichen", 0x6fa86f, 0.18);
    }
  }

  _clearBiomesAndSoil() {
    if (this.biomeZones) {
      this.biomeZones.getChildren().forEach((z) => {
        if (z && z.body) z.body.destroy();
        if (z) z.destroy();
      });
      this.biomeZones.clear(true);
    }

    if (this.soilWalls) {
      this.soilWalls.getChildren().forEach((w) => {
        if (w && w.body) w.body.destroy();
        if (w) w.destroy();
      });
      this.soilWalls.clear(true);
    }

    if (this._biomeVisuals) {
      this._biomeVisuals.forEach((o) => o.destroy());
    }
    this._biomeVisuals = [];
  }

  _findPlacement(w, h, pad, minFromPlayer, minBetweenCenters, tries) {
    const px = this.player.x;
    const py = this.player.y;

    for (let i = 0; i < tries; i++) {
      const x = Phaser.Math.Between(pad + w / 2, this.worldW - pad - w / 2);
      const y = Phaser.Math.Between(pad + h / 2, this.worldH - pad - h / 2);

      if (Phaser.Math.Distance.Between(px, py, x, y) < minFromPlayer) continue;

      let ok = true;
      for (const r of (this._placedRects || [])) {
        const d = Phaser.Math.Distance.Between(r.x, r.y, x, y);
        if (d < minBetweenCenters) { ok = false; break; }
        if (this._rectsOverlap(r, { x, y, w, h }, 40)) { ok = false; break; }
      }

      if (!ok) continue;
      return { x, y };
    }

    return null;
  }

  _rectsOverlap(a, b, pad) {
    const ax1 = a.x - a.w / 2 - pad;
    const ax2 = a.x + a.w / 2 + pad;
    const ay1 = a.y - a.h / 2 - pad;
    const ay2 = a.y + a.h / 2 + pad;

    const bx1 = b.x - b.w / 2 - pad;
    const bx2 = b.x + b.w / 2 + pad;
    const by1 = b.y - b.h / 2 - pad;
    const by2 = b.y + b.h / 2 + pad;

    return !(ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2);
  }

  _addBiomePatch(x, y, w, h, biomeName, color, alpha) {
    const g = this.add.rectangle(x, y, w, h, color, alpha);
    g.setDepth(1);
    this._biomeVisuals = this._biomeVisuals || [];
    this._biomeVisuals.push(g);

    const zone = this.add.zone(x, y, w, h);
    this.physics.add.existing(zone, true);
    zone.body.setSize(w, h);
    zone.body.updateFromGameObject();
    zone.setData("biome", biomeName);

    this.biomeZones.add(zone);
  }

  _addSoilObstacle(x, y, w, h) {
    const g = this.add.graphics();
    g.setDepth(2);

    g.fillStyle(0x3a2a1f, 0.55);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 22);

    g.fillStyle(0x2a1d15, 0.35);
    const specks = Math.floor((w * h) / 14000);
    for (let i = 0; i < specks; i++) {
      const sx = Phaser.Math.Between(x - w / 2 + 12, x + w / 2 - 12);
      const sy = Phaser.Math.Between(y - h / 2 + 12, y + h / 2 - 12);
      const r = Phaser.Math.Between(2, 6);
      g.fillCircle(sx, sy, r);
    }

    g.lineStyle(3, 0x000000, 0.25);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);

    this._biomeVisuals = this._biomeVisuals || [];
    this._biomeVisuals.push(g);

    const wall = this.add.zone(x, y, w, h);
    this.physics.add.existing(wall, true);
    wall.body.setSize(w, h);
    wall.body.updateFromGameObject();

    this.soilWalls.add(wall);
  }

  _onHazardHitsSoil(objA, objB) {
    const hazard = (objA && objA.getData && objA.getData("baseSpeed") !== undefined) ? objA : objB;
    if (!hazard) return;

    const base = hazard.getData ? (hazard.getData("baseSpeed") || 110) : 110;
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const vx = Math.cos(a) * base * 0.4;
    const vy = Math.sin(a) * base * 0.4;

    if (hazard.setVelocity) {
      hazard.setVelocity(vx, vy);
    } else if (hazard.body && hazard.body.setVelocity) {
      hazard.body.setVelocity(vx, vy);
    }
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
    const key = food.texture.key;
    food.destroy();

    const hungerMax = this.registry.get("hungerMax");
    let hunger = this.registry.get("hunger");
    let xp = this.registry.get("xp");

    if (key === "food_algae") {
      hunger = Phaser.Math.Clamp(hunger + 20, 0, hungerMax);
      xp += 10;
      this._emitNote("Nom! Algae/biofilm consumed (+Hunger, +XP).");
    } else {
      hunger = Phaser.Math.Clamp(hunger + 14, 0, hungerMax);
      xp += 16;
      this._emitNote("Crunch! Protozoa snack (+XP, +Hunger).");
    }

    this.registry.set("hunger", hunger);
    this.registry.set("xp", xp);

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
    const cooldownMs = 90000;

    if (this.lastReproductionTime && (this.time.now - this.lastReproductionTime < cooldownMs)) {
      return;
    }

    if (xp >= threshold) {
      let offspring = this.registry.get("offspring") + 1;
      this.registry.set("offspring", offspring);
      this.lastReproductionTime = this.time.now;

      // Increase threshold each time (keeps it run-based, not instant)
      threshold = Math.floor(threshold * 1.6 + 120);
      this.registry.set("reproThreshold", threshold);

      this._emitNote(`Reproduction success! Egg laid 🥚 (Offspring: ${offspring})`);
      this._emitNote("Science note: Some tardigrades can reproduce via parthenogenesis depending on species.");

      if (offspring >= 2) {
        this._endRun("Reproduction threshold exceeded. Lineage secured.");
      }
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
