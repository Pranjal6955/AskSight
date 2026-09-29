import { render, screen } from "@testing-library/react-native";

import HomeScreen from "../src/app/index";

test("renders the home screen", async () => {
  await render(<HomeScreen />);

  expect(screen.getByText("Hello NativeWind")).toBeOnTheScreen();
});
