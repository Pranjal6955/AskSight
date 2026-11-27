import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AuthScreen } from "@/components/AuthScreen";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FormField, type TextInputRef } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth";
import { colors, spacing } from "@/theme";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const emailRef = useRef<TextInputRef>(null);
  const passwordRef = useRef<TextInputRef>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (loading) return;

    setError(null);

    if (name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (password.length < 8) {
      setError("Please choose a password with at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      router.replace("/(tabs)/home");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't create your account. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      title="Create account"
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Have an account?</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Sign in instead"
            disabled={loading}
            onPress={() => router.replace("/login")}
            hitSlop={8}
          >
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.form}>
        <FormField
          label="Name"
          placeholder="Ada Lovelace"
          icon="person-outline"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(null);
          }}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          editable={!loading}
          onSubmitEditing={() => emailRef.current?.focus()}
        />

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
          inputRef={emailRef}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <FormField
          label="Password"
          placeholder="At least 8 characters"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          secureTextEntry
          editable={!loading}
          inputRef={passwordRef}
          onSubmitEditing={handleSignUp}
        />

        <ErrorBanner message={error} />

        <PrimaryButton
          label="Create account"
          loadingLabel="Creating your account…"
          loading={loading}
          onPress={handleSignUp}
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
