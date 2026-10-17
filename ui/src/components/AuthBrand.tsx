import { Image, View } from "react-native";

export function AuthBrand() {
  return (
    <View className="mb-5 items-center">
      <Image
        source={require("../../assets/images/asksight-logo.png")}
        resizeMode="contain"
        accessibilityLabel="AskSight eye and sparkle logo"
        className="h-[128px] w-[192px]"
      />
    </View>
  );
}
