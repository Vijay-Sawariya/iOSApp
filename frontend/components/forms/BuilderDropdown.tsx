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

interface Builder {
  id: number;
  builder_name: string;
  phone?: string;
  company_name?: string;
}

interface BuilderDropdownProps {
  label: string;
  selectedBuilderId: string;
  builders: Builder[];
  onSelect: (builderId: string, builder: Builder | null) => void;
  placeholder?: string;
  required?: boolean;
}

export const BuilderDropdown: React.FC<BuilderDropdownProps> = ({
  label,
  selectedBuilderId,
  builders,
  onSelect,
  placeholder = "Select builder...",
  required = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  const selectedBuilder = useMemo(() => 
    builders.find(b => b.id.toString() === selectedBuilderId),
    [builders, selectedBuilderId]
  );

  const displayText = selectedBuilder?.builder_name || placeholder;
  const hasValue = !!selectedBuilderId;

  const filteredBuilders = useMemo(() => {
    if (!searchText.trim()) return builders;
    const search = searchText.toLowerCase();
    return builders.filter(b => 
      b.builder_name.toLowerCase().includes(search) ||
      b.company_name?.toLowerCase().includes(search) ||
      b.phone?.includes(search)
    );
  }, [builders, searchText]);

  const handleSelect = (builder: Builder) => {
    onSelect(builder.id.toString(), builder);
    handleClose();
  };

  const handleClear = () => {
    onSelect('', null);
  };

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
      <View style={styles.dropdownRow}>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={[styles.dropdownText, !hasValue && styles.dropdownPlaceholder]}>
            {displayText}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#6B7280" />
        </TouchableOpacity>
        {hasValue && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Ionicons name="close-circle" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

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
                placeholder="Search by name, company or phone..."
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
              data={filteredBuilders}
              keyExtractor={(item) => item.id.toString()}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              getItemLayout={(data, index) => ({
                length: 68,
                offset: 68 * index,
                index,
              })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.builderItem, 
                    selectedBuilderId === item.id.toString() && styles.builderItemSelected
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.builderInfo}>
                    <Text style={[
                      styles.builderName,
                      selectedBuilderId === item.id.toString() && styles.builderNameSelected
                    ]}>
                      {item.builder_name}
                    </Text>
                    <View style={styles.builderDetails}>
                      {item.company_name && (
                        <Text style={styles.builderCompany}>{item.company_name}</Text>
                      )}
                      {item.phone && (
                        <Text style={styles.builderPhone}>{item.phone}</Text>
                      )}
                    </View>
                  </View>
                  {selectedBuilderId === item.id.toString() && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.builderList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No builders found</Text>
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
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownButton: {
    flex: 1,
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
  clearButton: {
    padding: 8,
    marginLeft: 4,
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
  builderList: {
    flexGrow: 1,
  },
  builderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 68,
  },
  builderItemSelected: {
    backgroundColor: '#F0FDF4',
  },
  builderInfo: {
    flex: 1,
  },
  builderName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  builderNameSelected: {
    color: '#166534',
  },
  builderDetails: {
    flexDirection: 'row',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  builderCompany: {
    fontSize: 13,
    color: '#6B7280',
    marginRight: 12,
  },
  builderPhone: {
    fontSize: 13,
    color: '#9CA3AF',
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

export default BuilderDropdown;
