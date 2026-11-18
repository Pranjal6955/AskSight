import { Text, type TextProps, type TextStyle } from "react-native";

import { useTextScale } from "@/lib/settings";

export type TextVariant =
  | "hero"
  | "title"
  | "section"
  | "answer"
  | "bodyLarge"
  | "body"
  | "supporting"
  | "caption";

const VARIANTS = {
  hero: { fontSize: 36, lineHeight: 40, fontWeight: "700" },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  section: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  answer: { fontSize: 22, lineHeight: 30, fontWeight: "400" },
  bodyLarge: { fontSize: 20, lineHeight: 28, fontWeight: "400" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  supporting: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} satisfies Record<TextVariant, TextStyle>;

type Props = TextProps & { variant?: TextVariant };

// The app-level scale is applied through explicit font sizes because NativeWind
// classes cannot carry a runtime multiplier. OS scaling still applies on top.
export function AppText({ variant = "body", style, ...rest }: Props) {
  const scale = useTextScale();
  const token = VARIANTS[variant];

  return (
    <Text
      {...rest}
      style={[
        token,
        {
          fontSize: Math.round(token.fontSize * scale * 100) / 100,
          lineHeight: Math.round(token.lineHeight * scale * 100) / 100,
        },
        style,
      ]}
    />
  );
}
