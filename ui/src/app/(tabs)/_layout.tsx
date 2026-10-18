import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "#252525",
        tabBarLabelPosition: "beside-icon",
        tabBarStyle: {
          position: "absolute",
          left: 36,
          right: 36,
          bottom: 16,
          height: 64,
          paddingHorizontal: 6,
          paddingTop: 5,
          paddingBottom: 5,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "#F0EAE0",
          borderRadius: 36,
          backgroundColor: "#FFFEFC",
          shadowColor: "#3B3328",
          shadowOffset: { width: 0, height: 7 },
          shadowOpacity: 0.12,
          shadowRadius: 18,
          elevation: 8,
        },
        tabBarItemStyle: {
          minWidth: 88,
          minHeight: 52,
          borderRadius: 28,
          overflow: "hidden",
          marginHorizontal: 2,
        },
        tabBarLabelStyle: {
          fontSize: 16,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarActiveBackgroundColor: "#080808",
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
          tabBarActiveBackgroundColor: "#080808",
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
          tabBarActiveBackgroundColor: "#080808",
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
