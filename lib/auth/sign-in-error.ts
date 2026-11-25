export function signInErrorMessage(status: number | undefined): string {
  if (status === 429) return "Too many login attempts. Wait a few minutes and try again.";
  if (!status || status >= 500) return "Couldn't reach the login service. Try again shortly.";
  return "Email or password is incorrect.";
}
