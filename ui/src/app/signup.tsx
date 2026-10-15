import { Link, router } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";

const MIN_PASSWORD = 8;

export default function SignupScreen() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (name.trim().length < 2) {
      setError("Please enter your full name");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
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
          contentContainerClassName="px-6 pb-8 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            className="self-start"
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color="#0A4034"
            />
          </Pressable>

          <Text className="mt-6 text-4xl font-bold text-ink">
            Create your account
          </Text>
          <Text className="mt-2 text-base text-muted">
            Join AskSight and start exploring
          </Text>

          <View className="mt-8 gap-4">
            <AuthField
              label="Full name"
              hint="e.g. John Doe"
              icon="account-outline"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
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
              hint={`Minimum ${MIN_PASSWORD} characters`}
              icon="lock"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </View>

          {error ? (
            <Text
              className="mt-4 text-sm text-accent"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}

          <View className="mt-8">
            <PrimaryButton
              label="Create account"
              loading={loading}
              onPress={onSubmit}
            />
          </View>

          <View className="mt-6 gap-6">
            <OrDivider />
            <GoogleButton />
          </View>

          <Text className="mt-8 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-link">
              Sign in
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
