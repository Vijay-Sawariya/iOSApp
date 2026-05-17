import Constants from 'expo-constants';

const getVersionValue = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  return value;
};

const appVersion =
  getVersionValue(Constants.nativeApplicationVersion) ||
  getVersionValue(Constants.expoConfig?.version) ||
  '1.0.1';

const buildVersion =
  getVersionValue(Constants.nativeBuildVersion) ||
  getVersionValue(Constants.expoConfig?.ios?.buildNumber) ||
  '20';

export const installedAppVersion = `Version ${appVersion} (${buildVersion})`;
