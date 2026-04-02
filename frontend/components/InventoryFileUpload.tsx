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
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

// GoDaddy API Configuration - Same as used in existing PHP web app
const GODADDY_BASE_URL = 'https://sagarhomelms.com';
const GODADDY_API_KEY = 'SagarHome_Upload_2024_Secret';

interface FileItem {
  id?: number;
  filename: string;
  url: string;
  type: 'image' | 'floorplan';
  size?: number;
}

interface InventoryFileUploadProps {
  leadId: number;
  onFilesChange?: (count: { images: number; pdfs: number }) => void;
  compact?: boolean; // For card view - show only counts and upload button
}

const MAX_IMAGES = 12;
const MAX_PDFS = 4;

export default function InventoryFileUpload({ leadId, onFilesChange, compact = false }: InventoryFileUploadProps) {
  const [images, setImages] = useState<FileItem[]>([]);
  const [floorplans, setFloorplans] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<FileItem | null>(null);

  const imageCount = images.length;
  const pdfCount = floorplans.length;

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
      const response = await fetch(
        `${GODADDY_BASE_URL}/mobile_get_files.php?lead_id=${leadId}&api_key=${GODADDY_API_KEY}`
      );
      const data = await response.json();
      if (data.success) {
        setImages(data.data.images || []);
        setFloorplans(data.data.floorplans || []);
      }
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

  const uploadFile = async (uri: string, filename: string, type: 'image' | 'floorplan') => {
    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
      type: type === 'floorplan' ? 'application/pdf' : 'image/jpeg',
      name: filename,
    } as any);
    formData.append('lead_id', String(leadId));
    formData.append('type', type);
    formData.append('api_key', GODADDY_API_KEY);

    const response = await fetch(`${GODADDY_BASE_URL}/mobile_upload.php`, {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type header - let fetch set it automatically with boundary
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Upload failed');
    }
    return data;
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
          const filename = asset.fileName || `image_${Date.now()}.jpg`;
          await uploadFile(asset.uri, filename, 'image');
        }
        await loadFiles();
        Alert.alert('Success', 'Images uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Image pick error:', error);
      Alert.alert('Error', error.message || 'Failed to upload images');
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
        const filename = `photo_${Date.now()}.jpg`;
        await uploadFile(asset.uri, filename, 'image');
        await loadFiles();
        Alert.alert('Success', 'Photo uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      Alert.alert('Error', error.message || 'Failed to take photo');
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
          await uploadFile(asset.uri, asset.name, 'floorplan');
        }
        await loadFiles();
        Alert.alert('Success', 'PDF files uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Document pick error:', error);
      Alert.alert('Error', error.message || 'Failed to upload PDF files');
    } finally {
      setUploading(false);
    }
  };

  const handleViewImage = (file: FileItem) => {
    setSelectedImage(file);
  };

  const handleOpenPDF = async (file: FileItem) => {
    try {
      await Linking.openURL(file.url);
    } catch (error) {
      Alert.alert('Error', 'Could not open PDF file');
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
        <Text style={styles.title}>{'Files & Documents'}</Text>
        <Text style={styles.subtitle}>
          {`${imageCount}/${MAX_IMAGES} images, ${pdfCount}/${MAX_PDFS} PDFs`}
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
            {'Camera'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, imageCount >= MAX_IMAGES && styles.uploadButtonDisabled]}
          onPress={handlePickImage}
          disabled={uploading || imageCount >= MAX_IMAGES}
        >
          <Ionicons name="images" size={22} color={imageCount >= MAX_IMAGES ? '#9CA3AF' : '#3B82F6'} />
          <Text style={[styles.uploadButtonText, imageCount >= MAX_IMAGES && styles.uploadButtonTextDisabled]}>
            {'Gallery'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, pdfCount >= MAX_PDFS && styles.uploadButtonDisabled]}
          onPress={handlePickPDF}
          disabled={uploading || pdfCount >= MAX_PDFS}
        >
          <Ionicons name="document" size={22} color={pdfCount >= MAX_PDFS ? '#9CA3AF' : '#EF4444'} />
          <Text style={[styles.uploadButtonText, pdfCount >= MAX_PDFS && styles.uploadButtonTextDisabled]}>
            {'PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={styles.uploadingIndicator}>
          <ActivityIndicator color="#3B82F6" />
          <Text style={styles.uploadingText}>{'Uploading...'}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#3B82F6" />
      ) : (images.length === 0 && floorplans.length === 0) ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-upload-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>{'No files uploaded yet'}</Text>
          <Text style={styles.emptySubtext}>{'Tap the buttons above to add images or PDFs'}</Text>
        </View>
      ) : (
        <>
          {/* Images Section */}
          {imageCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{`Images (${imageCount})`}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {images.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.imageThumb}
                    onPress={() => handleViewImage(item)}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <Text style={styles.fileName} numberOfLines={1}>{item.filename || 'Image'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* PDFs Section */}
          {pdfCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{`Floor Plans (${pdfCount})`}</Text>
              {floorplans.map((file, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.pdfItem}
                  onPress={() => handleOpenPDF(file)}
                >
                  <View style={styles.pdfIcon}>
                    <Ionicons name="document-text" size={24} color="#EF4444" />
                  </View>
                  <View style={styles.pdfInfo}>
                    <Text style={styles.pdfName} numberOfLines={1}>{file.filename || 'Floor Plan'}</Text>
                    {file.size ? (
                      <Text style={styles.pdfSize}>
                        {`${Math.round((file.size || 0) / 1024)} KB`}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="open-outline" size={20} color="#6B7280" />
                </TouchableOpacity>
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
                {selectedImage?.filename || 'Image'}
              </Text>
              <TouchableOpacity onPress={() => setSelectedImage(null)}>
                <Ionicons name="close" size={28} color="#1F2937" />
              </TouchableOpacity>
            </View>
            {selectedImage && (
              <Image
                source={{ uri: selectedImage.url }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            )}
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
  fullImage: {
    flex: 1,
    backgroundColor: '#000',
  },
});
