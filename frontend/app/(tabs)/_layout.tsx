import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

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
          <Ionicons name={name} size={20} color="#FFFFFF" />
        </LinearGradient>
      </View>
    );
  }
  
  return (
    <View style={styles.iconContainerInactive}>
      <Ionicons name={name} size={22} color="#9CA3AF" />
    </View>
  );
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  
  // Calculate proper tab bar height based on safe area
  const tabBarHeight = Platform.OS === 'ios' ? 65 + insets.bottom : 70;
  const tabBarPaddingBottom = Platform.OS === 'ios' ? insets.bottom : 8;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1F2937',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 20,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: '#3B82F6',
        },
        headerTintColor: '#FFFFFF',
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
              gradientColors={['#3B82F6', '#1D4ED8']}
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
              gradientColors={['#10B981', '#059669']}
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
              gradientColors={['#8B5CF6', '#7C3AED']}
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
              gradientColors={['#F59E0B', '#D97706']}
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
              gradientColors={['#EF4444', '#DC2626']}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon 
              name="apps" 
              focused={focused} 
              gradientColors={['#EC4899', '#DB2777']}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pricing"
        options={{
          href: null,
        }}
      />
      {/* Hide the old leads tab */}
      <Tabs.Screen
        name="leads"
        options={{
          href: null,
        }}
      />
    </Tabs>
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
