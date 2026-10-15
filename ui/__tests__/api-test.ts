import { readError } from "../src/lib/api";

const fakeResponse = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;

test("uses the detail string returned by 401/409", async () => {
  const err = await readError(
    fakeResponse(401, { detail: "Invalid email or Password" }),
  );
  expect(err).toBe("Invalid email or Password");
});

test("joins the validation issues the backend returns as an array on 422", async () => {
  const err = await readError(
    fakeResponse(422, {
      detail: [
        {
          loc: ["body", "name"],
          msg: "String should have at least 2 characters",
        },
        { loc: ["body", "email"], msg: "value is not a valid email address" },
      ],
    }),
  );
  expect(err).toBe(
    "String should have at least 2 characters, value is not a valid email address",
  );
});

test("falls back to the status when the body is not JSON", async () => {
  const res = {
    status: 502,
    json: async () => {
      throw new Error("not json");
    },
  } as unknown as Response;
  expect(await readError(res)).toBe("Request failed (502)");
});
