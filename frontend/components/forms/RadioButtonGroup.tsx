import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RadioButtonGroupProps {
  label: string;
  options: readonly string[] | string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  required?: boolean;
}

export const RadioButtonGroup: React.FC<RadioButtonGroupProps> = ({
  label,
  options,
  selectedValue,
  onSelect,
  required = false,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.optionsContainer}>
        {(options as string[]).map((option) => (
          <TouchableOpacity
            key={option}
            style={styles.radioOption}
            onPress={() => onSelect(option)}
          >
            <View style={styles.radioCircle}>
              {selectedValue === option && (
                <View style={styles.radioSelected} />
              )}
            </View>
            <Text style={styles.radioText}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  radioText: {
    fontSize: 15,
    color: '#1F2937',
  },
});

export default RadioButtonGroup;
