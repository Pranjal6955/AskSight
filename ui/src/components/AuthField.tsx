import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ComponentProps } from "react";
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

// The mock draws the empty state: the label sits in ink inside the box and the
// hint sits under it in grey. Once there is a value only the input remains.
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
  const empty = !inputProps.value;

  return (
    <View>
      <View className="flex-row items-center rounded-field bg-field px-4 py-3">
        <MaterialCommunityIcons name={icon} size={22} color="#3C424D" />
        <View className="ml-3 flex-1">
          <TextInput
            {...inputProps}
            editable={editable}
            placeholder={label}
            placeholderTextColor="#000000"
            secureTextEntry={secureTextEntry ? hidden : false}
            className="text-base font-semibold text-ink"
            style={{ paddingVertical: 0 }}
          />
          {hint && empty ? (
            <Text className="text-sm text-hint">{hint}</Text>
          ) : null}
        </View>
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            onPress={() => setHidden((v) => !v)}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={hidden ? "eye" : "eye-off"}
              size={22}
              color="#3C424D"
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          className="mt-1 text-xs text-accent"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
