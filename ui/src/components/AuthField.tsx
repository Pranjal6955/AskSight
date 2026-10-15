import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ComponentProps, useId } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

type FieldProps = Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "keyboardType"
  | "autoCapitalize"
  | "autoComplete"
  | "textContentType"
  | "onSubmitEditing"
  | "editable"
  | "returnKeyType"
> & {
  label: string;
  hint?: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  secureTextEntry?: boolean;
  error?: string | null;
};

export function AuthField({
  label,
  hint,
  icon,
  secureTextEntry,
  error,
  editable = true,
  ...inputProps
}: FieldProps) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const hintId = useId();
  const errorId = useId();
  const hasError = Boolean(error);

  return (
    <View>
      {/* Visible label - required for accessibility */}
      <Text className="text-sm font-semibold text-ink mb-1" accessibilityLiveRegion="polite">
        {label}
      </Text>

      <View className="flex-row items-center rounded-field bg-field px-4 py-3 touch-target">
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color="#5C6168"
          importantForAccessibility="no-hide-descendants"
        />
        <View className="ml-3 flex-1">
          <TextInput
            {...inputProps}
            editable={editable}
            placeholder={hint}
            placeholderTextColor="#9CA3AF"
            secureTextEntry={secureTextEntry ? hidden : false}
            className="text-base font-semibold text-ink touch-target"
            style={{ paddingVertical: 8, minHeight: 44 }}
            accessibilityLabel={label}
            accessibilityHint={hint}
            aria-invalid={hasError}
            autoComplete={inputProps.autoComplete}
            textContentType={inputProps.textContentType}
          />
        </View>
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            accessibilityState={{ selected: !hidden }}
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            className="touch-target items-center justify-center"
          >
            <MaterialCommunityIcons
              name={hidden ? "eye" : "eye-off"}
              size={22}
              color="#5C6168"
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}
      </View>

      {/* Hint text - always visible below the field */}
      {hint && (
        <Text id={hintId} className="mt-1 text-sm text-hint" accessibilityLiveRegion="polite">
          {hint}
        </Text>
      )}

      {/* Error message - announced to screen readers */}
      {error ? (
        <Text id={errorId} className="mt-1 text-sm text-error" accessibilityLiveRegion="assertive" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}