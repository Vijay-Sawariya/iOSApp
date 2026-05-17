import * as Application from 'expo-application';
import Constants from 'expo-constants';

const getVersionValue = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return String(value);
};

export const appVersion =
  getVersionValue(Application.nativeApplicationVersion) ||
  getVersionValue(Constants.expoConfig?.version);

export const appBuildNumber =
  getVersionValue(Application.nativeBuildVersion) ||
  getVersionValue(Constants.platform?.ios?.buildNumber) ||
  getVersionValue(Constants.platform?.android?.versionCode) ||
  getVersionValue(Constants.expoConfig?.ios?.buildNumber) ||
  getVersionValue(Constants.expoConfig?.android?.versionCode);

export const installedAppVersion = appVersion
  ? `Version ${appVersion}${appBuildNumber ? ` (${appBuildNumber})` : ''}`
  : 'Version unavailable';
