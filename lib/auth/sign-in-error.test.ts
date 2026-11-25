import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-error";

describe("signInErrorMessage", () => {
  it("handles rate limiting", () => {
    expect(signInErrorMessage(429)).toBe("Too many login attempts. Wait a few minutes and try again.");
  });
  it("handles unreachable or server errors", () => {
    const msg = "Couldn't reach the login service. Try again shortly.";
    expect(signInErrorMessage(undefined)).toBe(msg);
    expect(signInErrorMessage(0)).toBe(msg);
    expect(signInErrorMessage(500)).toBe(msg);
    expect(signInErrorMessage(503)).toBe(msg);
  });
  it("treats other statuses as bad credentials", () => {
    expect(signInErrorMessage(400)).toBe("Email or password is incorrect.");
    expect(signInErrorMessage(401)).toBe("Email or password is incorrect.");
    expect(signInErrorMessage(499)).toBe("Email or password is incorrect.");
  });
});
