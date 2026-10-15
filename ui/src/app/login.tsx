import { Link, router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuthField } from "@/components/AuthField";
import { Blobs } from "@/components/Blobs";
import { BrandLogo } from "@/components/BrandLogo";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      await signIn({ email: email.trim(), password });
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <Blobs />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pb-8 pt-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center">
            <BrandLogo />
            <Text className="mt-2 text-base text-muted">
              See the world through AI
            </Text>
          </View>

          <View className="mt-10" accessibilityLiveRegion="polite">
            <Text className="text-4xl font-bold text-ink" accessibilityRole="header">
              Welcome back
            </Text>
            <Text className="mt-1 text-base text-muted">Sign in to continue</Text>
          </View>

          <View className="mt-8 gap-4">
            <AuthField
              label="Email address"
              hint="e.g. yourname@example.com"
              icon="mail"
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
              icon="lock"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </View>

          <Pressable
            className="mt-3 self-end"
            onPress={() => {} /* TODO: implement password reset */}
            accessibilityRole="link"
            accessibilityLabel="Forgot password? Opens password reset"
          >
            <Text className="text-sm font-semibold text-brand-link underline">
              Forgot password?
            </Text>
          </Pressable>

          {error ? (
            <Text className="mt-4 text-sm text-error" accessibilityLiveRegion="assertive" role="alert">
              {error}
            </Text>
          ) : null}

          <View className="mt-6">
            <PrimaryButton label="Sign in" loading={loading} onPress={onSubmit} />
          </View>

          <View className="mt-6 gap-6">
            <OrDivider />
            <GoogleButton />
          </View>

          <Text className="mt-8 text-center text-sm text-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-brand-link underline" accessibilityLabel="Create a new account">
              Sign up
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}