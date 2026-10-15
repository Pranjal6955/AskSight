import { View } from "react-native";

// Soft mint/peach corner blobs from the mock. Plain circles instead of organic
// paths so there is no SVG dependency. Hidden from accessibility as decorative.
export function Blobs() {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden"
      importantForAccessibility="no-hide-descendants"
    >
      <View className="bg-mint absolute -left-16 -top-24 h-56 w-56 rounded-full opacity-70" />
      <View className="bg-peach absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-60" />
      <View className="bg-peach absolute -bottom-24 -left-14 h-56 w-56 rounded-full opacity-50" />
      <View className="bg-mint absolute -bottom-20 -right-16 h-52 w-52 rounded-full opacity-60" />
    </View>
  );
}
