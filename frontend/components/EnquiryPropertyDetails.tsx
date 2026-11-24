import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';
import { enquiryProviderDetails, formatEnquiryBudget } from '../services/enquiryProvider';

export default function EnquiryPropertyDetails({ item, compact = false }: { item: any; compact?: boolean }) {
  const details = enquiryProviderDetails(item);
  const budget = formatEnquiryBudget(details.budget);
  const [expanded, setExpanded] = useState(false);
  const [longMessage, setLongMessage] = useState(false);
  useEffect(() => { setExpanded(false); setLongMessage(false); }, [item.id, details.message]);
  const magic = item.source === 'Magicbricks';
  const hasFacts = !!(details.location || details.configuration || budget.figures);
  return <View style={styles.content}>
    {magic ? <View style={styles.facts}>
      {!hasFacts && <Text style={styles.body}>{item.property_interest?.trim() || 'Property details not provided by Magicbricks.'}</Text>}
      <View style={styles.row}>
        {!!details.location && <Text style={styles.value}><Text style={styles.label}>Location </Text>{details.location}</Text>}
        {!!details.configuration && <Text style={styles.configuration}>{details.configuration}</Text>}
      </View>
      {!!budget.figures && <Text style={styles.value}><Text style={styles.label}>Budget </Text>{budget.figures}{!!budget.words && <Text style={styles.words}>  {budget.words}</Text>}</Text>}
    </View> : <Text style={styles.body}>{item.property_interest || 'Location not provided'}</Text>}
    {!!details.message && <View style={styles.message}>
      <Text selectable={!compact || expanded} style={styles.body} numberOfLines={compact && !expanded ? 3 : undefined}>{details.message}</Text>
      {compact && <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.body, styles.measure]} onTextLayout={event => setLongMessage(event.nativeEvent.lines.length > 3)}>{details.message}</Text>}
      {compact && longMessage && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show less message' : 'Read full message'} accessibilityState={{ expanded }} hitSlop={8} onPress={() => setExpanded(value => !value)}><Text style={styles.link}>{expanded ? 'Show less' : 'Read more'}</Text></Pressable>}
    </View>}
    {(!!details.listing_id || !!details.response_id) && <View style={[styles.row, styles.ids]}>
      {!!details.listing_id && <Text selectable style={styles.identifier}><Text style={styles.label}>Listing ID </Text>{details.listing_id}</Text>}
      {!!details.response_id && <Text selectable style={styles.identifier}><Text style={styles.label}>Response ID </Text>{details.response_id}</Text>}
    </View>}
    {!!details.listing_url && <Pressable accessibilityRole="link" onPress={() => { Linking.openURL(details.listing_url).catch(() => Alert.alert('Unable to open listing', 'Please try again.')); }}><Text style={styles.link}>View listing ↗</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  facts: { backgroundColor: colors.surface, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, gap: 5 },
  label: { color: colors.inkMuted, fontWeight: '400', fontSize: 12 },
  value: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20, flexShrink: 1 },
  configuration: { color: colors.ink, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  words: { color: colors.inkMuted, fontSize: 12, fontWeight: '400' },
  body: { color: colors.ink, fontSize: 14, lineHeight: 20 }, message: { position: 'relative', gap: 3 },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  ids: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 8, columnGap: 12, rowGap: 4 },
  identifier: { color: colors.ink, fontSize: 13 }, link: { color: colors.primary, fontSize: 13, lineHeight: 20 },
});
