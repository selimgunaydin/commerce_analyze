import { LogOut } from "lucide-react";
import { signOut } from "@/auth";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({
          redirectTo: "/"
        });
      }}
    >
      <button type="submit" className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel">
        <LogOut aria-hidden="true" size={16} />
        Çıkış
      </button>
    </form>
  );
}
