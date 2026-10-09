/**
 * VitalTrack Mobile - Tab Navigation Layout
 * Bottom tabs: Dashboard | Inventory | Orders
 */

import { Tabs } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import AssistantExperience from '@/components/assistant/AssistantExperience';
import { AssistantLayerProvider } from '@/components/assistant/AssistantLayer';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  const active = useIsFocused();

  return (
    <AssistantLayerProvider><Tabs
      tabBar={props => <View style={{ backgroundColor: colors.bgCard }}>
        <AssistantExperience embedded active={active} screenKey={props.state.routes[props.state.index].key} />
        <BottomTabBar {...props} />
      </View>}
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.bgCard, borderTopColor: colors.borderPrimary }],
        tabBarActiveTintColor: colors.accentBlue,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs></AssistantLayerProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 12,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 4,
  },
});
