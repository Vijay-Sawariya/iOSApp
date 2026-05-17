import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows } from '../../constants/theme';

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  color?: string;
}

export const FilterChip: React.FC<FilterChipProps> = ({ 
  label, 
  isActive, 
  onPress,
  color = colors.primary 
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && { backgroundColor: color }
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface StatsBarProps {
  stats: Array<{ label: string; count: number; isActive?: boolean; onPress?: () => void }>;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <View style={styles.statsBar}>
      {stats.map((stat, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.statItem, stat.isActive && styles.statItemActive]}
          onPress={stat.onPress}
          disabled={!stat.onPress}
        >
          <Text style={[styles.statCount, stat.isActive && styles.statCountActive]}>
            {stat.count}
          </Text>
          <Text style={[styles.statLabel, stat.isActive && styles.statLabelActive]}>
            {stat.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

interface SearchablePickerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  searchPlaceholder?: string;
}

export const SearchablePickerModal: React.FC<SearchablePickerModalProps> = ({
  visible,
  onClose,
  title,
  options,
  selectedValues,
  onToggle,
  searchPlaceholder = "Type to search...",
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() =>
    options.filter(opt =>
      opt.toLowerCase().includes(searchQuery.toLowerCase())
    ), [options, searchQuery]
  );

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.inkSubtle} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.inkSubtle} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            getItemLayout={(data, index) => ({
              length: 52,
              offset: 52 * index,
              index,
            })}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => onToggle(item)}
              >
                <Text style={styles.optionText}>{item}</Text>
                {selectedValues.includes(item) && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyResult}>
                <Text style={styles.emptyText}>No results found</Text>
              </View>
            }
          />

          <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
            <Text style={styles.doneText}>Done ({selectedValues.length} selected)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

interface FilterSectionProps {
  label: string;
  children: React.ReactNode;
}

export const FilterSection: React.FC<FilterSectionProps> = ({ label, children }) => {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionLabel}>{label}</Text>
      {children}
    </View>
  );
};

interface TextFilterInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: string;
}

export const TextFilterInput: React.FC<TextFilterInputProps> = ({
  placeholder,
  value,
  onChangeText,
  icon = "search",
}) => {
  return (
    <View style={styles.textFilterContainer}>
      <Ionicons name={icon as any} size={18} color={colors.inkSubtle} />
      <TextInput
        style={styles.textFilterInput}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color={colors.inkSubtle} />
        </TouchableOpacity>
      )}
    </View>
  );
};

interface RangeFilterInputProps {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (text: string) => void;
  onMaxChange: (text: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}

export const RangeFilterInput: React.FC<RangeFilterInputProps> = ({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
}) => {
  return (
    <View style={styles.rangeContainer}>
      <Text style={styles.filterSectionLabel}>{label}</Text>
      <View style={styles.rangeInputs}>
        <TextInput
          style={styles.rangeInput}
          placeholder={minPlaceholder}
          placeholderTextColor={colors.inkSubtle}
          value={minValue}
          onChangeText={onMinChange}
          keyboardType="numeric"
        />
        <Text style={styles.rangeSeparator}>to</Text>
        <TextInput
          style={styles.rangeInput}
          placeholder={maxPlaceholder}
          placeholderTextColor={colors.inkSubtle}
          value={maxValue}
          onChangeText={onMaxChange}
          keyboardType="numeric"
        />
      </View>
    </View>
  );
};

interface MultiSelectButtonProps {
  label: string;
  selectedCount: number;
  onPress: () => void;
}

export const MultiSelectButton: React.FC<MultiSelectButtonProps> = ({
  label,
  selectedCount,
  onPress,
}) => {
  return (
    <TouchableOpacity style={styles.multiSelectButton} onPress={onPress}>
      <Text style={[
        styles.multiSelectText,
        selectedCount === 0 && styles.multiSelectPlaceholder
      ]}>
        {selectedCount > 0 ? `${selectedCount} selected` : `Select ${label.toLowerCase()}`}
      </Text>
      <Ionicons name="chevron-down" size={20} color={colors.inkMuted} />
    </TouchableOpacity>
  );
};

interface SelectedTagsProps {
  values: string[];
  onRemove: (value: string) => void;
  color?: string;
}

export const SelectedTags: React.FC<SelectedTagsProps> = ({ 
  values, 
  onRemove,
  color = '#3730A3' 
}) => {
  if (values.length === 0) return null;
  
  return (
    <View style={styles.selectedTags}>
      {values.map(val => (
        <TouchableOpacity
          key={val}
          style={styles.selectedTag}
          onPress={() => onRemove(val)}
        >
          <Text style={[styles.selectedTagText, { color }]}>{val}</Text>
          <Ionicons name="close" size={14} color={color} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  // Filter Chip
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.inkMuted,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  
  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: colors.surfaceRaised,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: radii.md,
    ...shadows.card,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  statItemActive: {
    backgroundColor: colors.primarySoft,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  statCountActive: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
  },
  statLabelActive: {
    color: colors.primary,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '80%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
  },
  
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 10,
    fontSize: 15,
    color: colors.ink,
  },
  
  // Options
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontSize: 15,
    color: colors.ink,
  },
  emptyResult: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.inkSubtle,
  },
  doneButton: {
    backgroundColor: colors.primary,
    margin: 16,
    paddingVertical: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  
  // Filter Section
  filterSection: {
    marginBottom: 16,
  },
  filterSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 8,
  },
  
  // Text Filter
  textFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  textFilterInput: {
    flex: 1,
    height: 40,
    marginLeft: 8,
    fontSize: 14,
    color: colors.ink,
  },
  
  // Range Filter
  rangeContainer: {
    marginBottom: 16,
  },
  rangeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    padding: 10,
    fontSize: 14,
    color: colors.ink,
  },
  rangeSeparator: {
    marginHorizontal: 8,
    color: colors.inkMuted,
  },
  
  // Multi Select Button
  multiSelectButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  multiSelectText: {
    fontSize: 14,
    color: colors.ink,
  },
  multiSelectPlaceholder: {
    color: colors.inkSubtle,
  },
  
  // Selected Tags
  selectedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    marginRight: 6,
    marginBottom: 6,
  },
  selectedTagText: {
    fontSize: 12,
    marginRight: 4,
  },
});
