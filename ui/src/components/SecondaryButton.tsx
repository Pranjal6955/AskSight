import { ActivityIndicator, Pressable } from "react-native";

import { AppText } from "./AppText";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
};

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingLabel = "Please wait…",
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingLabel : label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      className={`touch-target flex-row items-center justify-center gap-2 rounded-field border-2 px-6 py-4 ${
        isDisabled
          ? "border-inputBorder bg-field"
          : "border-brand bg-canvas active:bg-card-grey"
      }`}
    >
      {loading ? <ActivityIndicator color="#000000" /> : null}
      <AppText variant="bodyLarge" className="font-bold text-brand-link">
        {loading ? loadingLabel : label}
      </AppText>
    </Pressable>
  );
}
