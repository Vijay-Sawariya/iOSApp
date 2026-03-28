import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Safe string helper - converts any value to string safely
export const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// Safe number helper
export const safeNum = (val: any): number => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// Format unit helper
export const formatUnit = (unit: string | null): string => {
  if (!unit) return '';
  switch (unit.toUpperCase()) {
    case 'CR': return 'Cr';
    case 'L': return 'L';
    case 'K':
    case 'TH': return 'K';
    default: return unit;
  }
};

interface DetailRowProps {
  icon: string;
  label: string;
  value: any;
}

export const DetailRow: React.FC<DetailRowProps> = ({ icon, label, value }) => {
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

interface SectionCardProps {
  title: string;
  icon?: string;
  iconColor?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({ 
  title, 
  icon, 
  iconColor = '#1F2937',
  children 
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && <Ionicons name={icon as any} size={20} color={iconColor} />}
        <Text style={[styles.sectionTitle, icon && styles.sectionTitleWithIcon]}>{title}</Text>
      </View>
      {children}
    </View>
  );
};

interface ActionButtonProps {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, color, onPress }) => {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.actionButtonText}>{label}</Text>
    </TouchableOpacity>
  );
};

interface FloorPricingGridProps {
  floorPricing: Array<{ floor_label: string; floor_amount: number }>;
  unit: string | null;
}

export const FloorPricingGrid: React.FC<FloorPricingGridProps> = ({ floorPricing, unit }) => {
  if (!floorPricing || floorPricing.length === 0) return null;
  
  return (
    <View style={styles.floorPricingGrid}>
      {floorPricing.map((fp, index) => (
        <View key={index} style={styles.floorPricingCard}>
          <Text style={styles.floorLabel}>{safeStr(fp.floor_label)}</Text>
          <Text style={styles.floorPrice}>
            {`₹${safeNum(fp.floor_amount)} ${formatUnit(unit)}`}
          </Text>
        </View>
      ))}
    </View>
  );
};

interface PlotSpecificationsProps {
  plotSpecs: {
    total_builtup: number;
    per_floor_builtup: number;
  };
}

export const PlotSpecifications: React.FC<PlotSpecificationsProps> = ({ plotSpecs }) => {
  return (
    <View style={styles.specGrid}>
      <View style={styles.specCard}>
        <Text style={styles.specLabel}>Total Built-up</Text>
        <Text style={styles.specValue}>
          {`${safeNum(plotSpecs.total_builtup).toFixed(0)} sq.ft`}
        </Text>
      </View>
      <View style={styles.specCard}>
        <Text style={styles.specLabel}>Per Floor Built-up</Text>
        <Text style={styles.specValue}>
          {`${safeNum(plotSpecs.per_floor_builtup).toFixed(2)} sq.ft`}
        </Text>
      </View>
    </View>
  );
};

interface CircleValuesProps {
  circleValues: Array<{ label: string; value: number }>;
}

export const CircleValues: React.FC<CircleValuesProps> = ({ circleValues }) => {
  const total = circleValues.reduce((sum, cv) => sum + safeNum(cv.value), 0);
  
  return (
    <>
      <View style={styles.circleValueGrid}>
        {circleValues.map((cv, index) => (
          <View key={index} style={styles.circleValueCard}>
            <Text style={styles.circleFloorLabel}>{safeStr(cv.label)}</Text>
            <Text style={styles.circleFloorValue}>
              {`₹${safeNum(cv.value).toFixed(2)} Cr`}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.totalCircleValueRow}>
        <Text style={styles.totalCircleLabel}>Total Circle Value:</Text>
        <Text style={styles.totalCircleValue}>{`₹${total.toFixed(2)} Cr`}</Text>
      </View>
    </>
  );
};

interface MatchedPropertyCardProps {
  property: {
    property_name: string;
    property_type: string;
    property_location: string;
    property_address: string;
    property_size: string;
    property_price: number;
    property_bhk: string;
    property_status: string;
    property_floor: string;
    property_map_url?: string;
    created_by_name?: string;
    created_by_phone?: string;
  };
  unit: string | null;
}

export const MatchedPropertyCard: React.FC<MatchedPropertyCardProps> = ({ property, unit }) => {
  const getTypeLabel = (type: any): string => {
    if (!type) return 'Unknown';
    const str = safeStr(type);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return (
    <View style={styles.matchedPropertyCard}>
      <View style={styles.matchedPropertyHeader}>
        <View style={styles.matchedPropertyNameContainer}>
          <Text style={styles.matchedPropertyName}>{safeStr(property.property_name)}</Text>
          <Text style={styles.matchedPropertyType}>{` (${getTypeLabel(property.property_type)})`}</Text>
        </View>
        <View style={styles.matchedPropertyActions}>
          {property.created_by_phone && (
            <TouchableOpacity 
              style={styles.actionIcon}
              onPress={() => Linking.openURL(`tel:${property.created_by_phone}`)}
            >
              <Ionicons name="call" size={18} color="#22C55E" />
            </TouchableOpacity>
          )}
          {property.property_map_url && (
            <TouchableOpacity 
              style={styles.actionIcon}
              onPress={() => Linking.openURL(property.property_map_url!)}
            >
              <Ionicons name="map" size={18} color="#3B82F6" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <View style={styles.matchedPropertyDetails}>
        <Text style={styles.matchedPropertyLocation}>
          {[property.property_address, property.property_location].filter(Boolean).join(', ')}
        </Text>
        <View style={styles.matchedPropertyTags}>
          {property.property_size && (
            <Text style={styles.propertyTag}>{safeStr(property.property_size)} sq.yds</Text>
          )}
          {property.property_bhk && (
            <Text style={styles.propertyTag}>{safeStr(property.property_bhk)}</Text>
          )}
          {property.property_floor && (
            <Text style={styles.propertyTag}>{safeStr(property.property_floor)}</Text>
          )}
          {property.property_status && (
            <Text style={[styles.propertyTag, styles.statusTag]}>{safeStr(property.property_status)}</Text>
          )}
        </View>
        {property.property_price > 0 && (
          <Text style={styles.matchedPropertyPrice}>
            {`₹${safeNum(property.property_price)} ${formatUnit(unit)}`}
          </Text>
        )}
        {property.created_by_name && (
          <Text style={styles.createdByText}>by {safeStr(property.created_by_name)}</Text>
        )}
      </View>
    </View>
  );
};

interface ConversationItemProps {
  followup: {
    followup_date: string;
    channel: string;
    outcome: string;
    notes: string;
    next_reminder_date?: string;
  };
}

export const ConversationItem: React.FC<ConversationItemProps> = ({ followup }) => {
  const getChannelIcon = (channel: string) => {
    switch (channel?.toLowerCase()) {
      case 'call': return 'call';
      case 'whatsapp': return 'logo-whatsapp';
      case 'sms': return 'chatbubble';
      case 'email': return 'mail';
      case 'visit': return 'walk';
      default: return 'chatbubble-ellipses';
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome?.toLowerCase()) {
      case 'connected': return '#22C55E';
      case 'deal won': return '#10B981';
      case 'no answer':
      case 'not interested':
      case 'deal lost': return '#EF4444';
      default: return '#F59E0B';
    }
  };

  return (
    <View style={styles.conversationItem}>
      <View style={styles.conversationIcon}>
        <Ionicons name={getChannelIcon(followup.channel) as any} size={20} color="#3B82F6" />
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationDate}>
            {new Date(followup.followup_date).toLocaleDateString()}
          </Text>
          <View style={[styles.outcomeBadge, { backgroundColor: getOutcomeColor(followup.outcome) + '20' }]}>
            <Text style={[styles.outcomeText, { color: getOutcomeColor(followup.outcome) }]}>
              {safeStr(followup.outcome)}
            </Text>
          </View>
        </View>
        {followup.notes && (
          <Text style={styles.conversationNotes}>{safeStr(followup.notes)}</Text>
        )}
        {followup.next_reminder_date && (
          <Text style={styles.nextReminder}>
            Next reminder: {new Date(followup.next_reminder_date).toLocaleDateString()}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Detail Row
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
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
    maxWidth: '50%',
    textAlign: 'right',
  },
  
  // Section
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  sectionTitleWithIcon: {
    marginLeft: 8,
  },
  
  // Action Button
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  
  // Floor Pricing
  floorPricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  floorPricingCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    minWidth: '45%',
    flex: 1,
  },
  floorLabel: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '500',
  },
  floorPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 4,
  },
  
  // Spec Grid
  specGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  specCard: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
  },
  specLabel: {
    fontSize: 12,
    color: '#1E40AF',
    marginBottom: 4,
  },
  specValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  
  // Circle Values
  circleValueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  circleValueCard: {
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    padding: 12,
    minWidth: '45%',
    flex: 1,
  },
  circleFloorLabel: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '500',
  },
  circleFloorValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7C3AED',
    marginTop: 4,
  },
  totalCircleValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    padding: 12,
  },
  totalCircleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  totalCircleValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // Matched Property
  matchedPropertyCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  matchedPropertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchedPropertyNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  matchedPropertyName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  matchedPropertyType: {
    fontSize: 13,
    color: '#6B7280',
  },
  matchedPropertyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
  },
  matchedPropertyDetails: {
    gap: 4,
  },
  matchedPropertyLocation: {
    fontSize: 13,
    color: '#6B7280',
  },
  matchedPropertyTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  propertyTag: {
    fontSize: 11,
    color: '#374151',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusTag: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  matchedPropertyPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
    marginTop: 6,
  },
  createdByText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  
  // Conversation
  conversationItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  conversationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  outcomeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  conversationNotes: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  nextReminder: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
