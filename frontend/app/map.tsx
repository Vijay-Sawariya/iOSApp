import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { LOCATIONS } from '../constants/leadOptions';

interface MapLead {
  id: number;
  name: string;
  lead_type: string;
  location: string;
  address: string | null;
  Property_locationUrl: string | null;
  budget_min: number | null;
  budget_max: number | null;
  bhk: string | null;
  area_size: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Delhi NCR default center
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 };

export default function MapViewScreen() {
  const { token, user } = useAuth();
  const [leads, setLeads] = useState<MapLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<MapLead | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState('');

  const loadMapData = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMapData(typeFilter || undefined);
      setLeads(data || []);
    } catch (err: any) {
      console.error('Failed to load map data:', err);
      setError(err.message || 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, [token, typeFilter]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  // Filter leads based on location
  const filteredLeads = locationFilter 
    ? leads.filter(l => l.location?.toLowerCase().includes(locationFilter.toLowerCase()))
    : leads;

  // Leads with valid coordinates for map
  const mappableLeads = filteredLeads.filter(l => l.latitude && l.longitude);

  // Generate HTML for the map
  const generateMapHtml = () => {
    const markers = mappableLeads.map(lead => {
      const color = lead.lead_type === 'seller' ? '#10B981' 
                  : lead.lead_type === 'landlord' ? '#F59E0B' 
                  : '#8B5CF6';
      const budget = lead.budget_max || lead.budget_min;
      const budgetStr = budget ? `₹${budget} Cr` : '';
      
      return `
        L.circleMarker([${lead.latitude}, ${lead.longitude}], {
          radius: 10,
          fillColor: '${color}',
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map)
        .bindPopup(\`
          <div style="min-width: 180px;">
            <strong style="font-size: 14px; color: #1F2937;">${lead.name}</strong><br/>
            <span style="color: ${color}; font-weight: 600;">${lead.lead_type === 'seller' ? 'For Sale' : lead.lead_type === 'landlord' ? 'For Rent' : 'Builder'}</span><br/>
            <span style="color: #6B7280;">${lead.location || 'N/A'}</span><br/>
            ${lead.area_size ? `<span style="color: #374151;"><strong>${lead.area_size}</strong> sq.yds</span><br/>` : ''}
            ${budgetStr ? `<span style="color: #10B981; font-weight: 600;">${budgetStr}</span><br/>` : ''}
            <a href="javascript:void(0)" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:'select', id: ${lead.id}}))" style="color: #3B82F6; text-decoration: none;">View Details →</a>
          </div>
        \`);
      `;
    }).join('\n');

    const center = mappableLeads.length > 0 
      ? { lat: mappableLeads[0].latitude!, lng: mappableLeads[0].longitude! }
      : DEFAULT_CENTER;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100vw; height: 100vh; }
          .leaflet-popup-content { margin: 10px; }
          .legend {
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          }
          .legend-item {
            display: flex;
            align-items: center;
            margin: 4px 0;
            font-size: 12px;
          }
          .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${center.lat}, ${center.lng}], 12);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);
          
          ${markers}
          
          // Add legend
          var legend = L.control({position: 'bottomright'});
          legend.onAdd = function(map) {
            var div = L.DomUtil.create('div', 'legend');
            div.innerHTML = '<div class="legend-item"><div class="legend-dot" style="background:#10B981"></div>For Sale</div>' +
                           '<div class="legend-item"><div class="legend-dot" style="background:#F59E0B"></div>For Rent</div>' +
                           '<div class="legend-item"><div class="legend-dot" style="background:#8B5CF6"></div>Builder</div>';
            return div;
          };
          legend.addTo(map);
          
          // Fit bounds if we have markers
          ${mappableLeads.length > 1 ? `
            var bounds = L.latLngBounds([
              ${mappableLeads.map(l => `[${l.latitude}, ${l.longitude}]`).join(',')}
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });
          ` : ''}
        </script>
      </body>
      </html>
    `;
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'select' && data.id) {
        const lead = leads.find(l => l.id === data.id);
        if (lead) {
          setSelectedLead(lead);
        }
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  const openInMaps = (lead: MapLead) => {
    if (lead.Property_locationUrl) {
      Linking.openURL(lead.Property_locationUrl);
    } else if (lead.latitude && lead.longitude) {
      const url = Platform.OS === 'ios'
        ? `maps://app?daddr=${lead.latitude},${lead.longitude}`
        : `geo:${lead.latitude},${lead.longitude}?q=${lead.latitude},${lead.longitude}`;
      Linking.openURL(url);
    }
  };

  // Filtered location options
  const filteredLocations = LOCATIONS.filter(loc => 
    loc.toLowerCase().includes(locationSearch.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Map View</Text>
          <TouchableOpacity 
            style={styles.filterBtn}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name="options-outline" 
              size={22} 
              color={(typeFilter || locationFilter) ? '#FFD700' : '#FFFFFF'} 
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {mappableLeads.length} of {filteredLeads.length} properties on map
        </Text>
        {(typeFilter || locationFilter) && (
          <TouchableOpacity 
            style={styles.clearBtn}
            onPress={() => {
              setTypeFilter('');
              setLocationFilter('');
            }}
          >
            <Text style={styles.clearBtnText}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Property Type:</Text>
          <View style={styles.typeFilters}>
            {[
              { label: 'All', value: '' },
              { label: 'Sale', value: 'seller' },
              { label: 'Rent', value: 'landlord' },
              { label: 'Builder', value: 'builder' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeChip,
                  typeFilter === opt.value && styles.typeChipActive
                ]}
                onPress={() => setTypeFilter(opt.value)}
              >
                <Text style={[
                  styles.typeChipText,
                  typeFilter === opt.value && styles.typeChipTextActive
                ]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Location:</Text>
          <View style={styles.locationSearchContainer}>
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              style={styles.locationSearchInput}
              placeholder="Search locations..."
              placeholderTextColor="#9CA3AF"
              value={locationSearch}
              onChangeText={setLocationSearch}
            />
            {locationSearch && (
              <TouchableOpacity onPress={() => setLocationSearch('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          
          {locationSearch && filteredLocations.length > 0 && (
            <View style={styles.locationDropdown}>
              <ScrollView style={styles.locationDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredLocations.slice(0, 6).map(loc => (
                  <TouchableOpacity
                    key={loc}
                    style={[
                      styles.locationItem,
                      locationFilter === loc && styles.locationItemActive
                    ]}
                    onPress={() => {
                      setLocationFilter(loc);
                      setLocationSearch('');
                    }}
                  >
                    <Text style={styles.locationItemText}>{loc}</Text>
                    {locationFilter === loc && (
                      <Ionicons name="checkmark" size={18} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {locationFilter && (
            <View style={styles.selectedLocationTag}>
              <Ionicons name="location" size={14} color="#3B82F6" />
              <Text style={styles.selectedLocationText}>{locationFilter}</Text>
              <TouchableOpacity onPress={() => setLocationFilter('')}>
                <Ionicons name="close-circle" size={16} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Map */}
      <View style={styles.mapContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading properties...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadMapData}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : mappableLeads.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="map-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No properties with location data</Text>
            <Text style={styles.emptySubtext}>
              {filteredLeads.length > 0 
                ? `${filteredLeads.length} properties found but missing coordinates`
                : 'Try adjusting your filters'}
            </Text>
          </View>
        ) : (
          <WebView
            source={{ html: generateMapHtml() }}
            style={styles.webview}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webviewLoading}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            )}
          />
        )}
      </View>

      {/* Selected Lead Card */}
      {selectedLead && (
        <View style={styles.selectedCard}>
          <TouchableOpacity 
            style={styles.closeCardBtn}
            onPress={() => setSelectedLead(null)}
          >
            <Ionicons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
          
          <Text style={styles.selectedName}>{selectedLead.name}</Text>
          <View style={styles.selectedInfo}>
            <View style={[styles.typeBadge, { 
              backgroundColor: selectedLead.lead_type === 'seller' ? '#DCFCE7' 
                            : selectedLead.lead_type === 'landlord' ? '#FEF3C7' 
                            : '#F3E8FF' 
            }]}>
              <Text style={[styles.typeBadgeText, {
                color: selectedLead.lead_type === 'seller' ? '#16A34A' 
                     : selectedLead.lead_type === 'landlord' ? '#D97706' 
                     : '#7C3AED'
              }]}>
                {selectedLead.lead_type === 'seller' ? 'For Sale' 
                 : selectedLead.lead_type === 'landlord' ? 'For Rent' 
                 : 'Builder'}
              </Text>
            </View>
            {selectedLead.area_size && (
              <Text style={styles.selectedDetail}>{selectedLead.area_size} sq.yds</Text>
            )}
            {(selectedLead.budget_max || selectedLead.budget_min) && (
              <Text style={styles.selectedBudget}>
                ₹{selectedLead.budget_max || selectedLead.budget_min} Cr
              </Text>
            )}
          </View>
          
          {selectedLead.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color="#6B7280" />
              <Text style={styles.selectedLocation}>{selectedLead.location}</Text>
            </View>
          )}
          
          <View style={styles.cardActions}>
            <TouchableOpacity 
              style={styles.viewBtn}
              onPress={() => {
                setSelectedLead(null);
                router.push(`/leads/${selectedLead.id}` as any);
              }}
            >
              <Ionicons name="eye" size={18} color="#FFFFFF" />
              <Text style={styles.viewBtnText}>View Details</Text>
            </TouchableOpacity>
            
            {(selectedLead.Property_locationUrl || (selectedLead.latitude && selectedLead.longitude)) && (
              <TouchableOpacity 
                style={styles.directionsBtn}
                onPress={() => openInMaps(selectedLead)}
              >
                <Ionicons name="navigate" size={18} color="#3B82F6" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerSafeArea: {
    backgroundColor: '#3B82F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statsText: {
    fontSize: 14,
    color: '#6B7280',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  filtersPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  typeFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  typeChipActive: {
    backgroundColor: '#3B82F6',
  },
  typeChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  locationSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  locationSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  locationDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 180,
  },
  locationDropdownScroll: {
    maxHeight: 180,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationItemActive: {
    backgroundColor: '#EFF6FF',
  },
  locationItemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  selectedLocationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  selectedLocationText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  mapContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  selectedCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  closeCardBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  selectedName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    paddingRight: 30,
  },
  selectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectedDetail: {
    fontSize: 14,
    color: '#374151',
  },
  selectedBudget: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  selectedLocation: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  viewBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  directionsBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
