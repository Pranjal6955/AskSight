import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ActivityIndicator, Pressable, Text } from "react-native";

export function PrimaryButton({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const disabled = loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center justify-center gap-2 rounded-field bg-brand py-4 active:bg-brand-deep disabled:opacity-60"
    >
      {loading ? (
        <ActivityIndicator color="#FDFBF4" />
      ) : (
        <>
          <Text className="text-base font-bold text-canvas">{label}</Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={20}
            color="#FDFBF4"
          />
        </>
      )}
    </Pressable>
  );
}
