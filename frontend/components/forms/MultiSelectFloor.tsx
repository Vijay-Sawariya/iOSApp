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

interface MultiSelectFloorProps {
  label: string;
  selectedFloors: string[];
  options: readonly string[] | string[];
  onSelect: (floors: string[]) => void;
  placeholder?: string;
  required?: boolean;
}

export const MultiSelectFloor: React.FC<MultiSelectFloorProps> = ({
  label,
  selectedFloors,
  options,
  onSelect,
  placeholder = "Select floors...",
  required = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  const displayText = selectedFloors.length > 0 
    ? selectedFloors.join(', ') 
    : placeholder;
  const hasValue = selectedFloors.length > 0;

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options as string[];
    const search = searchText.toLowerCase();
    return (options as string[]).filter(opt => 
      opt.toLowerCase().includes(search)
    );
  }, [options, searchText]);

  const handleToggle = (floor: string) => {
    if (selectedFloors.includes(floor)) {
      onSelect(selectedFloors.filter(f => f !== floor));
    } else {
      onSelect([...selectedFloors, floor]);
    }
  };

  const handleClose = () => {
    setModalVisible(false);
    setSearchText('');
  };

  const handleRemoveFloor = (floor: string) => {
    onSelect(selectedFloors.filter(f => f !== floor));
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
        <Text style={[styles.dropdownText, !hasValue && styles.dropdownPlaceholder]} numberOfLines={1}>
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      {/* Selected Floors Tags */}
      {selectedFloors.length > 0 && (
        <View style={styles.tagsContainer}>
          {selectedFloors.map(floor => (
            <TouchableOpacity
              key={floor}
              style={styles.tag}
              onPress={() => handleRemoveFloor(floor)}
            >
              <Text style={styles.tagText}>{floor}</Text>
              <Ionicons name="close" size={14} color="#6B7280" />
            </TouchableOpacity>
          ))}
        </View>
      )}

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
                placeholder="Search floors..."
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
              initialNumToRender={10}
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
                  style={[styles.optionItem, selectedFloors.includes(item) && styles.optionItemSelected]}
                  onPress={() => handleToggle(item)}
                >
                  <Text style={[styles.optionText, selectedFloors.includes(item) && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {selectedFloors.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
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

            <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
              <Text style={styles.doneButtonText}>
                Done ({selectedFloors.length} selected)
              </Text>
            </TouchableOpacity>
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
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    marginBottom: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#3730A3',
    marginRight: 4,
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
    backgroundColor: '#F0FDF4',
  },
  optionText: {
    fontSize: 16,
    color: '#1F2937',
  },
  optionTextSelected: {
    color: '#166534',
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
  doneButton: {
    backgroundColor: '#3B82F6',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default MultiSelectFloor;
