import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../services/api';

// Safe string helper - converts any value to string safely
const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// Safe number helper
const safeNum = (val: any): number => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// Channel and Outcome options
const CHANNELS = ['Call', 'WhatsApp', 'SMS', 'Email', 'Visit'];
const OUTCOMES = ['Connected', 'No Answer', 'Call Back', 'Left VM', 'Rescheduled', 'Not Interested', 'Deal Won', 'Deal Lost', 'Other'];

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Followup/Conversation state
  const [followups, setFollowups] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logChannel, setLogChannel] = useState('Call');
  const [logOutcome, setLogOutcome] = useState('Connected');
  const [logNotes, setLogNotes] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [nextReminderDate, setNextReminderDate] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    loadLead();
    loadFollowups();
  }, [id]);

  const loadLead = async () => {
    try {
      setError(null);
      const data = await api.getLead(String(id));
      console.log('Lead data loaded:', JSON.stringify(data, null, 2));
      setLead(data);
    } catch (err) {
      console.error('Failed to load lead:', err);
      setError('Failed to load lead details');
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const loadFollowups = async () => {
    try {
      const data = await api.getLeadFollowups(String(id));
      setFollowups(data || []);
    } catch (err) {
      console.error('Failed to load followups:', err);
    }
  };

  const handleSaveLog = async () => {
    if (!logChannel || !logOutcome) {
      Alert.alert('Error', 'Please select channel and outcome');
      return;
    }
    
    setSavingLog(true);
    try {
      await api.createFollowup(String(id), {
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{'Loading...'}</Text>
      </View>
    );
  }

  if (error || !lead) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Lead not found'}</Text>
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
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
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

        {/* Action Buttons */}
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
          <View style={styles.floorPricingGrid}>
            {lead.floor_pricing.map((fp: any, index: number) => (
              <View key={index} style={styles.floorPricingCard}>
                <Text style={styles.floorLabel}>{safeStr(fp.floor_label)}</Text>
                <Text style={styles.floorPrice}>
                  {`₹${safeNum(fp.floor_amount)} ${formatUnit(lead.unit)}`}
                </Text>
              </View>
            ))}
          </View>
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

      {/* Delete Button */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>{'Delete Lead'}</Text>
        </TouchableOpacity>
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
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
    color: '#EF4444',
    marginTop: 16,
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
  leadName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
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
});
