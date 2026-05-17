import React, { useState, createContext, useContext } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  Platform, 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Text,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii, shadows } from '../../constants/theme';

// Create context for More menu
const MoreMenuContext = createContext<{
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
}>({
  showMenu: false,
  setShowMenu: () => {},
});

export const useMoreMenu = () => useContext(MoreMenuContext);

// Custom Tab Icon Component with gradient background
const TabIcon = ({ 
  name, 
  focused, 
  gradientColors 
}: { 
  name: keyof typeof Ionicons.glyphMap; 
  focused: boolean;
  gradientColors: [string, string];
}) => {
  if (focused) {
    return (
      <View style={styles.iconContainer}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          <Ionicons name={name} size={20} color={colors.white} />
        </LinearGradient>
      </View>
    );
  }
  
  return (
    <View style={styles.iconContainerInactive}>
      <Ionicons name={name} size={22} color={colors.inkSubtle} />
    </View>
  );
};

// More Menu Item
interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgColor: string;
  onPress: () => void;
}

const MenuItem = ({ icon, label, color, bgColor, onPress }: MenuItemProps) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIconContainer, { backgroundColor: bgColor }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

// More Menu Popup Component
const MoreMenuPopup = ({ visible, onClose, bottomInset }: { visible: boolean; onClose: () => void; bottomInset: number }) => {
  const handleMenuItemPress = (tab: string) => {
    onClose();
    router.push(`/more?tab=${tab}&fromPopup=true` as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.menuContainer, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.menuHandle} />
          <Text style={styles.menuTitle}>More Features</Text>
          
          {/* Row 1 */}
          <View style={styles.menuRow}>
            <MenuItem 
              icon="location"
              label="Site Visits"
              color={colors.primary}
              bgColor={colors.primarySoft}
              onPress={() => handleMenuItemPress('visits')}
            />
            <MenuItem 
              icon="time"
              label="Activity"
              color={colors.amber}
              bgColor={colors.amberSoft}
              onPress={() => handleMenuItemPress('activity')}
            />
          </View>
          
          {/* Row 2 */}
          <View style={styles.menuRow}>
            <MenuItem 
              icon="people"
              label="Team"
              color={colors.purple}
              bgColor={colors.purpleSoft}
              onPress={() => handleMenuItemPress('team')}
            />
            <MenuItem 
              icon="download"
              label="Export"
              color={colors.danger}
              bgColor={colors.dangerSoft}
              onPress={() => handleMenuItemPress('export')}
            />
            <MenuItem 
              icon="settings"
              label="Settings"
              color={colors.inkMuted}
              bgColor={colors.surfaceMuted}
              onPress={() => handleMenuItemPress('settings')}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const tabBarHeight = Platform.OS === 'ios' ? 65 + insets.bottom : 70;
  const tabBarPaddingBottom = Platform.OS === 'ios' ? insets.bottom : 8;

  return (
    <MoreMenuContext.Provider value={{ showMenu: showMoreMenu, setShowMenu: setShowMoreMenu }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.inkSubtle,
          tabBarStyle: {
            backgroundColor: colors.surfaceRaised,
            borderTopWidth: 0,
            height: tabBarHeight,
            paddingBottom: tabBarPaddingBottom,
            paddingTop: 10,
            shadowColor: '#1F2933',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 20,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 4,
          },
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon 
                name="grid" 
                focused={focused} 
                gradientColors={gradients.primary}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="clients"
          options={{
            title: 'Clients',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon 
                name="people" 
                focused={focused} 
                gradientColors={['#2F855A', '#246B47']}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon 
                name="home" 
                focused={focused} 
                gradientColors={['#6D5BD0', '#5040A8']}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="builders"
          options={{
            title: 'Builders',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon 
                name="business" 
                focused={focused} 
                gradientColors={['#B7791F', '#8A5A15']}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="reminders"
          options={{
            title: 'Reminders',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon 
                name="notifications" 
                focused={focused} 
                gradientColors={['#C2413D', '#9F312D']}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShowMoreMenu(true);
            },
          }}
          options={{
            title: 'More',
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <View style={styles.iconContainerInactive}>
                <Ionicons name="apps" size={22} color={colors.inkSubtle} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="pricing"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="leads"
          options={{ href: null }}
        />
      </Tabs>
      
      <MoreMenuPopup 
        visible={showMoreMenu} 
        onClose={() => setShowMoreMenu(false)}
        bottomInset={insets.bottom}
      />
    </MoreMenuContext.Provider>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerInactive: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  gradientBackground: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    paddingTop: 12,
    ...shadows.card,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 20,
    textAlign: 'center',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  menuItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  menuLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
});
