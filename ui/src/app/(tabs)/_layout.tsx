import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { PlatformPressable } from "expo-router/build/react-navigation/elements/PlatformPressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.accentSoft,
        tabBarInactiveBackgroundColor: "transparent",
        tabBarHideOnKeyboard: true,
        tabBarButton: ({ ref: _ref, style, ...buttonProps }) => (
          <PlatformPressable
            {...buttonProps}
            style={[
              style,
              {
                flex: 1,
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
              },
            ]}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 16,
          lineHeight: 20,
          fontWeight: "800",
          marginBottom: 2,
        },
        tabBarIconStyle: {
          alignSelf: "center",
          marginHorizontal: 0,
          transform: [{ translateY: 4 }],
        },
        tabBarItemStyle: {
          marginHorizontal: 4,
          marginVertical: 4,
          borderRadius: 22,
        },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 10),
          height: 84,
          paddingTop: 2,
          paddingHorizontal: 6,
          borderTopWidth: 0,
          borderRadius: 28,
          backgroundColor: colors.surface,
          shadowColor: colors.ink,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.14,
          shadowRadius: 14,
          elevation: 12,
        },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={focused ? 28 : 25}
              color={focused ? colors.primary : colors.muted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarAccessibilityLabel: "History",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? "time" : "time-outline"}
              size={focused ? 28 : 25}
              color={focused ? colors.primary : colors.muted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarAccessibilityLabel: "Account",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={focused ? 28 : 25}
              color={focused ? colors.primary : colors.muted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
