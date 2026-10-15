import { Text, View } from "react-native";

// The mark in the mock is a solid eye plus three soundwave arcs. Drawn with
// plain Views so it scales cleanly and needs no SVG dependency.
function Mark({ size }: { size: number }) {
  const bar = Math.max(2, Math.round(size * 0.1));

  return (
    <View className="flex-row items-center">
      <View
        className="items-center justify-center rounded-full bg-brand"
        style={{ width: size, height: size }}
      >
        <View
          className="rounded-full bg-canvas"
          style={{
            width: size * 0.34,
            height: size * 0.34,
          }}
        />
      </View>
      <View className="items-center justify-center" style={{ width: size }}>
        {[0.34, 0.66, 1].map((scale, i) => (
          <View
            key={i}
            className="mb-[2px] rounded-full bg-brand"
            style={{ width: bar, height: Math.round(size * scale * 0.32) }}
          />
        ))}
      </View>
    </View>
  );
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <View className="flex-row items-center gap-2">
        <Mark size={22} />
        <Text className="text-lg font-bold text-ink">AskSight</Text>
      </View>
    );
  }

  return (
    <View className="items-center">
      <Mark size={64} />
      <Text className="mt-4 text-4xl font-bold text-brand">AskSight</Text>
    </View>
  );
}
