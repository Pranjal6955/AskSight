import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#404040",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#D4D4D4",
          height: 80,
        },
        tabBarItemStyle: {
          minWidth: 72,
          minHeight: 56,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 15,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home, ask a question",
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "home" : "home-outline"}
              color={color}
              size={size}
              accessibilityHidden={true}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarAccessibilityLabel: "History, view past questions",
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "history" : "history"}
              color={color}
              size={size}
              accessibilityHidden={true}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings, manage your account",
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "cog" : "cog-outline"}
              color={color}
              size={size}
              accessibilityHidden={true}
            />
          ),
        }}
      />
    </Tabs>
  );
}
