import React from 'react';
import { Alert, Linking, StyleSheet, Text, TextStyle, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export default function PhoneNumbers({ phone, textStyle }: { phone: string; textStyle?: TextStyle | TextStyle[] }) {
  return <View style={styles.numbers}>{phone.split(/[,;/\n]+/).map(value => value.trim()).filter(Boolean).map((number, index) =>
    <TouchableOpacity key={`${index}-${number}`} accessibilityRole="link" accessibilityLabel={`Call ${number}`}
      accessibilityHint="Tap to call. Long press to copy this number."
      onPress={event => {
        event.stopPropagation();
        const dialNumber = number.replace(/[^\d+]/g, '');
        if (!/\d/.test(dialNumber)) return;
        void Linking.openURL(`tel:${dialNumber}`).catch(() => Alert.alert('Unable to call', 'Please check the phone number and try again.'));
      }}
      onLongPress={event => {
        event.stopPropagation();
        void Clipboard.setStringAsync(number).then(() => Alert.alert('Copied', 'Phone number copied.'))
          .catch(() => Alert.alert('Copy Failed', 'Could not copy the phone number.'));
      }}>
      <Text style={textStyle}>{number}</Text>
    </TouchableOpacity>)}
  </View>;
}

const styles = StyleSheet.create({ numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1 } });
