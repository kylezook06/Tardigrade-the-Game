/* global Phaser */

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });

    this.worldW = 2400;
    this.worldH = 2400;

    this.foodSpawnInterval = 1200;   // ms
    this.hazardSpawnInterval = 3500; // ms

    this.runLengthMs = 20 * 60 * 1000; // 20 minutes

    this.currentBiome = "open";      // open | moss | lichen | soil
    this.speedMult = 1.0;
    this.hungerMult = 1.0;
  }

  init(data) {
    this.gameMode = (data && data.mode) || this.registry.get("gameMode") || "normal";

    if (this.gameMode === "short") {
      this.countdown = false;
      this.targetOffspring = 1;
      this.runLengthMs = 15 * 60 * 1000;
    } else if (this.gameMode === "infinite") {
      this.countdown = false;
      this.targetOffspring = Infinity;
      this.runLengthMs = Infinity;
    } else {
      this.gameMode = "normal";
      this.countdown = true;
      this.targetOffspring = 4;
      this.runLengthMs = 20 * 60 * 1000;
    }

    this.registry.set("gameMode", this.gameMode);
  }

  create() {
    this._resetRunState();
    this._initCodexIfNeeded();
    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");
    if (!this.scene.isActive("CodexScene")) this.scene.launch("CodexScene");
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
    this.tunKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyM = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.pointerMoveTarget = null;
    this.tun = {
      active: false,
      durationMs: 6000,
      cooldownMs: 20000,
      endsAt: 0,
      readyAt: 0
    };
    this.tunUsedOnce = false;

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
    this.physics.add.collider(this.player, this.soilWalls, this._onPlayerHitsSoil, null, this);
    this.physics.add.collider(this.hazards, this.soilWalls, this._onHazardHitsSoil, null, this);

    // --- Collisions ---
    this.physics.add.overlap(this.player, this.food, this._onEatFood, null, this);
    this.physics.add.overlap(this.player, this.hazards, this._onHitHazard, null, this);

    // --- Timers ---
    this.runStart = this.time.now;
    this.lastReproductionTime = 0;
    this.predators = this.physics.add.group();
    this.predatorSchedule = [2, 4, 6, 12, 14, 16].map((m) => m * 60 * 1000);
    this.predatorScheduleIndex = 0;
    this.maxPredators = 6;
    this.predatorFovDeg = 85;
    this.predatorRange = 780;
    this.predatorSpeed = 210;
    this.predatorWanderSpeed = 90;
    this.predatorTurnRate = 0.06;
    this.predatorWarned = false;
    this.hasUsedMusicKey = false;
    this.game.events.emit("ui:notify", { text: "Tip: Press M to cycle background music (includes OFF).", kind: "note" });
    this.recentFacts = [];
    this.maxRecentFacts = 4;
    this.maxHazards = 26;
    this._lastEatMsgAt = -999999;
    this._lastHitMsgAt = -999999;
    // --- Mass Extinction Event (freeze) ---
    this.extinction = {
      warned: false,
      started: false,
      ended: false,
      startAtMs: this.runStart + (10 * 60 * 1000),
      warnAtMs: this.runStart + (10 * 60 * 1000) - (15 * 1000),
      endAtMs: 0,
      dps: 14
    };

    // --- Audio ---
    this.sfxEat = this.sound.add("sfx_eat", { volume: 0.6 });
    this.sfxOuch = this.sound.add("sfx_ouch", { volume: 0.7 });
    this._eatSfxNextAt = 0;
    this._ouchSfxNextAt = 0;

    this.bgmKeys = ["bgm1", "bgm2", "bgm3", "bgm4", "bgm5"];
    this.bgm = null;
    this.registry.set("musicIndex", 0);
    this._setMusicByIndex(0);

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
    for (let i = 0; i < 5; i++) this._spawnHazard();
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
    if (this.registry.get("runEnded")) return;
    if (this.registry.get("codexOpen")) return;
    if (this.registry.get("upgradeOpen")) return;
    const dt = delta / 1000;

    const elapsedMs = time - this.runStart;
    this.registry.set("timeElapsedMs", elapsedMs);
    while (
      this.predatorScheduleIndex < this.predatorSchedule.length &&
      elapsedMs >= this.predatorSchedule[this.predatorScheduleIndex]
    ) {
      if (this.predators.getLength() < this.maxPredators) this._spawnPredator();
      this.predatorScheduleIndex++;
    }

    // End run at 20 minutes
    if (this.countdown) {
      const remaining = Math.max(0, this.runLengthMs - elapsedMs);
      this.registry.set("timeRemainingMs", remaining);
    } else {
      this.registry.set("timeRemainingMs", -1);
    }
    const remaining = this.registry.get("timeRemainingMs");

    if (this.countdown && remaining <= 0) {
      const offspring = this.registry.get("offspring");
      if (offspring > 0) {
        this._endRun("Observation complete. Reproduction successful.");
      } else {
        this._endRun("Observation complete. No reproduction occurred.");
      }
      return;
    }

    this._resolveBiome();
    this._updateExtinctionCountdown(time);
    this._updateExtinctionEvent(time, delta);
    this._updateTun(time);
    this._updatePredator(time, dt);
    this._updateNeeds(dt);
    this._updateMovement(dt);
    this._applyFoodMagnet(dt);
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this.hasUsedMusicKey = true;
      this._cycleMusic();
    }

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

    let hungerDrain = 6.5;
    hungerDrain *= this.hungerMult;
    if (this.tun && this.tun.active) hungerDrain *= 0.2;
    hunger -= hungerDrain * dt; // tweak for ~20-min run pacing
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
    let speed = this.registry.get("speed") * this.speedMult;
    if (this.tun && this.tun.active) speed *= 0.65;

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
      const angle = Math.atan2(v.y, v.x);
      const step = Math.PI / 4;
      const snapped = Math.round(angle / step) * step;
      this.player.setRotation(snapped);
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
        const angle = Math.atan2(to.y, to.x);
        const step = Math.PI / 4;
        const snapped = Math.round(angle / step) * step;
        this.player.setRotation(snapped);
      }
    } else {
      this.player.setVelocity(0, 0);
    }

    // Face direction of travel (cute)
    const pv = this.player.body.velocity;
    const moveSpeed = pv.length();
    const squash = Phaser.Math.Clamp(moveSpeed / 300, 0, 0.06);
    const baseScale = (this.tun && this.tun.active) ? 0.88 : (this.player.idleScale || 1);
    this.player.setScale(baseScale + squash, baseScale - squash);

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
      this._addFoodTween(f, key);
    }
  }

  _spawnHazard() {
    const maxHazards = this.maxHazards || 26;
    if (this.hazards.getLength() >= maxHazards) return;
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
    this._addEnemyTween(h, pick.name.toLowerCase());

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
      this._unlockCodex("biome_moss");
    } else if (name === "lichen") {
      this.speedMult = 0.95;
      this.hungerMult = 0.85;
      this._unlockCodex("biome_lichen");
    } else {
      this.speedMult = 1.00;
      this.hungerMult = 1.00;
    }

    this.game.events.emit("ui:biome", { name });
    if (Math.random() < 0.35) {
      const factByBiome = {
        moss: "Moss holds tiny water films between leaves—micro-habitats for rotifers, nematodes, and tardigrades.",
        lichen: "Lichen is a symbiosis: fungus + photosynthetic partner (algae or cyanobacteria).",
        open: "In thin water films, movement and feeding happen in a crowded world of microbes and microfauna."
      };
      this._emitFact(factByBiome[name] || factByBiome.open);
    }
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
      this._addBiomePatch(pos.x, pos.y, w, h, "moss");
    }

    for (let i = 0; i < lichenCount; i++) {
      const w = Phaser.Math.Between(lichenSize.wMin, lichenSize.wMax);
      const h = Phaser.Math.Between(lichenSize.hMin, lichenSize.hMax);

      const pos = this._findPlacement(w, h, pad, minFromPlayer, minBetweenPatches, 40);
      if (!pos) continue;

      this._placedRects.push({ x: pos.x, y: pos.y, w, h, type: "lichen" });
      this._addBiomePatch(pos.x, pos.y, w, h, "lichen");
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

  _addBiomePatch(x, y, w, h, biomeName) {
    const tileKey = `biome_${biomeName}`;
    const tiles = this.add.tileSprite(x, y, w, h, tileKey);
    tiles.setDepth(1);
    tiles.setAlpha(0.55);
    this._biomeVisuals = this._biomeVisuals || [];
    this._biomeVisuals.push(tiles);

    const edgeFade = this.add.tileSprite(x, y, w + 64, h + 64, tileKey);
    edgeFade.setDepth(0);
    const isSoftBiome = (biomeName === "moss" || biomeName === "lichen");
    edgeFade.setAlpha(isSoftBiome ? 0.10 : 0.18);
    edgeFade.setBlendMode(isSoftBiome ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.MULTIPLY);
    this._biomeVisuals.push(edgeFade);

    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    maskGfx.fillStyle(0xffffff, 1);

    const points = 32;
    const rx = (w * 0.50) * 0.98;
    const ry = (h * 0.50) * 0.98;
    const noise = 0.14;
    const seed = Phaser.Math.Between(0, 99999);

    maskGfx.beginPath();
    for (let i = 0; i <= points; i++) {
      const t = (i / points) * Math.PI * 2;
      const n =
        Math.sin(t * 2 + seed) * 0.55 +
        Math.cos(t * 3 - seed * 0.7) * 0.35 +
        Math.sin(t * 5 + seed * 0.13) * 0.25;

      const rnx = rx * (1 + n * noise);
      const rny = ry * (1 + n * noise);
      const px = x + Math.cos(t) * rnx;
      const py = y + Math.sin(t) * rny;

      if (i === 0) maskGfx.moveTo(px, py);
      else maskGfx.lineTo(px, py);
    }
    maskGfx.closePath();
    maskGfx.fillPath();

    const geomMask = maskGfx.createGeometryMask();
    tiles.setMask(geomMask);
    edgeFade.setMask(geomMask);

    const rim = this._drawFeatherRim(
      x, y, w, h, seed,
      0.05,
      20, 12, 4,
      Phaser.BlendModes.NORMAL
    );

    this._biomeVisuals.push(maskGfx);
    this._biomeVisuals.push(rim);

    const zone = this.add.zone(x, y, w, h);
    this.physics.add.existing(zone, true);
    zone.body.setSize(w, h);
    zone.body.updateFromGameObject();
    zone.setData("biome", biomeName);

    this.biomeZones.add(zone);
  }

  _addSoilObstacle(x, y, w, h) {
    const tile = this.add.tileSprite(x, y, w, h, "biome_soil");
    tile.setDepth(2);
    tile.setAlpha(0.95);
    tile.setTint(0xd6b08c);
    this._biomeVisuals = this._biomeVisuals || [];

    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    maskGfx.fillStyle(0xffffff, 1);

    const points = 32;
    const rx = (w * 0.50) * 0.98;
    const ry = (h * 0.50) * 0.98;
    const noise = 0.18;
    const seed = Phaser.Math.Between(0, 99999);

    maskGfx.beginPath();
    for (let i = 0; i <= points; i++) {
      const t = (i / points) * Math.PI * 2;
      const n =
        Math.sin(t * 2 + seed) * 0.55 +
        Math.cos(t * 3 - seed * 0.7) * 0.35 +
        Math.sin(t * 5 + seed * 0.13) * 0.25;

      const rnx = rx * (1 + n * noise);
      const rny = ry * (1 + n * noise);
      const px = x + Math.cos(t) * rnx;
      const py = y + Math.sin(t) * rny;

      if (i === 0) maskGfx.moveTo(px, py);
      else maskGfx.lineTo(px, py);
    }
    maskGfx.closePath();
    maskGfx.fillPath();

    const geomMask = maskGfx.createGeometryMask();
    tile.setMask(geomMask);

    const rim = this._drawFeatherRim(
      x, y, w, h, seed,
      0.14,
      12, 8, 2,
      Phaser.BlendModes.MULTIPLY
    );

    this._biomeVisuals.push(tile, maskGfx, rim);

    const blobs = 7;
    const rxColl = (w * 0.5) * 0.72;
    const ryColl = (h * 0.5) * 0.72;

    for (let i = 0; i < blobs; i++) {
      const t = (i / blobs) * Math.PI * 2;
      const nx =
        Math.sin(t * 2 + seed) * 0.55 +
        Math.cos(t * 3 - seed * 0.7) * 0.35 +
        Math.sin(t * 5 + seed * 0.13) * 0.25;

      const px = x + Math.cos(t) * rxColl * (1 + nx * 0.10);
      const py = y + Math.sin(t) * ryColl * (1 + nx * 0.10);

      const r = Math.max(28, Math.floor(Math.min(w, h) * 0.18));
      const node = this.add.zone(px, py, r * 2, r * 2);
      this.physics.add.existing(node, true);
      node.body.setCircle(r);
      node.body.updateFromGameObject();
      node.setData("r", r);

      this.soilWalls.add(node);
    }
  }

  _drawFeatherRim(x, y, w, h, seed, baseAlpha, expandStart, expandStep, rings, blendMode) {
    const g = this.add.graphics();
    g.setDepth(0);
    g.setBlendMode(blendMode || Phaser.BlendModes.NORMAL);

    const points = 32;
    const rx0 = (w * 0.5) * 0.98;
    const ry0 = (h * 0.5) * 0.98;
    const noise = 0.14;

    for (let r = 0; r < rings; r++) {
      const expand = expandStart + r * expandStep;
      const alpha = baseAlpha * (1 - r / rings);

      g.fillStyle(0x000000, alpha);
      g.beginPath();

      for (let i = 0; i <= points; i++) {
        const t = (i / points) * Math.PI * 2;
        const n =
          Math.sin(t * 2 + seed) * 0.55 +
          Math.cos(t * 3 - seed * 0.7) * 0.35 +
          Math.sin(t * 5 + seed * 0.13) * 0.25;

        const rnx = (rx0 + expand) * (1 + n * noise);
        const rny = (ry0 + expand) * (1 + n * noise);

        const px = x + Math.cos(t) * rnx;
        const py = y + Math.sin(t) * rny;

        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
    }

    return g;
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

  _onPlayerHitsSoil() {
    this._unlockCodex("biome_soil");
  }

  _addFoodTween(sprite, kindKey) {
    if (!sprite || sprite.getData("tweened")) return;
    sprite.setData("tweened", true);

    this.tweens.killTweensOf(sprite);
    const phase = Phaser.Math.Between(0, 200);

    this.tweens.add({
      targets: sprite,
      scale: { from: 1.0, to: 1.08 },
      alpha: { from: 1.0, to: 0.90 },
      angle: { from: -2, to: 2 },
      duration: 900 + phase,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    if (kindKey === "food_proto") {
      this.tweens.add({
        targets: sprite,
        angle: "+=3",
        duration: 1200 + phase,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }
  }

  _addEnemyTween(sprite, kind) {
    if (!sprite || sprite.getData("tweened")) return;
    sprite.setData("tweened", true);

    if (kind === "amoeba") {
      this.tweens.add({
        targets: sprite,
        duration: 900,
        scaleX: sprite.scaleX * 1.06,
        scaleY: sprite.scaleY * 0.94,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    } else if (kind === "mite") {
      this.tweens.add({
        targets: sprite,
        duration: 220,
        angle: "+=2",
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
      this.tweens.add({
        targets: sprite,
        duration: 500,
        y: sprite.y - 2,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    } else if (kind === "nematode") {
      this.tweens.add({
        targets: sprite,
        duration: 320,
        angle: "+=4",
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    } else {
      this.tweens.add({
        targets: sprite,
        duration: 650,
        y: sprite.y - 2,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }
  }

  _addPredatorBreathTween(predator) {
    if (!predator || predator.getData("breathing")) return;
    predator.setData("breathing", true);

    const phase = Phaser.Math.Between(0, 250);

    this.tweens.add({
      targets: predator,
      scaleX: predator.scaleX * 1.05,
      scaleY: predator.scaleY * 0.97,
      duration: 950 + phase,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    this.tweens.add({
      targets: predator,
      angle: "+=2",
      duration: 1200 + phase,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
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
      if (Phaser.Math.Distance.Between(px, py, x, y) < minDist) continue;
      if (this._isPointInSoil && this._isPointInSoil(x, y, 40)) continue;
      return { x, y };
    }
    // fallback
    return { x: Phaser.Math.Between(40, this.worldW - 40), y: Phaser.Math.Between(40, this.worldH - 40) };
  }

  _isPointInSoil(x, y, pad) {
    if (!this.soilWalls) return false;
    const nodes = this.soilWalls.getChildren();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const r = (n.getData && n.getData("r")) ? n.getData("r") : 32;
      const d = Phaser.Math.Distance.Between(x, y, n.x, n.y);
      if (d <= r + pad) return true;
    }
    return false;
  }

  // -----------------------------
  // Collisions
  // -----------------------------

  _onEatFood(player, food) {
    const key = food.texture.key;
    food.destroy();
    this._playSfx("eat");
    if (key === "food_algae") this._unlockCodex("food_algae");
    else this._unlockCodex("food_proto");

    const hungerMax = this.registry.get("hungerMax");
    let hunger = this.registry.get("hunger");
    let xp = this.registry.get("xp");

    if (key === "food_algae") {
      hunger = Phaser.Math.Clamp(hunger + 20, 0, hungerMax);
      xp += 10;
      if (this.time.now - this._lastEatMsgAt >= 30000) {
        this._emitNote("Nom! Algae/biofilm consumed (+Hunger, +XP).");
        this._lastEatMsgAt = this.time.now;
      }
    } else {
      hunger = Phaser.Math.Clamp(hunger + 14, 0, hungerMax);
      xp += 16;
      if (this.time.now - this._lastEatMsgAt >= 30000) {
        this._emitNote("Crunch! Protozoa snack (+XP, +Hunger).");
        this._lastEatMsgAt = this.time.now;
      }
    }

    this.registry.set("hunger", hunger);
    this.registry.set("xp", xp);

    if (Math.random() < 0.30) {
      const facts = {
        food_algae: "Biofilms are communities of microbes stuck to surfaces—like a living buffet.",
        food_proto: "Protozoa are single-celled predators and grazers—important in microbial food webs."
      };
      this._emitFact(facts[key] || "Micro-food fuels the whole ecosystem.");
    }

    if (Math.random() < 0.45) this._emitRandomFact();

    // Upgrade pacing: choice every 5 levels
    const level = this.registry.get("level");
    let nextLevelXP = this.registry.get("nextLevelXp") || this._xpForNextLevel(level);

    while (xp >= nextLevelXP) {
      const nextLevel = this.registry.get("level") + 1;
      this.registry.set("level", nextLevel);
      nextLevelXP = this._xpForNextLevel(nextLevel);
      this.registry.set("nextLevelXp", nextLevelXP);
      this._emitNote(`Level up! (${nextLevel})`);

      if (nextLevel % 5 === 0) {
        this._openUpgradeChoice();
        break;
      }
    }

    // Reproduction check
    this._checkReproduction();
  }

  _onHitHazard(player, hazard) {
    // brief invuln window to prevent “audio fatigue” style spam
    if (this._invulnUntil && this.time.now < this._invulnUntil) return;
    this._invulnUntil = this.time.now + 550;

    this._playSfx("ouch");
    const resistBase = this.registry.get("resist") || 0;
    let resist = resistBase;
    if (this.tun && this.tun.active) resist += 70;
    resist = Math.min(resist, 90);
    const baseDmg = hazard.getData("damage") || 10;
    const dmg = Math.max(1, Math.round(baseDmg * (1 - resist / 100)));

    let hp = this.registry.get("hp");
    hp = Phaser.Math.Clamp(hp - dmg, 0, this.registry.get("hpMax"));
    this.registry.set("hp", hp);

    const kindName = hazard.getData("kindName") || "Hazard";
    if (kindName === "Nematode") this._unlockCodex("haz_nematode");
    if (kindName === "Amoeba") this._unlockCodex("haz_amoeba");
    if (kindName === "Mite") this._unlockCodex("haz_mite");
    if (this.time.now - this._lastHitMsgAt >= 30000) {
      this._emitNote(`${kindName} bumped you! (-${dmg} HP)`);
      this._lastHitMsgAt = this.time.now;
    }

    if (Math.random() < 0.35) {
      const facts = {
        Nematode: "Nematodes are among the most abundant animals on Earth; many live in soil and water films.",
        Amoeba: "Amoebae move and feed using pseudopods, engulfing prey by phagocytosis.",
        Mite: "Mites are tiny arthropods; many thrive in moss and soil microhabitats."
      };
      if (facts[kindName]) {
        this._emitFact(facts[kindName]);
      }
    }

    // Knockback
    const v = new Phaser.Math.Vector2(player.x - hazard.x, player.y - hazard.y).normalize().scale(260);
    player.setVelocity(v.x, v.y);
  }

  _updateTun(time) {
    if (Phaser.Input.Keyboard.JustDown(this.tunKey)) {
      if (!this.tun.active && time >= this.tun.readyAt) {
        this._enterTun(time);
      } else {
        const ms = Math.max(0, this.tun.readyAt - time);
        if (ms > 0) {
          this.game.events.emit("ui:notify", { text: `Tun recharging (${Math.ceil(ms / 1000)}s)`, kind: "note" });
        }
      }
    }

    if (this.tun.active && time >= this.tun.endsAt) {
      this._exitTun();
    }

    this.registry.set("tunActive", this.tun.active);
    this.registry.set("tunReadyInMs", Math.max(0, this.tun.readyAt - time));
    this.registry.set("tunEndsInMs", Math.max(0, this.tun.endsAt - time));
  }

  _enterTun(time) {
    this.tun.active = true;
    this.tun.endsAt = time + this.tun.durationMs;
    this.tun.readyAt = time + this.tun.durationMs + this.tun.cooldownMs;

    this.player.setScale(0.88);
    this.player.setAlpha(0.92);
    this.player.setTint(0xbfd7ff);

    if (!this.tunUsedOnce) {
      this._emitNote("Tun state: tardigrades can suspend metabolism under extreme conditions.");
      this.tunUsedOnce = true;
    }
    this._emitFact("Tun Mode: ACTIVE (cryptobiosis)");
  }

  _exitTun() {
    this.tun.active = false;

    this.player.setScale(1);
    this.player.setAlpha(1);
    this.player.clearTint();

    this.game.events.emit("ui:notify", { text: "Tun Mode ended.", kind: "note" });
  }

  // -----------------------------
  // Upgrades + reproduction
  // -----------------------------

  _resetRunState() {
    this.registry.set("hpMax", 100);
    this.registry.set("hp", 100);

    this.registry.set("hungerMax", 100);
    this.registry.set("hunger", 100);

    this.registry.set("xp", 0);
    this.registry.set("level", 1);
    this.registry.set("nextLevelXp", this._xpForNextLevel(1));

    this.registry.set("speed", 220);
    this.registry.set("resist", 0);
    this.registry.set("magnet", 0);

    this.registry.set("offspring", 0);
    this.registry.set("reproThreshold", 5000);

    this.registry.set("runEnded", false);
    this.registry.set("tunActive", false);
    this.registry.set("tunReadyInMs", 0);
    this.registry.set("tunEndsInMs", 0);
    this.registry.set("codexOpen", false);
    this.registry.set("freezeActive", false);
    this.registry.set("extinctionCountdownMs", 0);
    this.registry.set("upgradeOpen", false);
    this.registry.set("upgradeHistory", []);
    this.registry.set("codex", { entries: {}, rewarded: false, total: 10 });
  }

  _initCodexIfNeeded() {
    if (!this.registry.get("codex")) {
      this.registry.set("codex", { entries: {}, rewarded: false, total: 10 });
    }
  }

  _unlockCodex(key) {
    this._initCodexIfNeeded();
    const codex = this.registry.get("codex");
    codex.entries[key] = codex.entries[key] || { unlocked: false, seenAtMs: 0 };

    if (!codex.entries[key].unlocked) {
      codex.entries[key].unlocked = true;
      codex.entries[key].seenAtMs = this.time.now - this.runStart;
      this.registry.set("codex", codex);
      this.game.events.emit("ui:codexUnlock", { key });

      const total = codex.total || 0;
      const unlockedCount = Object.values(codex.entries).filter((e) => e.unlocked).length;
      if (total > 0 && unlockedCount >= total && !codex.rewarded) {
        codex.rewarded = true;
        this.registry.set("codex", codex);

        const hpMax = this.registry.get("hpMax") + 25;
        this.registry.set("hpMax", hpMax);
        this.registry.set("hp", Phaser.Math.Clamp(this.registry.get("hp") + 25, 0, hpMax));
        this._emitNote("Codex complete! +25 HP bonus.");
      }
    }
  }

  applyCodexPauseDuration(durationMs) {
    if (!durationMs) return;
    this.runStart += durationMs;

    if (this.lastReproductionTime) {
      this.lastReproductionTime += durationMs;
    }

    if (this.tun) {
      this.tun.readyAt += durationMs;
      this.tun.endsAt += durationMs;
    }

    if (this.extinction) {
      this.extinction.startAtMs += durationMs;
      this.extinction.warnAtMs += durationMs;
      if (this.extinction.endAtMs) this.extinction.endAtMs += durationMs;
    }

    if (this.predators) {
      this.predators.children.iterate((predator) => {
        if (!predator) return;
        const nextWanderAt = predator.getData("nextWanderAt");
        if (typeof nextWanderAt === "number" && nextWanderAt) {
          predator.setData("nextWanderAt", nextWanderAt + durationMs);
        }
      });
    }
  }

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
        const m = Math.min(300, (this.registry.get("magnet") || 0) + 40);
        this.registry.set("magnet", m);
        this._emitNote("Upgrade: Sticky vibes (+Food Magnet).");
      }
    ];

    Phaser.Utils.Array.GetRandom(options)();
    this._emitRandomFact();
  }

  _openUpgradeChoice() {
    if (this.registry.get("upgradeOpen")) return;
    const options = this._rollUpgradeOptions(3);
    this.registry.set("upgradeOpen", true);
    this.game.events.emit("ui:upgradeChoice", { options });
    this.scene.pause();
  }

  _rollUpgradeOptions(count) {
    const defs = [
      {
        id: "belly",
        title: "Bigger Belly",
        desc: "+15 max hunger (more buffer between meals).",
        canShow: () => true
      },
      {
        id: "speed",
        title: "Faster Feet",
        desc: "+18 move speed.",
        canShow: () => true
      },
      {
        id: "resist",
        title: "Tougher Cuticle",
        desc: "+6 resistance (reduces damage), up to 45.",
        canShow: () => (this.registry.get("resist") || 0) < 45
      },
      {
        id: "magnet",
        title: "Sticky Vibes",
        desc: "+40 food magnet radius, up to 300.",
        canShow: () => (this.registry.get("magnet") || 0) < 300
      }
    ];

    const history = this.registry.get("upgradeHistory") || [];
    const lastPick = history.length ? history[history.length - 1] : null;

    let pool = defs.filter((d) => d.canShow());
    if (pool.length >= count + 1 && lastPick) {
      pool = pool.filter((d) => d.id !== lastPick);
    }

    const magnetVal = this.registry.get("magnet") || 0;
    const picks = [];

    if (magnetVal < 300) {
      const mag = pool.find((d) => d.id === "magnet") || defs.find((d) => d.id === "magnet");
      if (mag) {
        picks.push(mag);
        pool = pool.filter((d) => d.id !== "magnet");
      }
    }

    Phaser.Utils.Array.Shuffle(pool);
    while (picks.length < count && pool.length) {
      picks.push(pool.shift());
    }

    while (picks.length < count) {
      picks.push(defs[0]);
    }

    return picks.map((p) => ({ id: p.id, title: p.title, desc: p.desc }));
  }

  applyUpgradeById(id) {
    const defs = {
      belly: () => {
        const m = this.registry.get("hungerMax") + 15;
        this.registry.set("hungerMax", m);
        this.registry.set("hunger", Phaser.Math.Clamp(this.registry.get("hunger") + 15, 0, m));
        this._emitNote("Upgrade: Bigger belly (+Max Hunger).");
      },
      speed: () => {
        const s = this.registry.get("speed") + 18;
        this.registry.set("speed", s);
        this._emitNote("Upgrade: Faster feet (+Move Speed).");
      },
      resist: () => {
        const r = Math.min(45, (this.registry.get("resist") || 0) + 6);
        this.registry.set("resist", r);
        this._emitNote("Upgrade: Tougher cuticle (+Resistance).");
      },
      magnet: () => {
        const m = Math.min(300, (this.registry.get("magnet") || 0) + 40);
        this.registry.set("magnet", m);
        this._emitNote("Upgrade: Sticky vibes (+Food Magnet).");
      }
    };

    if (defs[id]) defs[id]();

    const history = this.registry.get("upgradeHistory") || [];
    history.push(id);
    this.registry.set("upgradeHistory", history.slice(-12));

    this.registry.set("upgradeOpen", false);
    this._emitRandomFact();
  }

  _xpForNextLevel(level) {
    if (level <= 5) return 120 + level * 40;
    if (level <= 10) return 400 + level * 80;
    return 1200 + level * level * 12;
  }

  _checkReproduction() {
    const xp = this.registry.get("xp");
    let threshold = this.registry.get("reproThreshold");
    const cooldownMs = 90000;

    if (this.lastReproductionTime && (this.time.now - this.lastReproductionTime < cooldownMs)) return;

    if (xp >= threshold) {
      let offspring = (this.registry.get("offspring") || 0) + 1;
      this.registry.set("offspring", offspring);
      this.lastReproductionTime = this.time.now;

      threshold += 5000;
      this.registry.set("reproThreshold", threshold);

      this._emitNote(`Reproduction success! Egg laid 🥚 (Offspring: ${offspring})`);
      this._emitNote("Science note: Some tardigrades can reproduce via parthenogenesis depending on species.");

      if (offspring >= this.targetOffspring) {
        this._endRun(`Lineage secured: ${offspring} offspring produced.`);
      }
    }
  }

  _spawnPredator() {
    if (this.predators.getLength() >= this.maxPredators) return;
    const p = this._randomPointFarFromPlayer ? this._randomPointFarFromPlayer(650) : { x: 200, y: 200 };
    const predator = this.predators.create(p.x, p.y, "player_tardi");
    predator.setDepth(4);
    predator.setTint(0xff8888);
    predator.setScale(1.05);
    predator.setAlpha(0.95);
    predator.setData("baseScale", predator.scaleX);
    predator.setData("baseAlpha", predator.alpha);
    predator.setData("baseTint", 0xff8888);
    this._addPredatorBreathTween(predator);

    const r = Math.floor(predator.width * 0.30);
    predator.body.setCircle(r, predator.width / 2 - r, predator.height / 2 - r);
    predator.body.setDrag(250);
    predator.body.setMaxVelocity(this.predatorSpeed);
    predator.setCollideWorldBounds(true);

    predator.setData("facing", Phaser.Math.FloatBetween(-Math.PI, Math.PI));
    predator.setData("nextWanderAt", 0);

    this.physics.add.overlap(this.player, predator, this._onHitPredator, null, this);
    this.physics.add.overlap(predator, this.food, this._onPredatorEatFood, null, this);
    this.physics.add.collider(predator, this.soilWalls);

    if (!this.predatorWarned) {
      this.predatorWarned = true;
      this._emitFact("A carnivorous tardigrade enters the ecosystem.");
    }
    this._emitFact("Some tardigrade species are carnivorous and hunt other microfauna (even other tardigrades).");
    this._unlockCodex("pred_carnivorous_tardigrade");
    if (this.extinction && this.extinction.started && !this.extinction.ended) {
      this._setPredatorTun(predator, true);
    }
  }

  _updatePredator(time, dt) {
    if (!this.predators || this.predators.getLength() === 0) return;

    const px = this.player.x, py = this.player.y;

    this.predators.children.iterate((predator) => {
      if (!predator || !predator.active) return;
      if (predator.getData("tun")) {
        predator.setVelocity(0, 0);
        return;
      }

      const ex = predator.x, ey = predator.y;
      const toPlayer = new Phaser.Math.Vector2(px - ex, py - ey);
      const dist = toPlayer.length();
      const facing = predator.getData("facing") || 0;
      const canSee = this._predatorCanSeePlayer(ex, ey, px, py, dist, facing);

      if (canSee) {
        const targetAng = Math.atan2(toPlayer.y, toPlayer.x);
        const nextFacing = Phaser.Math.Angle.RotateTo(facing, targetAng, this.predatorTurnRate);
        predator.setData("facing", nextFacing);

        const v = new Phaser.Math.Vector2(Math.cos(nextFacing), Math.sin(nextFacing))
          .scale(this.predatorSpeed);
        predator.setVelocity(v.x, v.y);
        this._set8WayFacing(predator, v.x, v.y);
      } else {
        if (Math.random() < 0.25 && this.food && this.food.getLength() > 0) {
          let closest = null;
          let bestD = 999999;

          this.food.children.iterate((f) => {
            if (!f) return;
            const d = Phaser.Math.Distance.Between(ex, ey, f.x, f.y);
            if (d < bestD) { bestD = d; closest = f; }
          });

          if (closest && bestD < 420) {
            const ang = Math.atan2(closest.y - ey, closest.x - ex);
            predator.setData("wanderAng", ang);
            predator.setData("nextWanderAt", time + Phaser.Math.Between(700, 1200));
          }
        }

        let nextWanderAt = predator.getData("nextWanderAt") || 0;
        let wanderAng = predator.getData("wanderAng") || 0;
        if (time >= nextWanderAt) {
          nextWanderAt = time + Phaser.Math.Between(900, 1700);
          wanderAng = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
          predator.setData("nextWanderAt", nextWanderAt);
          predator.setData("wanderAng", wanderAng);
        }

        const v = new Phaser.Math.Vector2(Math.cos(wanderAng), Math.sin(wanderAng))
          .scale(this.predatorWanderSpeed);
        predator.setVelocity(v.x, v.y);
        this._set8WayFacing(predator, v.x, v.y);

        const nextFacing = Phaser.Math.Angle.RotateTo(facing, wanderAng, 0.02);
        predator.setData("facing", nextFacing);
      }

    });
  }

  _updateExtinctionCountdown(nowMs) {
    if (!this.extinction) {
      this.registry.set("extinctionCountdownMs", 0);
      return;
    }

    const tToStart = this.extinction.startAtMs - nowMs;

    if (this.extinction.started || this.extinction.ended) {
      this.registry.set("extinctionCountdownMs", 0);
      return;
    }

    if (tToStart > 0 && tToStart <= 15000) {
      this.registry.set("extinctionCountdownMs", tToStart);
    } else {
      this.registry.set("extinctionCountdownMs", 0);
    }
  }

  _updateExtinctionEvent(time, delta) {
    if (!this.extinction) return;

    if (!this.extinction.warned && time >= this.extinction.warnAtMs) {
      this.extinction.warned = true;
      this._emitNote("⚠️ Freeze front approaching! Enter Tun Mode (SPACE) to survive.");
      this._emitFact("Environmental shocks (freezing/drying) can wipe out many microfauna—tardigrades cheat death via cryptobiosis.");
    }

    if (!this.extinction.started && time >= this.extinction.startAtMs) {
      this.extinction.started = true;
      this.extinction.endAtMs = time + Math.max(4000, (this.tun.durationMs - 800));
      this.registry.set("freezeActive", true);
      this.registry.set("extinctionCountdownMs", 0);
      this.cameras.main.flash(250, 255, 255, 255);
      this._setAllPredatorsTun(true);

      if (this.hazards) this.hazards.clear(true, true);
      if (this.hazardTimer) this.hazardTimer.paused = true;

      this._emitNote("❄️ Mass extinction event! Freeze conditions sweep the habitat.");
      this.game.events.emit("ui:notify", { text: "Stay in Tun until it passes…", kind: "note" });
    }

    if (this.extinction.started && !this.extinction.ended) {
      if (time < this.extinction.endAtMs) {
        if (!(this.tun && this.tun.active)) {
          const dt = delta / 1000;
          let hp = this.registry.get("hp");
          hp = Phaser.Math.Clamp(hp - (this.extinction.dps * dt), 0, this.registry.get("hpMax"));
          this.registry.set("hp", hp);
        }
      } else {
        this.extinction.ended = true;
        this.registry.set("freezeActive", false);
        this.registry.set("extinctionCountdownMs", 0);
        this._setAllPredatorsTun(false);

        if (this.hazardTimer) this.hazardTimer.paused = false;

        this.maxPredators = Math.min(9, this.maxPredators * 2);
        this.maxHazards = Math.min(70, (this.maxHazards || 26) * 2);

        this._emitNote("🌡️ Freeze passes. The ecosystem rebounds… violently.");
        this._emitFact("Boom-bust cycles can happen in microhabitats as conditions shift and survivors repopulate.");
        this._unlockCodex("tun_cryptobiosis");
        this._emitFact("Codex unlocked: Tun Mode — cryptobiosis lets tardigrades endure freezing and desiccation.");
      }
    }
  }

  _setAllPredatorsTun(active) {
    if (!this.predators) return;
    this.predators.children.iterate((predator) => {
      if (!predator) return;
      this._setPredatorTun(predator, active);
    });
  }

  _setPredatorTun(predator, active) {
    if (!predator) return;
    if (active) {
      predator.setData("tun", true);
      predator.setVelocity(0, 0);
      predator.setScale((predator.getData("baseScale") || predator.scaleX) * 0.92);
      predator.setAlpha(0.85);
      predator.setTint(0xbfd7ff);
    } else {
      predator.setData("tun", false);
      const baseScale = predator.getData("baseScale") || predator.scaleX;
      const baseAlpha = predator.getData("baseAlpha") || 0.95;
      const baseTint = predator.getData("baseTint") || 0xff8888;
      predator.setScale(baseScale);
      predator.setAlpha(baseAlpha);
      predator.setTint(baseTint);
    }
  }

  _spawnPredatorBurst(count) {
    for (let i = 0; i < count; i++) {
      if (this.predators.getLength() >= this.maxPredators) return;
      this._spawnPredator();
    }
  }

  _predatorCanSeePlayer(ex, ey, px, py, dist, facing) {
    if (dist > this.predatorRange) return false;

    const angToPlayer = Math.atan2(py - ey, px - ex);
    const delta = Phaser.Math.Angle.Wrap(angToPlayer - facing);
    const halfFov = Phaser.Math.DegToRad(this.predatorFovDeg * 0.5);
    if (Math.abs(delta) > halfFov) return false;

    if (this.soilWalls && this.soilWalls.getChildren().length > 0) {
      if (!this._hasLineOfSight(ex, ey, px, py)) return false;
    }

    return true;
  }

  _hasLineOfSight(x1, y1, x2, y2) {
    if (!this.soilWalls) return true;
    const nodes = this.soilWalls.getChildren();

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const cx = n.x ?? n.body?.x;
      const cy = n.y ?? n.body?.y;
      const r = (n.getData && n.getData("r")) ? n.getData("r") : (n.body?.circleRadius || 0);
      if (r > 0 && this._segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, r)) {
        return false;
      }
    }
    return true;
  }

  _segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = cx - x1;
    const wy = cy - y1;

    const c1 = wx * vx + wy * vy;
    if (c1 <= 0) return (wx * wx + wy * wy) <= r * r;

    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) {
      const dx = cx - x2;
      const dy = cy - y2;
      return (dx * dx + dy * dy) <= r * r;
    }

    const b = c1 / c2;
    const px = x1 + b * vx;
    const py = y1 + b * vy;
    const dx = cx - px;
    const dy = cy - py;
    return (dx * dx + dy * dy) <= r * r;
  }

  _set8WayFacing(sprite, vx, vy) {
    if (!sprite || (vx === 0 && vy === 0)) return;
    const ang = Math.atan2(vy, vx);
    const step = Math.PI / 4;
    const snapped = Math.round(ang / step) * step;
    sprite.setRotation(snapped);
    sprite.setFlipX(false);
  }

  _onHitPredator(player, predator) {
    if (this._invulnUntil && this.time.now < this._invulnUntil) return;
    this._invulnUntil = this.time.now + 650;

    this._playSfx("ouch");
    const baseDmg = 18;
    let resist = this.registry.get("resist") || 0;
    if (this.tun && this.tun.active) resist = Math.min(90, resist + 70);
    const dmg = Math.max(1, Math.round(baseDmg * (1 - resist / 100)));

    let hp = this.registry.get("hp");
    hp = Phaser.Math.Clamp(hp - dmg, 0, this.registry.get("hpMax"));
    this.registry.set("hp", hp);

      if (this.time.now - this._lastHitMsgAt >= 30000) {
        this._emitNote(`Carnivorous tardigrade bit you! (-${dmg} HP)`);
        this._lastHitMsgAt = this.time.now;
      }

    const v = new Phaser.Math.Vector2(player.x - predator.x, player.y - predator.y).normalize().scale(320);
    player.setVelocity(v.x, v.y);

    if (hp <= 0) this._endRun("You were eaten.");
  }

  _onPredatorEatFood(predator, food) {
    if (!predator || !food) return;
    food.destroy();
    if (Math.random() < 0.15) {
      this._emitFact("Carnivorous tardigrades will still graze on biofilm when prey isn’t available.");
    }
  }

  _playSfx(key) {
    const now = this.time.now;

    if (key === "eat") {
      if (now < this._eatSfxNextAt) return;
      this._eatSfxNextAt = now + 90;
      if (this.sfxEat) this.sfxEat.play();
    }

    if (key === "ouch") {
      if (now < this._ouchSfxNextAt) return;
      this._ouchSfxNextAt = now + 180;
      if (this.sfxOuch) this.sfxOuch.play();
    }
  }

  _cycleMusic() {
    const current = this.registry.get("musicIndex") || 0;
    const next = (current + 1) % 6;
    this._setMusicByIndex(next);

    const label = (next === 5) ? "Music: OFF" : `Music: BGM${next + 1}`;
    this.game.events.emit("ui:notify", { text: label, kind: "note" });
  }

  _setMusicByIndex(index) {
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
      this.bgm = null;
    }

    this.registry.set("musicIndex", index);
    if (index === 5) return;

    const key = this.bgmKeys[index];
    this.bgm = this.sound.add(key, { loop: true, volume: 0.45 });
    this.bgm.play();
  }

  // -----------------------------
  // UI event helpers
  // -----------------------------

  _emitNote(text) {
    this.game.events.emit("ui:notify", { text, kind: "note" });
  }

  _emitFact(text) {
    if (!text) return;
    if (this.recentFacts.includes(text)) return;

    this.recentFacts.push(text);
    if (this.recentFacts.length > this.maxRecentFacts) {
      this.recentFacts.shift();
    }

    this.game.events.emit("ui:notify", { text, kind: "fact" });
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
    this._emitFact(Phaser.Utils.Array.GetRandom(facts));
  }

  // -----------------------------
  // End run
  // -----------------------------

  _endRun(reason) {
    if (this.registry.get("runEnded")) return;
    this.registry.set("runEnded", true);
    // Stop timers & movement; show summary via UI
    this.time.removeAllEvents();
    this.player.setVelocity(0, 0);
    this.physics.pause();
    if (this.bgm) this.bgm.pause();

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
