import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, View } from "react-native";

import { describeDate } from "@/lib/a11y";

import { AppText } from "./AppText";

type Props = {
  question: string;
  answer: string;
  createdAt: string;
  onPress: () => void;
};

export function HistoryRow({ question, answer, createdAt, onPress }: Props) {
  const spokenDate = describeDate(createdAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Question: ${question}. Answer: ${answer}. Asked ${spokenDate}.`}
      onPress={onPress}
      className="min-h-24 flex-row items-center gap-3 border-b-2 border-inputBorder bg-white px-4 py-3"
    >
      <View className="flex-1">
        <AppText
          variant="bodyLarge"
          numberOfLines={2}
          className="font-bold text-ink"
        >
          {question}
        </AppText>
        <AppText variant="body" numberOfLines={2} className="mt-1 text-muted">
          {answer}
        </AppText>
        <AppText variant="supporting" className="mt-1 text-muted">
          {spokenDate}
        </AppText>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color="#404040"
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}
