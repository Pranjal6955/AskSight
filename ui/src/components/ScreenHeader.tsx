import { View } from "react-native";

import { AppText } from "./AppText";

type Props = {
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ title, subtitle }: Props) {
  return (
    <View className="mb-7">
      <AppText variant="hero" accessibilityRole="header" className="text-ink">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="bodyLarge" className="mt-2 text-muted">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}
