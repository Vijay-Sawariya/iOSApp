import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REMINDER_FREQUENCIES, ReminderFrequency } from '../services/reminderFrequency';

interface Props {
  value: ReminderFrequency;
  onChange: (value: ReminderFrequency) => void;
}

export default function ReminderFrequencyDropdown({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const selected = REMINDER_FREQUENCIES.find(option => option.value === value);

  return (
    <View>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={`Notification frequency: ${selected?.label ?? 'Select frequency'}`}
        accessibilityState={{ expanded }}
      >
        <Ionicons name="notifications-outline" size={20} color="#3B82F6" />
        <Text style={styles.label}>{selected?.label ?? 'Select frequency'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.options}>
          {REMINDER_FREQUENCIES.map(option => (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, value === option.value && styles.selectedOption]}
              accessibilityRole="radio"
              accessibilityState={{ checked: value === option.value }}
              onPress={() => {
                onChange(option.value);
                setExpanded(false);
              }}
            >
              <Text style={[styles.label, value === option.value && styles.selectedLabel]}>{option.label}</Text>
              {value === option.value && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={styles.hint}>Repeats until completed or stopped. Times use India time (IST).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  label: { flex: 1, fontSize: 16, lineHeight: 22, color: '#1F2937' },
  options: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, padding: 14 },
  selectedOption: { backgroundColor: '#EFF6FF' },
  selectedLabel: { color: '#2563EB', fontWeight: '600' },
  hint: { marginTop: 10, fontSize: 13, lineHeight: 18, color: '#6B7280' },
});
