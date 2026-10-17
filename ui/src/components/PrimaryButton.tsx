import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ActivityIndicator, Pressable, Text } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  loadingLabel?: string;
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  loadingLabel = "Please wait…",
}: Props) {
  const isDisabled = loading || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLiveRegion={loading ? "polite" : undefined}
      disabled={isDisabled}
      onPress={onPress}
      // Disabled switches to brand-muted (white on it = 5.91:1) rather than
      // dimming the whole button, so the label never drops below AA. State is
      // carried by the accessible label too, never by colour alone.
      className={`touch-target focus-visible:outline-3 flex-row items-center justify-center gap-2 rounded-field px-6 py-4 focus-visible:outline focus-visible:outline-focus ${
        loading
          ? "bg-warning"
          : isDisabled
            ? "bg-brand-muted"
            : "bg-brand active:bg-brand-deep"
      }`}
    >
      {loading ? (
        <>
          <ActivityIndicator
            color="#000000"
            size="small"
            importantForAccessibility="no-hide-descendants"
          />
          <Text
            className="text-3xl font-bold text-ink"
            accessibilityLiveRegion="polite"
          >
            {loadingLabel}
          </Text>
        </>
      ) : (
        <>
          <Text className="text-3xl font-bold text-white">{label}</Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={26}
            color="#FFFFFF"
            importantForAccessibility="no-hide-descendants"
          />
        </>
      )}
    </Pressable>
  );
}
