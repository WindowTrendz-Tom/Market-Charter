"use server";

import { redirect } from "next/navigation";
import { signInErrorMessage } from "@/lib/auth/sign-in-error";
import { safeNextPath } from "@/lib/auth/next-path";
import { ConfigError } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
  email: string;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) return { error: "Enter your email and password.", email };

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    if (err instanceof ConfigError) return { error: "Server configuration is incomplete.", email };
    throw err;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: signInErrorMessage(error.status), email };

  redirect(next);
}
