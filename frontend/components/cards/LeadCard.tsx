import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Lead,
  getTypeColor,
  getTemperatureColor,
  formatFloorPricing,
} from '../../constants/leadOptions';
import { colors, radii, shadows } from '../../constants/theme';

interface LeadCardProps {
  lead: Lead;
  showActions?: boolean;
  onDelete?: (id: number, name: string) => void;
  onAddReminder?: (lead: Lead) => void;
}

export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  showActions = true,
  onDelete,
  onAddReminder,
}) => {
  const typeColor = getTypeColor(lead.lead_type);
  const tempColor = getTemperatureColor(lead.lead_temperature);
  const floorPricing = formatFloorPricing(lead.floor_pricing, lead.unit);
  const hasMapUrl = lead.Property_locationUrl && lead.Property_locationUrl.trim() !== '';
  const addressLocation = [lead.address, lead.location].filter(Boolean).join(', ');

  const openMapUrl = () => {
    if (lead.Property_locationUrl) {
      Linking.openURL(lead.Property_locationUrl).catch(err =>
        console.error('Failed to open map URL:', err)
      );
    }
  };

  const getTypeLabel = (type: string | null) => {
    switch (type) {
      case 'buyer': return 'Buyer';
      case 'tenant': return 'Tenant';
      case 'seller': return 'Sell';
      case 'landlord': return 'Rent';
      case 'builder': return 'Builder';
      default: return type || 'N/A';
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.content}
        onPress={() => router.push(`/leads/${lead.id}`)}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.nameContainer}>
              <Text style={styles.name}>{lead.name}</Text>
              {lead.created_by_name && (
                <Text style={styles.createdBy}>Gen. By {lead.created_by_name}</Text>
              )}
            </View>
            <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
              <Text style={[styles.typeText, { color: typeColor.text }]}>
                {getTypeLabel(lead.lead_type)}
              </Text>
            </View>
          </View>
          <View style={[styles.tempIndicator, { backgroundColor: tempColor }]} />
        </View>

        {lead.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color="#6B7280" />
            <Text style={styles.infoText}>{lead.phone}</Text>
          </View>
        )}

        {addressLocation && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            {hasMapUrl ? (
              <TouchableOpacity onPress={openMapUrl}>
                <Text style={[styles.infoText, styles.mapLink]}>{addressLocation}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.infoText}>{addressLocation}</Text>
            )}
            {hasMapUrl && (
              <TouchableOpacity style={styles.mapIconButton} onPress={openMapUrl}>
                <Ionicons name="map" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.propertyInfo}>
          {lead.property_type && <Text style={styles.propertyText}>{lead.property_type}</Text>}
          {lead.area_size && <Text style={styles.propertyText}>{lead.area_size} sq.yds</Text>}
          {lead.lead_status && <Text style={styles.statusText}>{lead.lead_status}</Text>}
        </View>

        {floorPricing && (
          <View style={styles.pricingRow}>
            <Ionicons name="cash-outline" size={14} color="#10B981" />
            <Text style={styles.pricingText} numberOfLines={1}>{floorPricing}</Text>
          </View>
        )}
      </TouchableOpacity>

      {showActions && (
        <View style={styles.actionsRow}>
          {onAddReminder && (
            <TouchableOpacity style={styles.actionButton} onPress={() => onAddReminder(lead)}>
              <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
              <Text style={styles.actionText}>Reminder</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/leads/edit/${lead.id}` as any)}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          {onDelete && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onDelete(lead.id, lead.name)}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    overflow: 'hidden',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  createdBy: {
    fontSize: 11,
    color: colors.inkSubtle,
    marginTop: 2,
    fontStyle: 'italic',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tempIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    marginTop: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.inkMuted,
    marginLeft: 6,
    flex: 1,
  },
  mapLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  mapIconButton: {
    padding: 4,
    marginLeft: 4,
  },
  propertyInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  propertyText: {
    fontSize: 12,
    color: '#374151',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.xs,
  },
  statusText: {
    fontSize: 12,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.xs,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.accentSoft,
    padding: 8,
    borderRadius: radii.sm,
  },
  pricingText: {
    fontSize: 13,
    color: colors.accent,
    marginLeft: 6,
    fontWeight: '500',
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.inkMuted,
    marginLeft: 4,
  },
});

export default LeadCard;
