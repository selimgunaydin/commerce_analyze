"use client";

import { Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartAuditButton({ auditId, isRunning = false }: { auditId: string; isRunning?: boolean }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (isRunning) {
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch(`/api/audits/${auditId}/start`, {
        method: "POST"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Audit başlatılamadı.");
      }

      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Audit başlatılamadı.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleStart}
        disabled={isStarting || isRunning}
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Play aria-hidden="true" size={16} />
        {isRunning ? "Çalışıyor" : isStarting ? "Başlatılıyor" : "Başlat"}
      </button>
      {error ? <p className="max-w-64 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export function CancelAuditButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [isCanceling, setIsCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setIsCanceling(true);
    setError(null);

    try {
      const response = await fetch(`/api/audits/${auditId}/cancel`, {
        method: "POST"
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Audit iptal edilemedi.");
      }

      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Audit iptal edilemedi.");
    } finally {
      setIsCanceling(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isCanceling}
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Square aria-hidden="true" size={16} />
        {isCanceling ? "İptal ediliyor" : "İptal et"}
      </button>
      {error ? <p className="max-w-64 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
