import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { offlineApi } from '../../services/offlineApi';
import { useOffline } from '../../contexts/OfflineContext';

// Import shared components and helpers
import {
  safeStr,
  safeNum,
  formatUnit,
  DetailRow,
  FloorPricingGrid,
  PlotSpecifications,
  CircleValues,
} from '../../components/details/LeadDetailSections';

// GoDaddy API Configuration
const GODADDY_BASE_URL = 'https://sagarhomelms.com';
const GODADDY_API_KEY = 'SagarHome_Upload_2024_Secret';

// Channel and Outcome options
const CHANNELS = ['Call', 'WhatsApp', 'SMS', 'Email', 'Visit'];
const OUTCOMES = ['Connected', 'No Answer', 'Call Back', 'Left VM', 'Rescheduled', 'Not Interested', 'Deal Won', 'Deal Lost', 'Other'];

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useOffline();
  
  // Followup/Conversation state
  const [followups, setFollowups] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logChannel, setLogChannel] = useState('Call');
  const [logOutcome, setLogOutcome] = useState('Connected');
  const [logNotes, setLogNotes] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextReminderDate, setNextReminderDate] = useState('');
  const [savingLog, setSavingLog] = useState(false);
  
  // File upload state
  const [images, setImages] = useState<any[]>([]);
  const [floorplans, setFloorplans] = useState<any[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Refresh data when screen comes into focus (e.g., returning from edit)
  useFocusEffect(
    useCallback(() => {
      loadLead();
      loadFollowups();
      loadFiles();
    }, [id])
  );

  const loadLead = async () => {
    try {
      setError(null);
      const data = await offlineApi.getLead(String(id));
      console.log('Lead data loaded:', JSON.stringify(data, null, 2));
      setLead(data);
    } catch (err: any) {
      console.error('Failed to load lead:', err);
      const errorMessage = err?.message || 'Failed to load lead details';
      setError(errorMessage);
      // Don't show alert for "no cached data" errors - the error UI will handle it
      if (!errorMessage.includes('No cached data')) {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFollowups = async () => {
    try {
      const data = await offlineApi.getLeadFollowups(String(id));
      setFollowups(data || []);
    } catch (err) {
      console.error('Failed to load followups:', err);
    }
  };

  // File management functions
  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const response = await fetch(
        `${GODADDY_BASE_URL}/mobile_get_files.php?lead_id=${id}&api_key=${GODADDY_API_KEY}`
      );
      const data = await response.json();
      if (data.success) {
        setImages(data.data.images || []);
        setFloorplans(data.data.floorplans || []);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const uploadFile = async (uri: string, filename: string, type: 'image' | 'floorplan') => {
    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
      type: type === 'floorplan' ? 'application/pdf' : 'image/jpeg',
      name: filename,
    } as any);
    formData.append('lead_id', String(id));
    formData.append('type', type);
    formData.append('api_key', GODADDY_API_KEY);

    const response = await fetch(`${GODADDY_BASE_URL}/mobile_upload.php`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Upload failed');
    }
    return data;
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImage(true);
        try {
          const asset = result.assets[0];
          const filename = asset.fileName || `image_${Date.now()}.jpg`;
          await uploadFile(asset.uri, filename, 'image');
          Alert.alert('Success', 'Image uploaded successfully');
          loadFiles();
        } catch (err: any) {
          Alert.alert('Upload Failed', err.message || 'Failed to upload image');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (err) {
      console.error('Image picker error:', err);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImage(true);
        try {
          const asset = result.assets[0];
          const filename = `photo_${Date.now()}.jpg`;
          await uploadFile(asset.uri, filename, 'image');
          Alert.alert('Success', 'Photo uploaded successfully');
          loadFiles();
        } catch (err: any) {
          Alert.alert('Upload Failed', err.message || 'Failed to upload photo');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingPdf(true);
        try {
          const asset = result.assets[0];
          await uploadFile(asset.uri, asset.name, 'floorplan');
          Alert.alert('Success', 'PDF uploaded successfully');
          loadFiles();
        } catch (err: any) {
          Alert.alert('Upload Failed', err.message || 'Failed to upload PDF');
        } finally {
          setUploadingPdf(false);
        }
      }
    } catch (err) {
      console.error('Document picker error:', err);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleViewFile = (url: string) => {
    Linking.openURL(url);
  };

  const handleSaveLog = async () => {
    if (!logChannel || !logOutcome) {
      Alert.alert('Error', 'Please select channel and outcome');
      return;
    }
    
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot save conversation while offline. Please connect to the internet.');
      return;
    }
    
    setSavingLog(true);
    try {
      await offlineApi.createFollowup(String(id), {
        channel: logChannel,
        outcome: logOutcome,
        notes: logNotes,
        followup_date: logDate,
        next_followup: nextReminderDate ? `${nextReminderDate}T09:00` : undefined,
      });
      Alert.alert('Success', 'Conversation logged successfully');
      setShowLogModal(false);
      setLogChannel('Call');
      setLogOutcome('Connected');
      setLogNotes('');
      setLogDate(new Date().toISOString().split('T')[0]);
      setNextReminderDate('');
      loadFollowups();
    } catch (err) {
      console.error('Failed to save log:', err);
      Alert.alert('Error', 'Failed to save conversation log');
    } finally {
      setSavingLog(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCall = () => {
    if (lead?.phone) {
      Linking.openURL(`tel:${safeStr(lead.phone)}`);
    }
  };

  const handleWhatsApp = () => {
    if (lead?.phone) {
      const cleanPhone = safeStr(lead.phone).replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleEmail = () => {
    if (lead?.email) {
      Linking.openURL(`mailto:${safeStr(lead.email)}`);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Lead',
      'Are you sure you want to delete this lead?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLead(String(id));
              Alert.alert('Success', 'Lead deleted successfully');
              router.back();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete lead');
            }
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    router.push(`/leads/edit/${id}` as any);
  };

  const handleCopyDetails = async () => {
    if (!lead) return;
    
    const unit = formatUnit(lead.unit).toUpperCase();
    let details = '';
    
    // Build copy text based on PHP format
    details += `${safeStr(lead.name)}\n`;
    if (lead.phone) details += `📞 ${safeStr(lead.phone)}\n`;
    // Address & Location (inline)
    if (lead.address || lead.location) {
      details += '📍 ';
      if (lead.address) details += safeStr(lead.address);
      if (lead.address && lead.location) details += ', ';
      if (lead.location) details += safeStr(lead.location);
      details += '\n';
    }
    
    // Property details
    const propDetails = [];
    if (lead.property_type) propDetails.push(lead.property_type);
    if (lead.bhk) propDetails.push(lead.bhk);
    if (lead.floor) propDetails.push(lead.floor);
    if (lead.area_size) propDetails.push(`${lead.area_size} sq yds`);
    if (lead.property_status) propDetails.push(lead.property_status);
    if (propDetails.length > 0) {
      details += `🏠 ${propDetails.join(' | ')}\n`;
    }
    
    // Floor pricing
    if (lead.floor_pricing && lead.floor_pricing.length > 0) {
      details += '\n💰 Floor-wise Pricing:\n';
      lead.floor_pricing.forEach((fp: any) => {
        details += `   • ${fp.floor_label}: ₹${fp.floor_amount} ${unit}\n`;
      });
      details += '   (All prices are negotiable)\n';
    }
    
    // Budget for clients
    if (lead.budget_min || lead.budget_max) {
      const min = lead.budget_min || 0;
      const max = lead.budget_max || 0;
      if (min === max && min > 0) {
        details += `💵 Budget: ₹${min} ${unit}\n`;
      } else if (min > 0 && max > 0) {
        details += `💵 Budget: ₹${min} - ₹${max} ${unit}\n`;
      }
    }
    
    // Notes
    if (lead.notes) {
      details += `\n📝 Notes: ${safeStr(lead.notes)}\n`;
    }
    
    // Google Maps link
    if (lead.Property_locationUrl) {
      details += `\n🗺️ Location: ${lead.Property_locationUrl}\n`;
    }
    
    try {
      await Clipboard.setStringAsync(details);
      Alert.alert('Copied!', 'Lead details copied to clipboard');
    } catch (err) {
      Alert.alert('Error', 'Failed to copy details');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{'Loading...'}</Text>
      </View>
    );
  }

  if (error || !lead) {
    const isOfflineError = error?.includes('No cached data') || error?.includes('offline');
    return (
      <View style={styles.errorContainer}>
        <Ionicons 
          name={isOfflineError ? "cloud-offline" : "alert-circle"} 
          size={48} 
          color={isOfflineError ? "#6B7280" : "#EF4444"} 
        />
        <Text style={styles.errorText}>
          {isOfflineError 
            ? 'No offline data available' 
            : (error || 'Lead not found')
          }
        </Text>
        <Text style={styles.errorSubText}>
          {isOfflineError 
            ? 'This lead hasn\'t been viewed before while online. Please connect to the internet to load it.'
            : 'There was an error loading this lead.'
          }
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{'Go Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getTypeLabel = (type: any): string => {
    if (!type) return 'Unknown';
    const str = safeStr(type);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const formatBudget = (): string => {
    const min = lead.budget_min ? safeNum(lead.budget_min) : 0;
    const max = lead.budget_max ? safeNum(lead.budget_max) : 0;
    const unit = formatUnit(lead.unit);
    
    // If min and max are same, show only one value
    if (min === max && min > 0) {
      return `₹${min} ${unit}`;
    }
    // If only min exists
    if (min > 0 && max === 0) {
      return `₹${min}+ ${unit}`;
    }
    // If only max exists
    if (max > 0 && min === 0) {
      return `Up to ₹${max} ${unit}`;
    }
    // Both exist
    return `₹${min} - ₹${max} ${unit}`;
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR':
        return 'Cr';
      case 'L':
        return 'L';
      case 'K':
      case 'TH':
        return 'K';
      default:
        return unit;
    }
  };

  const isInventoryLead = (): boolean => {
    const type = safeStr(lead.lead_type).toLowerCase();
    return ['seller', 'landlord', 'builder'].includes(type);
  };

  const isClientLead = (): boolean => {
    const type = safeStr(lead.lead_type).toLowerCase();
    return ['buyer', 'tenant'].includes(type);
  };

  // Render a detail row safely
  const renderDetailRow = (icon: string, label: string, value: any) => {
    const strValue = safeStr(value);
    if (!strValue) return null;
    return (
      <View style={styles.detailRow}>
        <Ionicons name={icon as any} size={20} color="#6B7280" />
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{strValue}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'Lead Details'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      
      <ScrollView style={styles.scrollContent}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.leadName}>{safeStr(lead.name) || 'Unknown'}</Text>
            <View style={styles.badges}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{getTypeLabel(lead.lead_type)}</Text>
              </View>
              {lead.lead_temperature ? (
                <View style={styles.temperatureBadge}>
                  <Text style={styles.temperatureText}>{safeStr(lead.lead_temperature)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          
          {/* Header Action Icons */}
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} onPress={handleEdit}>
              <Ionicons name="create-outline" size={22} color="#3B82F6" />
            </TouchableOpacity>
            {isInventoryLead() ? (
              <TouchableOpacity style={styles.headerIconButton} onPress={handleCopyDetails}>
                <Ionicons name="copy-outline" size={22} color="#10B981" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.headerIconButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionButtons}>
          {lead.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color="#3B82F6" />
              <Text style={styles.actionButtonText}>{'Call'}</Text>
            </TouchableOpacity>
          ) : null}
          {lead.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              <Text style={styles.actionButtonText}>{'WhatsApp'}</Text>
            </TouchableOpacity>
          ) : null}
          {lead.email ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <Ionicons name="mail" size={24} color="#6B7280" />
              <Text style={styles.actionButtonText}>{'Email'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Contact Information'}</Text>
        {renderDetailRow('call', 'Phone', lead.phone)}
        {renderDetailRow('mail', 'Email', lead.email)}
        {renderDetailRow('location', 'Location', lead.location)}
        {renderDetailRow('home', 'Address', lead.address)}
      </View>

      {/* Property Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Property Details'}</Text>
        {renderDetailRow('business', 'Type', lead.property_type)}
        {renderDetailRow('bed', 'BHK', lead.bhk)}
        {renderDetailRow('layers', 'Floor', lead.floor)}
        {renderDetailRow('resize', 'Area Size', lead.area_size ? `${safeStr(lead.area_size)} sq.yds` : null)}
        {renderDetailRow('car', 'Parking', lead.car_parking_number)}
        {renderDetailRow('arrow-up', 'Lift', lead.lift_available)}
        {(lead.budget_min || lead.budget_max) ? (
          <View style={styles.detailRow}>
            <Ionicons name="cash" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>{'Budget'}</Text>
            <Text style={styles.detailValue}>{formatBudget()}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <Ionicons name="flag" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>{'Status'}</Text>
          <Text style={styles.detailValue}>{safeStr(lead.lead_status) || 'New'}</Text>
        </View>
      </View>

      {/* Floor Pricing - For Inventory Leads */}
      {isInventoryLead() && lead.floor_pricing && lead.floor_pricing.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Floor-wise Pricing'}</Text>
          <FloorPricingGrid floorPricing={lead.floor_pricing} unit={lead.unit} />
        </View>
      ) : null}

      {/* Plot Size Specification - For Inventory Leads */}
      {isInventoryLead() && lead.calculations?.plot_specifications ? (
        <View style={styles.section}>
          <View style={styles.calcHeader}>
            <Ionicons name="calculator-outline" size={20} color="#0369A1" />
            <Text style={styles.sectionTitleWithIcon}>{'Plot Size Specification'}</Text>
          </View>
          <PlotSpecifications plotSpecs={lead.calculations.plot_specifications} />
        </View>
      ) : null}

      {/* Circle Value - For Inventory Leads */}
      {isInventoryLead() && lead.calculations?.circle_values && lead.calculations.circle_values.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.calcHeader}>
            <Ionicons name="stats-chart-outline" size={20} color="#7C3AED" />
            <Text style={styles.sectionTitleWithIcon}>{'Circle Value (approx)'}</Text>
          </View>
          <CircleValues circleValues={lead.calculations.circle_values} />
        </View>
      ) : null}

      {/* Client Notes - Show before Matched Property List */}
      {isClientLead() && lead.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Notes'}</Text>
          <Text style={styles.notesText}>{safeStr(lead.notes)}</Text>
        </View>
      ) : null}

      {/* Matched Property List - For Client Leads */}
      {isClientLead() && lead.matched_properties && lead.matched_properties.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Matched Property List'}</Text>
          {lead.matched_properties.map((prop: any, index: number) => (
            <View key={index} style={styles.matchedPropertyCard}>
              {/* Property Header with Action Icons */}
              <View style={styles.matchedPropertyHeader}>
                <View style={styles.matchedPropertyNameContainer}>
                  <Text style={styles.matchedPropertyName}>{safeStr(prop.property_name)}</Text>
                  <Text style={styles.matchedPropertyType}>{` (${getTypeLabel(prop.property_type)})`}</Text>
                </View>
                <View style={styles.matchedPropertyActions}>
                  {prop.created_by_phone ? (
                    <TouchableOpacity 
                      style={styles.actionIcon}
                      onPress={() => Linking.openURL(`tel:${prop.created_by_phone}`)}
                    >
                      <Ionicons name="call" size={18} color="#22C55E" />
                    </TouchableOpacity>
                  ) : null}
                  {prop.property_map_url ? (
                    <TouchableOpacity 
                      style={styles.actionIcon}
                      onPress={() => Linking.openURL(prop.property_map_url)}
                    >
                      <Ionicons name="location" size={18} color="#3B82F6" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              
              {/* Phone with Gen By */}
              {(prop.created_by_fullname || prop.created_by_phone) ? (
                <View style={styles.matchedPropertyInfoRow}>
                  <Ionicons name="call-outline" size={16} color="#22C55E" />
                  <Text style={styles.matchedPropertyInfoText}>
                    {safeStr(prop.created_by_phone)}
                    {prop.created_by_fullname ? (
                      <Text style={styles.genByText}>{`  (Gen By: ${safeStr(prop.created_by_fullname)})`}</Text>
                    ) : null}
                  </Text>
                </View>
              ) : null}
              
              {/* Property Details Row - Address | Location | Floor | BHK | Size */}
              <View style={styles.matchedPropertyInfoRow}>
                <Ionicons name="home-outline" size={16} color="#6B7280" />
                <Text style={styles.matchedPropertyInfoText}>
                  {[
                    prop.property_address,
                    prop.property_location,
                    prop.property_floor,
                    prop.property_bhk,
                    prop.property_size ? `${prop.property_size} sq yds` : null
                  ].filter(Boolean).join(' | ')}
                </Text>
              </View>
              
              {/* Status Row */}
              {prop.property_status ? (
                <View style={styles.matchedPropertyInfoRow}>
                  <Text style={styles.statusLabel}>{'Status: '}</Text>
                  <Text style={styles.statusValue}>{safeStr(prop.property_status)}</Text>
                </View>
              ) : null}
              
              {/* Notes */}
              {prop.property_notes ? (
                <Text style={styles.matchedPropertyNotes}>
                  {'Notes: '}{safeStr(prop.property_notes)}
                </Text>
              ) : null}
              
              {/* Floor-wise Pricing */}
              {prop.floor_pricing && prop.floor_pricing.length > 0 ? (
                <View style={styles.matchedPropertyFloorPricing}>
                  <Text style={styles.matchedPropertyFloorPricingTitle}>{'Floor-wise Pricing:'}</Text>
                  {prop.floor_pricing.map((fp: any, fpIndex: number) => (
                    <Text key={fpIndex} style={styles.matchedPropertyFloorPricingItem}>
                      {`• ${safeStr(fp.floor_label)}: ₹${safeNum(fp.floor_amount)} ${formatUnit(prop.property_unit).toUpperCase()}`}
                    </Text>
                  ))}
                  <Text style={styles.negotiableText}>{'(All prices are negotiable)'}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : isClientLead() ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Matched Property List'}</Text>
          <Text style={styles.noMatchedText}>{'No matched properties found'}</Text>
        </View>
      ) : null}

      {/* Additional Features */}
      {(lead.park_facing || lead.wide_road || lead.peaceful_location || lead.main_road || lead.corner) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Features'}</Text>
          <View style={styles.featuresGrid}>
            {lead.park_facing ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Park Facing'}</Text></View> : null}
            {lead.wide_road ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Wide Road'}</Text></View> : null}
            {lead.peaceful_location ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Peaceful'}</Text></View> : null}
            {lead.main_road ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Main Road'}</Text></View> : null}
            {lead.corner ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Corner'}</Text></View> : null}
          </View>
        </View>
      ) : null}

      {/* Notes - For Inventory Leads only (Client notes shown before Matched Properties) */}
      {isInventoryLead() && lead.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Notes'}</Text>
          <Text style={styles.notesText}>{safeStr(lead.notes)}</Text>
        </View>
      ) : null}

      {/* Images & Documents Section - Only for Inventory leads */}
      {isInventoryLead() ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Images & Documents'}</Text>
          
          {/* Images Grid */}
          <View style={styles.fileSubsection}>
            <View style={styles.fileSubsectionHeader}>
              <Text style={styles.fileSubsectionTitle}>{'Property Images'}</Text>
              <View style={styles.uploadButtonsRow}>
                <TouchableOpacity 
                  style={styles.uploadButton}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <>
                      <Ionicons name="images" size={18} color="#3B82F6" />
                      <Text style={styles.uploadButtonText}>{'Gallery'}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.uploadButton}
                  onPress={handleTakePhoto}
                  disabled={uploadingImage}
                >
                  <Ionicons name="camera" size={18} color="#3B82F6" />
                  <Text style={styles.uploadButtonText}>{'Camera'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {loadingFiles ? (
              <ActivityIndicator size="small" color="#6B7280" style={styles.loadingFiles} />
            ) : images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScrollView}>
                {images.map((img, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.imageCard}
                    onPress={() => handleViewFile(img.url)}
                  >
                    <Image 
                      source={{ uri: img.url }} 
                      style={styles.imageThumbnail}
                      resizeMode="cover"
                    />
                    <Text style={styles.imageFilename} numberOfLines={1}>{safeStr(img.filename)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.noFilesText}>{'No images uploaded yet'}</Text>
            )}
          </View>
          
          {/* Floorplans/PDFs */}
          <View style={styles.fileSubsection}>
            <View style={styles.fileSubsectionHeader}>
              <Text style={styles.fileSubsectionTitle}>{'Floor Plans (PDF)'}</Text>
              <TouchableOpacity 
                style={styles.uploadButton}
                onPress={handlePickPdf}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <>
                    <Ionicons name="document" size={18} color="#10B981" />
                    <Text style={[styles.uploadButtonText, { color: '#10B981' }]}>{'Upload PDF'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            
            {loadingFiles ? (
              <ActivityIndicator size="small" color="#6B7280" style={styles.loadingFiles} />
            ) : floorplans.length > 0 ? (
              <View style={styles.pdfList}>
                {floorplans.map((pdf, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.pdfCard}
                    onPress={() => handleViewFile(pdf.url)}
                  >
                    <Ionicons name="document-text" size={24} color="#EF4444" />
                    <View style={styles.pdfInfo}>
                      <Text style={styles.pdfFilename} numberOfLines={1}>{safeStr(pdf.filename)}</Text>
                      <Text style={styles.pdfSize}>{`${Math.round(pdf.size / 1024)} KB`}</Text>
                    </View>
                    <Ionicons name="open-outline" size={20} color="#6B7280" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.noFilesText}>{'No floor plans uploaded yet'}</Text>
            )}
          </View>
        </View>
      ) : null}

      {/* Log Conversation Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{'Conversation History'}</Text>
          <TouchableOpacity 
            style={styles.addLogButton}
            onPress={() => setShowLogModal(true)}
          >
            <Ionicons name="add-circle" size={24} color="#3B82F6" />
            <Text style={styles.addLogButtonText}>{'Log'}</Text>
          </TouchableOpacity>
        </View>
        
        {followups.length > 0 ? (
          followups.map((followup, index) => (
            <View key={index} style={styles.followupCard}>
              <View style={styles.followupHeader}>
                <View style={styles.followupChannelBadge}>
                  <Ionicons 
                    name={
                      followup.channel === 'Call' ? 'call' :
                      followup.channel === 'WhatsApp' ? 'logo-whatsapp' :
                      followup.channel === 'SMS' ? 'chatbubble' :
                      followup.channel === 'Email' ? 'mail' :
                      followup.channel === 'Visit' ? 'walk' : 'chatbubbles'
                    } 
                    size={14} 
                    color="#FFFFFF" 
                  />
                  <Text style={styles.followupChannelText}>{safeStr(followup.channel)}</Text>
                </View>
                <View style={[
                  styles.followupOutcomeBadge,
                  { backgroundColor: followup.outcome === 'Connected' ? '#DCFCE7' : 
                    followup.outcome === 'No Answer' ? '#FEE2E2' :
                    followup.outcome === 'Deal Won' ? '#D1FAE5' :
                    followup.outcome === 'Deal Lost' ? '#FEE2E2' : '#F3F4F6' }
                ]}>
                  <Text style={[
                    styles.followupOutcomeText,
                    { color: followup.outcome === 'Connected' ? '#166534' : 
                      followup.outcome === 'No Answer' ? '#991B1B' :
                      followup.outcome === 'Deal Won' ? '#065F46' :
                      followup.outcome === 'Deal Lost' ? '#991B1B' : '#4B5563' }
                  ]}>{safeStr(followup.outcome)}</Text>
                </View>
              </View>
              {followup.notes ? (
                <Text style={styles.followupNotes}>{safeStr(followup.notes)}</Text>
              ) : null}
              <View style={styles.followupFooter}>
                <Text style={styles.followupDate}>{formatDateTime(followup.created_at)}</Text>
                {followup.owner_name ? (
                  <Text style={styles.followupOwner}>{'by '}{safeStr(followup.owner_name)}</Text>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noFollowupsText}>{'No conversations logged yet'}</Text>
        )}
      </View>

      {/* Spacing at bottom */}
      <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Log Conversation Modal */}
      <Modal
        visible={showLogModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLogModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{'Log Conversation'}</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>{'Date of Conversation'}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                value={logDate}
                onChangeText={setLogDate}
              />
              
              <Text style={styles.modalLabel}>{'Channel'}</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={logChannel}
                  onValueChange={setLogChannel}
                  style={styles.picker}
                >
                  {CHANNELS.map((channel) => (
                    <Picker.Item key={channel} label={channel} value={channel} />
                  ))}
                </Picker>
              </View>
              
              <Text style={styles.modalLabel}>{'Outcome'}</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={logOutcome}
                  onValueChange={setLogOutcome}
                  style={styles.picker}
                >
                  {OUTCOMES.map((outcome) => (
                    <Picker.Item key={outcome} label={outcome} value={outcome} />
                  ))}
                </Picker>
              </View>
              
              <Text style={styles.modalLabel}>{'Notes'}</Text>
              <TextInput
                style={styles.notesInput}
                multiline
                numberOfLines={3}
                placeholder="Add notes about this conversation..."
                value={logNotes}
                onChangeText={setLogNotes}
              />
              
              <Text style={styles.modalLabel}>{'Next Reminder Date (Optional)'}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                value={nextReminderDate}
                onChangeText={setNextReminderDate}
              />
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowLogModal(false)}
              >
                <Text style={styles.cancelButtonText}>{'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveLogButton, savingLog && styles.disabledButton]}
                onPress={handleSaveLog}
                disabled={savingLog}
              >
                {savingLog ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveLogButtonText}>{'Save Log'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBackButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  backButton: {
    marginTop: 24,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  leadName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  typeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  temperatureBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  temperatureText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    textAlign: 'right',
    flex: 1,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  floorPricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  floorPricingCard: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: 12,
    marginBottom: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  floorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 4,
  },
  floorPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857',
  },
  featureBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0369A1',
  },
  notesText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
  noMatchedText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  matchedPropertyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  matchedPropertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchedPropertyNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  matchedPropertyName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  matchedPropertyType: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  matchedPropertyActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  matchedPropertyInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  matchedPropertyInfoText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  genByText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 24,
  },
  statusValue: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  matchedPropertyNotes: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 24,
  },
  matchedPropertyTypeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  matchedPropertyTypeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E40AF',
  },
  matchedPropertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchedPropertyRowText: {
    fontSize: 14,
    color: '#475569',
    marginLeft: 8,
    flex: 1,
  },
  matchedPropertyAddressContainer: {
    flex: 1,
    marginLeft: 8,
  },
  matchedPropertyAddressText: {
    fontSize: 14,
    color: '#475569',
  },
  matchedPropertyDetailsText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  linkText: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  matchedPropertyDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchedPropertyDetailText: {
    fontSize: 13,
    color: '#64748B',
  },
  matchedPropertyNotesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchedPropertyNotesText: {
    fontSize: 13,
    color: '#92400E',
    marginLeft: 8,
    flex: 1,
  },
  matchedPropertyFloorPricing: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  matchedPropertyFloorPricingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 6,
  },
  matchedPropertyFloorPricingItem: {
    fontSize: 14,
    color: '#047857',
    fontWeight: '500',
    marginLeft: 4,
    marginBottom: 2,
  },
  negotiableText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addLogButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addLogButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  followupCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  followupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  followupChannelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  followupChannelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  followupOutcomeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  followupOutcomeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followupNotes: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 8,
  },
  followupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  followupDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  followupOwner: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  noFollowupsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
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
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  pickerContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#1F2937',
  },
  notesInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  dateInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveLogButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveLogButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  bottomActions: {
    padding: 20,
    paddingBottom: 40,
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // File upload styles
  fileSubsection: {
    marginBottom: 20,
  },
  fileSubsectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fileSubsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  uploadButtonsRow: {
    flexDirection: 'row',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#3B82F6',
    marginLeft: 4,
  },
  loadingFiles: {
    marginVertical: 20,
  },
  imageScrollView: {
    marginTop: 8,
  },
  imageCard: {
    marginRight: 12,
    alignItems: 'center',
  },
  imageThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  imageFilename: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    maxWidth: 100,
    textAlign: 'center',
  },
  noFilesText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  pdfList: {
    marginTop: 8,
  },
  pdfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  pdfInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pdfFilename: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  pdfSize: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  // Plot Specs and Circle Value styles
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleWithIcon: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
  },
  specGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  specCard: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  specLabel: {
    fontSize: 12,
    color: '#0369A1',
    marginBottom: 4,
  },
  specValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0C4A6E',
  },
  circleValueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  circleValueCard: {
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    minWidth: 80,
  },
  circleFloorLabel: {
    fontSize: 11,
    color: '#7C3AED',
    marginBottom: 2,
  },
  circleFloorValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B21B6',
  },
  totalCircleValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    padding: 14,
    borderRadius: 10,
  },
  totalCircleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  totalCircleValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
