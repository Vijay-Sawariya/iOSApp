import React from 'react';
import { Alert, Linking, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PhoneNumbers from './PhoneNumbers';
import { colors } from '../constants/theme';
import { enquiryStyles as s } from './EnquiryControls';

export default function EnquiryPhone({ phone }: { phone: string }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    {phone.split(/[,;/\n]+/).map(value => value.trim()).filter(Boolean).map((number, index) => {
      const dial = number.replace(/[^\d+]/g, '');
      const digits = number.replace(/\D/g, '').replace(/^00/, '');
      const international = digits.length === 10 ? `91${digits}` : digits;
      const open = (url: string) => { if (digits) void Linking.openURL(url).catch(() => Alert.alert('Unable to open', 'Please check the number and that the required app is available.')); };
      return <View key={`${index}-${number}`} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <PhoneNumbers phone={number} textStyle={[s.text, { color: colors.accent }]} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Call ${number}`} style={{ padding: 10, minHeight: 44, minWidth: 44 }} onPress={() => open(`tel:${dial}`)}><Ionicons name="call-outline" size={22} color={colors.accent} /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`WhatsApp ${number}`} style={{ padding: 10, minHeight: 44, minWidth: 44 }} onPress={() => open(`https://wa.me/${international}`)}><Ionicons name="logo-whatsapp" size={24} color={colors.accent} /></TouchableOpacity>
      </View>;
    })}
  </View>;
}
