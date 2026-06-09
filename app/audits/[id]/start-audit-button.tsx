"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartAuditButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);

    try {
      await fetch(`/api/audits/${auditId}/start`, {
        method: "POST"
      });
      router.refresh();
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isStarting}
      className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Play aria-hidden="true" size={16} />
      {isStarting ? "Starting" : "Start"}
    </button>
  );
}
