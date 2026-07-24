import { NetInfoState } from '@react-native-community/netinfo';

/**
 * NetInfo can report isInternetReachable as null while iOS is still probing the
 * route. Treat a connected-but-unknown state as online so screens do not show a
 * false network failure during startup or app resume.
 */
export const isNetworkReachable = (state: NetInfoState): boolean => {
  if (state.isConnected !== true) {
    return false;
  }

  return state.isInternetReachable !== false;
};
