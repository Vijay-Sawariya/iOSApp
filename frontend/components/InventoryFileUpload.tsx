import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../services/api';

interface FileItem {
  id: number;
  lead_id: number;
  file_name: string;
  file_type: 'image' | 'pdf';
  content_type: string;
  file_size: number;
  created_at: string;
  data?: string;
}

interface InventoryFileUploadProps {
  leadId: number;
  onFilesChange?: (count: { images: number; pdfs: number }) => void;
  compact?: boolean; // For card view - show only counts and upload button
}

const MAX_IMAGES = 12;
const MAX_PDFS = 4;

export default function InventoryFileUpload({ leadId, onFilesChange, compact = false }: InventoryFileUploadProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<FileItem | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  const imageCount = files.filter(f => f.file_type === 'image').length;
  const pdfCount = files.filter(f => f.file_type === 'pdf').length;

  useEffect(() => {
    loadFiles();
  }, [leadId]);

  useEffect(() => {
    if (onFilesChange) {
      onFilesChange({ images: imageCount, pdfs: pdfCount });
    }
  }, [imageCount, pdfCount]);

  const loadFiles = async () => {
    try {
      const result = await api.getInventoryFiles(leadId);
      setFiles(result);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photos to upload images.');
        return false;
      }
    }
    return true;
  };

  const handlePickImage = async () => {
    if (imageCount >= MAX_IMAGES) {
      Alert.alert('Limit Reached', `Maximum ${MAX_IMAGES} images allowed per inventory.`);
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - imageCount,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setUploading(true);
        for (const asset of result.assets) {
          await uploadFile({
            uri: asset.uri,
            name: asset.fileName || `image_${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          });
        }
        await loadFiles();
        Alert.alert('Success', 'Images uploaded successfully!');
      }
    } catch (error) {
      console.error('Image pick error:', error);
      Alert.alert('Error', 'Failed to pick images');
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    if (imageCount >= MAX_IMAGES) {
      Alert.alert('Limit Reached', `Maximum ${MAX_IMAGES} images allowed per inventory.`);
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take photos.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploading(true);
        const asset = result.assets[0];
        await uploadFile({
          uri: asset.uri,
          name: `photo_${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
        await loadFiles();
        Alert.alert('Success', 'Photo uploaded successfully!');
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to take photo');
    } finally {
      setUploading(false);
    }
  };

  const handlePickPDF = async () => {
    if (pdfCount >= MAX_PDFS) {
      Alert.alert('Limit Reached', `Maximum ${MAX_PDFS} PDF files allowed per inventory.`);
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        setUploading(true);
        const remainingSlots = MAX_PDFS - pdfCount;
        const filesToUpload = result.assets.slice(0, remainingSlots);
        
        for (const asset of filesToUpload) {
          await uploadFile({
            uri: asset.uri,
            name: asset.name,
            type: 'application/pdf',
          });
        }
        await loadFiles();
        Alert.alert('Success', 'PDF files uploaded successfully!');
      }
    } catch (error) {
      console.error('Document pick error:', error);
      Alert.alert('Error', 'Failed to pick PDF files');
    } finally {
      setUploading(false);
    }
  };

  const uploadFile = async (file: { uri: string; name: string; type: string }) => {
    try {
      await api.uploadInventoryFile(leadId, file);
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'Failed to upload file');
      throw error;
    }
  };

  const handleDeleteFile = (file: FileItem) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.file_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteInventoryFile(file.id);
              await loadFiles();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete file');
            }
          },
        },
      ]
    );
  };

  const handleViewImage = async (file: FileItem) => {
    setSelectedImage(file);
    setLoadingImage(true);
    try {
      const result = await api.getInventoryFile(file.id);
      setImageData(result.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load image');
      setSelectedImage(null);
    } finally {
      setLoadingImage(false);
    }
  };

  const showUploadOptions = () => {
    Alert.alert(
      'Upload Files',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose Images', onPress: handlePickImage },
        { text: 'Choose PDF', onPress: handlePickPDF },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Compact view for inventory cards
  if (compact) {
    return (
      <TouchableOpacity style={styles.compactContainer} onPress={showUploadOptions}>
        <View style={styles.compactContent}>
          <Ionicons name="attach" size={16} color="#6B7280" />
          <Text style={styles.compactText}>
            {imageCount + pdfCount > 0 
              ? `${imageCount} img, ${pdfCount} pdf` 
              : 'Add files'}
          </Text>
        </View>
        {uploading && <ActivityIndicator size="small" color="#3B82F6" />}
      </TouchableOpacity>
    );
  }

  // Full view for detail/edit screens
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Files & Documents</Text>
        <Text style={styles.subtitle}>
          {imageCount}/{MAX_IMAGES} images, {pdfCount}/{MAX_PDFS} PDFs
        </Text>
      </View>

      {/* Upload Buttons */}
      <View style={styles.uploadButtons}>
        <TouchableOpacity
          style={[styles.uploadButton, imageCount >= MAX_IMAGES && styles.uploadButtonDisabled]}
          onPress={handleTakePhoto}
          disabled={uploading || imageCount >= MAX_IMAGES}
        >
          <Ionicons name="camera" size={22} color={imageCount >= MAX_IMAGES ? '#9CA3AF' : '#3B82F6'} />
          <Text style={[styles.uploadButtonText, imageCount >= MAX_IMAGES && styles.uploadButtonTextDisabled]}>
            Camera
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, imageCount >= MAX_IMAGES && styles.uploadButtonDisabled]}
          onPress={handlePickImage}
          disabled={uploading || imageCount >= MAX_IMAGES}
        >
          <Ionicons name="images" size={22} color={imageCount >= MAX_IMAGES ? '#9CA3AF' : '#3B82F6'} />
          <Text style={[styles.uploadButtonText, imageCount >= MAX_IMAGES && styles.uploadButtonTextDisabled]}>
            Gallery
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, pdfCount >= MAX_PDFS && styles.uploadButtonDisabled]}
          onPress={handlePickPDF}
          disabled={uploading || pdfCount >= MAX_PDFS}
        >
          <Ionicons name="document" size={22} color={pdfCount >= MAX_PDFS ? '#9CA3AF' : '#EF4444'} />
          <Text style={[styles.uploadButtonText, pdfCount >= MAX_PDFS && styles.uploadButtonTextDisabled]}>
            PDF
          </Text>
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator color="#3B82F6" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#3B82F6" />
      ) : files.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-upload-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No files uploaded yet</Text>
          <Text style={styles.emptySubtext}>Tap the buttons above to add images or PDFs</Text>
        </View>
      ) : (
        <>
          {/* Images Section */}
          {imageCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Images ({imageCount})</Text>
              <FlatList
                data={files.filter(f => f.file_type === 'image')}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.imageThumb}
                    onPress={() => handleViewImage(item)}
                  >
                    <View style={styles.imagePreview}>
                      <Ionicons name="image" size={32} color="#3B82F6" />
                    </View>
                    <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteFile(item)}
                    >
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* PDFs Section */}
          {pdfCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PDFs ({pdfCount})</Text>
              {files.filter(f => f.file_type === 'pdf').map((file) => (
                <View key={file.id} style={styles.pdfItem}>
                  <View style={styles.pdfIcon}>
                    <Ionicons name="document-text" size={24} color="#EF4444" />
                  </View>
                  <View style={styles.pdfInfo}>
                    <Text style={styles.pdfName} numberOfLines={1}>{file.file_name}</Text>
                    <Text style={styles.pdfSize}>
                      {(file.file_size / 1024).toFixed(1)} KB
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pdfDeleteBtn}
                    onPress={() => handleDeleteFile(file)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Image Viewer Modal */}
      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedImage?.file_name}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedImage(null); setImageData(null); }}>
                <Ionicons name="close" size={28} color="#1F2937" />
              </TouchableOpacity>
            </View>
            {loadingImage ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            ) : imageData ? (
              <Image
                source={{ uri: `data:${selectedImage?.content_type};base64,${imageData}` }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  uploadButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
  },
  uploadButton: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 4,
    fontWeight: '500',
  },
  uploadButtonTextDisabled: {
    color: '#9CA3AF',
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  uploadingText: {
    marginLeft: 8,
    color: '#3B82F6',
    fontWeight: '500',
  },
  loader: {
    paddingVertical: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  imageThumb: {
    width: 100,
    marginRight: 10,
    position: 'relative',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  fileName: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  pdfItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    marginBottom: 8,
  },
  pdfIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pdfName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  pdfSize: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pdfDeleteBtn: {
    padding: 8,
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  compactText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '95%',
    height: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    marginRight: 16,
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    flex: 1,
    backgroundColor: '#000',
  },
});
