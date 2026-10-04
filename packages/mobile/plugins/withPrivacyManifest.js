/**
 * withPrivacyManifest — local Expo config plugin.
 *
 * Apple requires a PrivacyInfo.xcprivacy manifest for apps that use
 * "required reason" APIs. SHADOW reaches several through Expo modules and
 * React Native core:
 *   - UserDefaults      (expo modules)              -> CA92.1
 *   - File timestamps   (expo-file-system)          -> C617.1
 *   - System boot time  (React Native core)         -> 35F9.1
 *   - Disk space        (expo-file-system / RN)     -> E174.1
 *
 * Neither `expo prebuild` nor the installed module versions emit the
 * manifest (verified 2026-10-05), so this plugin writes it into the
 * generated Xcode project and registers it as a target resource. Xcode
 * copies .xcprivacy files from the resources phase to the bundle root,
 * which is where App Store Connect looks.
 *
 * No tracking, no tracking domains, no collected data types: the app is
 * local-first and sends nothing to third parties.
 */
const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>E174.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;

function withPrivacyManifest(config) {
  return withXcodeProject(config, (config) => {
    const { projectRoot, platformProjectRoot } = config.modRequest;

    // Derive the Xcode project/app group name from the .xcodeproj on disk
    // instead of trusting any single modRequest field.
    const xcodeprojDir = fs
      .readdirSync(platformProjectRoot)
      .find((f) => f.endsWith('.xcodeproj'));
    if (!xcodeprojDir) {
      throw new Error(
        '[withPrivacyManifest] no .xcodeproj found in ' + platformProjectRoot
      );
    }
    const appName = xcodeprojDir.replace(/\.xcodeproj$/, '');
    const destAbs = path.join(platformProjectRoot, appName, 'PrivacyInfo.xcprivacy');
    fs.writeFileSync(destAbs, MANIFEST);

    // Register in the pbxproj as a resource of the main target. Xcode
    // copies .xcprivacy files to the bundle root at build time.
    const xcodeProject = config.modResults;
    const targetUuid = xcodeProject.getFirstTarget().uuid;
    xcodeProject.addResourceFile(`${appName}/PrivacyInfo.xcprivacy`, {
      target: targetUuid,
    });

    // Silence unused-var lint for projectRoot (kept for clarity).
    void projectRoot;
    return config;
  });
}

module.exports = withPrivacyManifest;
