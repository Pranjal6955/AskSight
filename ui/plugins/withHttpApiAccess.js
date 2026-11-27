const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins");

/**
 * TEMPORARY: allow the app to call the AskSight test API over plain HTTP.
 * Remove this plugin after the API has HTTPS enabled.
 */
function withHttpApiAccess(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return modConfig;
  });

  return withInfoPlist(config, (modConfig) => {
    const current = modConfig.modResults.NSAppTransportSecurity ?? {};
    modConfig.modResults.NSAppTransportSecurity = {
      ...current,
      NSAllowsArbitraryLoads: true,
    };
    return modConfig;
  });
}

module.exports = withHttpApiAccess;
