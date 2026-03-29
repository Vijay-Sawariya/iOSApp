import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchableDropdownProps {
  label: string;
  value: string;
  options: readonly string[] | string[];
  onSelect: (value: string) => void;
  placeholder?: string;
  displayValue?: string;
  required?: boolean;
  searchPlaceholder?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  label,
  value,
  options,
  onSelect,
  placeholder = "Select...",
  displayValue,
  required = false,
  searchPlaceholder = "Type to search...",
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  const displayText = displayValue || value || placeholder;
  const hasValue = !!value;

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options as string[];
    const search = searchText.toLowerCase();
    return (options as string[]).filter(opt => 
      opt.toLowerCase().includes(search)
    );
  }, [options, searchText]);

  const handleClose = () => {
    setModalVisible(false);
    setSearchText('');
  };

  return (
    <>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.dropdownText, !hasValue && styles.dropdownPlaceholder]}>
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder={searchPlaceholder}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
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
                  style={[styles.optionItem, value === item && styles.optionItemSelected]}
                  onPress={() => {
                    onSelect(item);
                    handleClose();
                  }}
                >
                  <Text style={[styles.optionText, value === item && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {value === item && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.optionsList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No results found</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  required: {
    color: '#EF4444',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
  },
  dropdownText: {
    fontSize: 15,
    color: '#1F2937',
    flex: 1,
  },
  dropdownPlaceholder: {
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 10,
    fontSize: 15,
    color: '#1F2937',
  },
  optionsList: {
    flexGrow: 1,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    height: 52,
  },
  optionItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 16,
    color: '#1F2937',
  },
  optionTextSelected: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default SearchableDropdown;
