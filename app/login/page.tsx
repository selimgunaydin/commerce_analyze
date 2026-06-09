import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Giriş | Entysa E-Commerce Audit"
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md flex-col justify-center py-10">
      <div>
        <p className="text-xs font-semibold uppercase text-muted">Entysa E-Commerce Audit</p>
        <h1 className="mt-3 text-2xl font-semibold text-ink">Panel girişi</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Audit paneline erişim tek env kullanıcısıyla sınırlandırılır. Yeni kullanıcı kaydı bulunmaz.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
