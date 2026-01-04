/* global Phaser */

class CodexScene extends Phaser.Scene {
  constructor() {
    super({ key: "CodexScene" });
    this.isOpen = false;
  }

  create() {
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyESC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Overlay UI
    this.bg = this.add.rectangle(0, 0, 760, 520, 0x000000, 0.80)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3000)
      .setVisible(false);

    this.title = this.add.text(0, 0, "CODEX", {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3001).setVisible(false);

    this.body = this.add.text(0, 0, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#d7e7ff",
      wordWrap: { width: 700 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(3001).setVisible(false);

    this.hint = this.add.text(0, 0, "C: close   ESC: close", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#b7c7dd"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3001).setVisible(false);

    this._layout();
    this.scale.on("resize", () => this._layout());
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.toggle();
    }
    if (this.isOpen && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
      this.toggle(false);
    }
  }

  _layout() {
    const cx = Math.floor(this.scale.width / 2);
    const cy = Math.floor(this.scale.height / 2);

    this.bg.setPosition(cx, cy);
    this.title.setPosition(cx, cy - 220);
    this.body.setPosition(cx, cy - 180);
    this.hint.setPosition(cx, cy + 225);
  }

  toggle(forceState) {
    const open = (forceState === undefined) ? !this.isOpen : forceState;
    this.isOpen = open;

    this.registry.set("codexOpen", open);

    this.bg.setVisible(open);
    this.title.setVisible(open);
    this.body.setVisible(open);
    this.hint.setVisible(open);

    if (open) this.render();
  }

  render() {
    const codex = this.registry.get("codex");
    const entries = (codex && codex.entries) ? codex.entries : {};

    const catalog = [
      { key: "food_algae", title: "Algae / Biofilm", text: "Primary grazing food source in water films; boosts hunger steadily." },
      { key: "food_proto", title: "Protozoa", text: "Protein-rich snack. Many microfauna prey on smaller protists." },
      { key: "haz_nematode", title: "Nematode", text: "Roundworms common in soil/water films; some are predators or scavengers." },
      { key: "haz_amoeba", title: "Amoeba", text: "Single-celled shapeshifters; engulf food via phagocytosis." },
      { key: "haz_mite", title: "Mite", text: "Tiny arthropods; many thrive in moss and soil microhabitats." },
      { key: "pred_carnivorous_tardigrade", title: "Carnivorous Tardigrade", text: "Some tardigrades are predators of other microfauna (even other tardigrades)." },
      { key: "tun_cryptobiosis", title: "Tun Mode", text: "Cryptobiosis lets tardigrades endure freezing and desiccation by suspending metabolism." },
      { key: "biome_moss", title: "Moss", text: "A micro-forest. Water films between leaves create habitats for microfauna." },
      { key: "biome_lichen", title: "Lichen", text: "Fungus + algae partnership. Rough terrain with pockets of moisture." },
      { key: "biome_soil", title: "Soil", text: "Dense particle maze. Great shelter—and a wall you can’t pass through." }
    ];

    const lines = [];
    let unlockedAny = false;

    lines.push("Unlocked entries:");
    lines.push("");

    for (const item of catalog) {
      if (entries[item.key] && entries[item.key].unlocked) {
        unlockedAny = true;
        lines.push(`• ${item.title}`);
        lines.push(`  ${item.text}`);
        lines.push("");
      }
    }

    if (!unlockedAny) {
      lines.length = 0;
      lines.push("Codex is empty.");
      lines.push("");
      lines.push("Explore, eat, and survive to unlock facts.");
    }

    this.body.setText(lines.join("\n"));
  }
}

window.CodexScene = CodexScene;
