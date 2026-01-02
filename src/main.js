/* global Phaser, BootScene, GameScene, UIScene */

(function () {
  const config = {
    type: Phaser.AUTO,
    parent: "game",
    width: 1280,
    height: 720,
    backgroundColor: "#0b1020",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    // Order matters, but BootScene will start the others.
    scene: [BootScene, GameScene, UIScene]
  };

  new Phaser.Game(config);
})();
