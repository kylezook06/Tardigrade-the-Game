/* global Phaser, BootScene, TitleScene, GameScene, UIScene, CodexScene */

(function () {
  const config = {
    type: Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: "#0b1020",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    // Order matters, but BootScene will start the others.
    scene: [BootScene, TitleScene, GameScene, UIScene, CodexScene]
  };

  new Phaser.Game(config);
})();
