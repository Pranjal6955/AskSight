import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, usePathname } from "expo-router";
import type { ComponentProps } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardShadow, colors, radius } from "@/theme";

type TabButtonProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  focused: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  testID?: string;
};

function TabButton({
  icon,
  label,
  focused,
  onPress,
  accessibilityLabel,
  testID,
}: TabButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: focused }}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        focused && styles.tabButtonActive,
        pressed && !focused && styles.tabButtonPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={focused ? colors.white : colors.muted}
      />
      <Text
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const barWidth = Math.min(width - 32, 520);

  function isActive(route: string) {
    return pathname === route || pathname.startsWith(`${route}/`);
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.canvas },
        tabBarStyle: [
          styles.tabBar,
          {
            width: barWidth,
            left: (width - barWidth) / 2,
            bottom: Math.max(insets.bottom, 12),
          },
        ],
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home",
          tabBarButton: (props) => (
            <TabButton
              {...props}
              icon="home-outline"
              label="Home"
              focused={isActive("/home")}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarAccessibilityLabel: "History",
          tabBarButton: (props) => (
            <TabButton
              {...props}
              icon="time-outline"
              label="History"
              focused={isActive("/history")}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarAccessibilityLabel: "Account",
          tabBarButton: (props) => (
            <TabButton
              {...props}
              icon="person-outline"
              label="Account"
              focused={isActive("/account")}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    height: 72,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  tabItem: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.pill,
    marginVertical: 2,
    marginHorizontal: 2,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: colors.white,
  },
});
