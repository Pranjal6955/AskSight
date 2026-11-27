import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useState,
  type ComponentProps,
  type ComponentRef,
  type Ref,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, radius, spacing } from "@/theme";

export type TextInputRef = ComponentRef<typeof TextInput>;

type Props = Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "keyboardType"
  | "autoCapitalize"
  | "autoComplete"
  | "textContentType"
  | "onSubmitEditing"
  | "returnKeyType"
  | "editable"
> & {
  label: string;
  placeholder: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  secureTextEntry?: boolean;
  inputRef?: Ref<TextInputRef>;
};

export function FormField({
  label,
  placeholder,
  icon,
  secureTextEntry = false,
  editable = true,
  inputRef,
  ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !editable && styles.fieldDisabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={focused ? colors.primary : colors.muted}
        />

        <TextInput
          {...inputProps}
          ref={inputRef}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry && hidden}
          selectionColor={colors.primary}
          style={styles.input}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            hitSlop={10}
            onPress={() => setHidden((value) => !value)}
            style={styles.eye}
          >
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={21}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  label: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    textAlign: "left",
  },
  field: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
    paddingHorizontal: spacing.lg - 0.5,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: 17,
    paddingVertical: 14,
    outlineStyle: "solid",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  eye: {
    padding: spacing.xs,
  },
});
