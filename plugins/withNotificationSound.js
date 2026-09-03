const { withDangerousMod, ConfigPlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNotificationSound(config, { sounds = [] }) {
  if (!sounds || sounds.length === 0) {
    return config;
  }

  config = withAndroidNotificationSound(config, { sounds });
  config = withIosNotificationSound(config, { sounds });

  return config;
};

function withAndroidNotificationSound(config, { sounds }) {
  return withDangerousMod(config, ['android', async (config) => {
    const { platformProjectRoot, projectRoot } = config.modRequest;
    const rawDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');

    fs.mkdirSync(rawDir, { recursive: true });

    sounds.forEach((sound) => {
      const sourcePath = path.join(projectRoot, 'src', 'assets', 'sounds', sound);
      const targetPath = path.join(rawDir, sound);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`[withNotificationSound] Copied Android sound: ${sound}`);
      } else {
        console.warn(`[withNotificationSound] Sound file not found: ${sourcePath}`);
      }
    });

    return config;
  }]);
}

function withIosNotificationSound(config, { sounds }) {
  return withDangerousMod(config, ['ios'], async (config) => {
    const iosDir = config.modRequest.platformProjectRoot;

    sounds.forEach((sound) => {
      const sourcePath = path.join(config.modRequest.projectRoot, 'src', 'assets', 'sounds', sound);
      const targetPath = path.join(iosDir, sound);

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`[withNotificationSound] Copied iOS sound: ${sound}`);
      } else {
        console.warn(`[withNotificationSound] Sound file not found: ${sourcePath}`);
      }
    });

    return config;
  });
}

module.exports.withAndroidNotificationSound = withAndroidNotificationSound;
module.exports.withIosNotificationSound = withIosNotificationSound;
