import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthBrand } from "@/components/AuthBrand";
import { AuthField } from "@/components/AuthField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
      router.replace("/(tabs)/home");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-[480px]">
          <AuthBrand />

          <View className="mb-7">
            <Text
              accessibilityRole="header"
              className="text-4xl font-bold leading-10 text-ink"
            >
              Welcome back
            </Text>
            <Text className="mt-2 text-xl leading-7 text-muted">
              Sign in to continue
            </Text>
          </View>

          <View className="gap-5">
            <AuthField
              label="Email address"
              hint="you@example.com"
              icon="email-outline"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <AuthField
              label="Password"
              hint="Enter your password"
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
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

          <View className="mt-6">
            <PrimaryButton
              label="Sign in"
              onPress={handleSignIn}
              loading={loading}
            />
          </View>

          <View className="mt-5 items-center">
            <Text className="text-lg text-muted">New to AskSight?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/signup")}
              className="touch-target mt-4 w-full flex-row items-center justify-center rounded-field border-2 border-brand bg-canvas px-6 py-4"
            >
              <Text className="text-2xl font-bold text-brand-link">
                Create account
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
