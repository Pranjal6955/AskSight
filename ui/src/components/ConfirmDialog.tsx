import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Modal, Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { SecondaryButton } from "./SecondaryButton";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View
          accessibilityViewIsModal
          className="w-full max-w-[440px] rounded-card bg-white p-6"
        >
          <View className="flex-row items-center gap-3">
            {destructive ? (
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={28}
                color="#B42318"
                importantForAccessibility="no-hide-descendants"
              />
            ) : null}
            <AppText
              variant="title"
              accessibilityRole="header"
              className="flex-1 text-ink"
            >
              {title}
            </AppText>
          </View>

          <AppText variant="bodyLarge" className="mt-3 text-muted">
            {message}
          </AppText>

          <View className="mt-6 gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              className={`touch-target items-center justify-center rounded-field px-6 py-4 ${
                destructive ? "bg-error" : "bg-brand"
              }`}
            >
              <AppText variant="bodyLarge" className="font-bold text-white">
                {confirmLabel}
              </AppText>
            </Pressable>
            <SecondaryButton label={cancelLabel} onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
