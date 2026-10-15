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
  labelClassName?: string;
};

// WCAG 2.2 AA: the label is a real, always-visible <Text> above the input and
// the hint is separate from the placeholder, so neither is the only thing a
// user can rely on.
export function AuthField({
  label,
  hint,
  icon,
  secureTextEntry,
  error,
  editable = true,
  labelClassName,
  ...inputProps
}: FieldProps) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const ids = useId();
  const labelId = `${ids}-label`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const hasError = Boolean(error);

  // The field carries its own association ids so `aria-describedby` can point a
  // screen reader at exactly the hint and error text that belongs to it.
  const describedBy = [hint ? hintId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <View>
      <Text
        nativeID={labelId}
        className={labelClassName ? labelClassName : "mb-1 text-base font-semibold text-ink"}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>

      {/* White field on a warm canvas, with a border dark enough (7.56:1) to
          read as a boundary at 3:1. The border thickens on error so the state
          is never colour-only — it also gains a width and an icon. */}
      <View
        className={`touch-target flex-row items-center rounded-field border-2 bg-input px-4 py-3 ${
          hasError ? "border-error" : "border-inputBorder"
        }`}
      >
        {hasError ? (
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={22}
            color="#A02C01"
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color="#3C424D"
            importantForAccessibility="no-hide-descendants"
          />
        )}
        <View className="ml-3 flex-1">
          <TextInput
            {...inputProps}
            editable={editable}
            // The placeholder is a format example only and stays 6.24:1 — the
            // label above is the real label, so an empty field never relies on it.
            placeholder={hint}
            placeholderTextColor="#5C6168"
            secureTextEntry={secureTextEntry ? hidden : false}
            className="touch-target text-lg text-ink"
            style={{ paddingVertical: 8, minHeight: 44, fontSize: 18 }}
            accessibilityLabel={label}
            accessibilityHint={hint}
            aria-labelledby={labelId}
            aria-describedby={describedBy || undefined}
            aria-invalid={hasError}
            importantForAccessibility="yes"
          />
        </View>
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            accessibilityState={{ selected: !hidden, disabled: !editable }}
            disabled={!editable}
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            className="touch-target items-center justify-center"
          >
            <MaterialCommunityIcons
              name={hidden ? "eye" : "eye-off"}
              size={24}
              color="#3C424D"
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}
      </View>

      {hint ? (
        <Text
          nativeID={hintId}
          className="mt-1 text-base text-hint"
          accessibilityLiveRegion="polite"
        >
          {hint}
        </Text>
      ) : null}

      {error ? (
        <Text
          nativeID={errorId}
          className="mt-1 flex-row items-center gap-1 text-base font-semibold text-error"
          accessibilityLiveRegion="assertive"
          role="alert"
        >
          {`⚠ ${error}`}
        </Text>
      ) : null}
    </View>
  );
}
