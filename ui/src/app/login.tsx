import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/AuthScreen";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormField, type TextInputRef } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { colors, spacing } from "@/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInputRef>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (loading) return;

    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setLoading(true);

    try {
      await signIn({ email: email.trim(), password });
      router.replace("/(tabs)/home");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't sign you in. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      title="Sign in"
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>New here?</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Create an account"
            disabled={loading}
            onPress={() => router.push("/signup")}
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Create account</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.form}>
        <FormField
          label="Email"
          placeholder="you@example.com"
          icon="mail-outline"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          editable={!loading}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <FormField
          label="Password"
          placeholder="Enter your password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          secureTextEntry
          editable={!loading}
          inputRef={passwordRef}
          onSubmitEditing={handleSignIn}
        />

        <ErrorBanner message={error} />

        <PrimaryButton
          label="Sign in"
          loadingLabel="Signing you in…"
          loading={loading}
          onPress={handleSignIn}
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  footerText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  footerLink: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
