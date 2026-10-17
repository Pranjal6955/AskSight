import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthBrand } from "@/components/AuthBrand";
import { AuthField } from "@/components/AuthField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { toFriendlyMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useKeyboardAwareScroll } from "@/lib/useKeyboardAwareScroll";

export default function SignupScreen() {
  const { register } = useAuth();
  const { scrollRef, trackFocus } = useKeyboardAwareScroll();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (redirectTimer.current !== null) clearTimeout(redirectTimer.current);
    };
  }, []);

  async function handleCreateAccount() {
    if (loading) return;
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      if (!mounted.current) return;
      setSuccess("Your account is ready. Opening AskSight…");
      // Loading stays true through the hold so the button cannot be pressed
      // again while the redirect is pending. The timer is cleared on unmount,
      // so navigating away during the hold cancels the redirect instead of
      // hijacking whatever screen the user moved to.
      redirectTimer.current = setTimeout(
        () => router.replace("/(tabs)/home"),
        600,
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        toFriendlyMessage(
          cause,
          "We couldn't create your account. Please try again.",
        ),
      );
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "android" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "flex-start",
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 20,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View className="mx-auto w-full max-w-[480px]">
            <AuthBrand />

            <View className="mb-6">
              <Text
                accessibilityRole="header"
                className="text-4xl font-bold leading-10 text-ink"
              >
                Create your account
              </Text>
              <Text className="mt-2 text-xl leading-7 text-muted">
                Join AskSight and start exploring
              </Text>
            </View>

            <View className="gap-4">
              <AuthField
                label="Full name"
                hint="e.g. John Doe"
                icon="account-outline"
                value={name}
                onChangeText={setName}
                onFocus={trackFocus}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
              <AuthField
                label="Email address"
                hint="you@example.com"
                icon="email-outline"
                inputRef={emailRef}
                value={email}
                onChangeText={setEmail}
                onFocus={trackFocus}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <AuthField
                label="Password"
                hint="Minimum 8 characters"
                icon="lock-outline"
                inputRef={passwordRef}
                value={password}
                onChangeText={setPassword}
                onFocus={trackFocus}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleCreateAccount}
              />
            </View>

            {error ? (
              <View
                className="mt-4 flex-row items-start gap-3 rounded-field border-2 border-error bg-white p-4"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={24}
                  color="#B42318"
                />
                <Text className="flex-1 text-xl font-semibold leading-7 text-error">
                  {error}
                </Text>
              </View>
            ) : null}

            {success ? (
              <View
                className="mt-4 flex-row items-start gap-3 rounded-field border-2 border-success bg-white p-4"
                accessibilityLiveRegion="polite"
              >
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={24}
                  color="#166534"
                />
                <Text className="flex-1 text-xl font-semibold leading-7 text-success">
                  {success}
                </Text>
              </View>
            ) : null}

            <View className="mt-6">
              <PrimaryButton
                label="Create account"
                onPress={handleCreateAccount}
                loading={loading}
                loadingLabel="Creating your account…"
              />
            </View>

            <View className="mt-5 items-center">
              <Text className="text-lg text-muted">
                Already have an account?
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => router.replace("/login")}
                className={`touch-target mt-4 w-full flex-row items-center justify-center rounded-field border-2 border-brand bg-canvas px-6 py-4 ${
                  loading ? "opacity-60" : ""
                }`}
              >
                <Text className="text-2xl font-bold text-brand-link">
                  Sign in
                </Text>
              </Pressable>
            </View>

            <Text className="mt-6 text-center text-lg leading-7 text-muted">
              Your account helps keep your AskSight history in one place.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
