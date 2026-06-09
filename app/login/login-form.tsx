"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-ink">
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="focus-ring mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
        />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Şifre
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="focus-ring mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
        />
      </div>
      {state.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-[#0c6b5e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogIn aria-hidden="true" size={17} />
        {pending ? "Giriş yapılıyor" : "Giriş yap"}
      </button>
    </form>
  );
}
