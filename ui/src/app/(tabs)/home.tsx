import { useState } from "react";
import { Text, View, SafeAreaView } from "react-native";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <Text className="text-4xl font-bold text-ink">Home</Text>
    </SafeAreaView>
  );
}