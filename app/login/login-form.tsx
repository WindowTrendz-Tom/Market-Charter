"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null, email: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      {state.error && (
        <div className="error" role="alert">
          {state.error}
        </div>
      )}
    </form>
  );
}
