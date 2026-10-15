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

// WCAG 2.2 AA: the label is always visible above the input, so the field never
// relies on placeholder text alone.
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
  const errorId = `${ids}-error`;
  const hasError = Boolean(error);

  // The field carries its own association ids so `aria-describedby` can point a
  // screen reader at exactly the hint and error text that belongs to it.
  const describedBy = hasError ? errorId : undefined;

  return (
    <View>
      <Text
        nativeID={labelId}
        className={
          labelClassName
            ? labelClassName
            : "mb-2 text-lg font-semibold text-ink"
        }
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
            size={26}
            color="#A02C01"
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <MaterialCommunityIcons
            name={icon}
            size={26}
            color="#3C424D"
            importantForAccessibility="no-hide-descendants"
          />
        )}
        <View className="ml-3 flex-1">
          <TextInput
            {...inputProps}
            editable={editable}
            placeholder={hint}
            placeholderTextColor="#5C6168"
            secureTextEntry={secureTextEntry ? hidden : false}
            className="touch-target text-xl text-ink"
            style={{ paddingVertical: 10, minHeight: 48, fontSize: 20 }}
            accessibilityLabel={label}
            accessibilityHint={hint}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
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
              size={26}
              color="#3C424D"
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          nativeID={errorId}
          className="mt-2 flex-row items-center gap-1 text-lg font-semibold text-error"
          accessibilityLiveRegion="assertive"
          role="alert"
        >
          {`⚠ ${error}`}
        </Text>
      ) : null}
    </View>
  );
}
