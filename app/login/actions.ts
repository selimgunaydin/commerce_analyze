"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/audits"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Giriş bilgileri hatalı veya env kullanıcı bilgileri tanımlı değil."
      };
    }

    throw error;
  }

  return {};
}
