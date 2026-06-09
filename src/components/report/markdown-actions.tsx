"use client";

import { Copy, Download } from "lucide-react";
import { useState } from "react";

export function MarkdownActions({ markdown }: { markdown: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copyMarkdown}
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
      >
        <Copy aria-hidden="true" size={16} />
        {copyState === "copied" ? "Kopyalandı" : copyState === "failed" ? "Kopyalanamadı" : "Markdown'u kopyala"}
      </button>
      <a
        href={`data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`}
        download="entysa-e-commerce-audit-report.md"
        className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-[#0c6b5e]"
      >
        <Download aria-hidden="true" size={16} />
        Markdown indir
      </a>
    </div>
  );
}
