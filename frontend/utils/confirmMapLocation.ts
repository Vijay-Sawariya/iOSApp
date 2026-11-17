import { Alert } from 'react-native';

export const confirmMapLocation = (url: string, name: string): Promise<boolean> =>
  new Promise(resolve => Alert.alert(
    'Save Google Maps location?',
    `Save this location for ${name}?\n\n${url}`,
    [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Save location', onPress: () => resolve(true) },
    ],
    { cancelable: true, onDismiss: () => resolve(false) },
  ));
