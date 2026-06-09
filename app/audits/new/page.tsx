"use client";

import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useState } from "react";

const depths = [
  {
    value: "QUICK",
    label: "Quick"
  },
  {
    value: "STANDARD",
    label: "Standard"
  },
  {
    value: "DEEP",
    label: "Deep"
  }
];

export default function NewAuditPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      url: String(formData.get("url") ?? ""),
      brandName: String(formData.get("brandName") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      country: String(formData.get("country") ?? ""),
      competitorUrls: String(formData.get("competitorUrls") ?? ""),
      depth: String(formData.get("depth") ?? "STANDARD")
    };

    try {
      const createResponse = await fetch("/api/audits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const createBody = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(createBody.error ?? "Audit could not be created.");
      }

      const startResponse = await fetch(`/api/audits/${createBody.id}/start`, {
        method: "POST"
      });

      if (!startResponse.ok) {
        const startBody = await startResponse.json();
        throw new Error(startBody.error ?? "Audit was created but could not be started.");
      }

      router.push(`/audits/${createBody.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border-b border-line pb-5">
        <Link href="/audits" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft aria-hidden="true" size={16} />
          Audits
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-ink">New audit</h1>
        <p className="mt-1 text-sm text-muted">Create an audit project and enqueue the dummy foundation worker.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Website URL" htmlFor="url" required>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com"
            className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Brand" htmlFor="brandName">
            <input
              id="brandName"
              name="brandName"
              type="text"
              className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <input
              id="industry"
              name="industry"
              type="text"
              className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            />
          </Field>
          <Field label="Country" htmlFor="country">
            <input
              id="country"
              name="country"
              type="text"
              className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink"
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Audit depth</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {depths.map((depth) => (
              <label
                key={depth.value}
                className="focus-within:ring-2 focus-within:ring-accent rounded-md border border-line bg-white px-3 py-3 text-sm font-medium text-ink"
              >
                <input
                  type="radio"
                  name="depth"
                  value={depth.value}
                  defaultChecked={depth.value === "STANDARD"}
                  className="mr-2 accent-[#0f7b6c]"
                />
                {depth.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Competitor URLs" htmlFor="competitorUrls">
          <textarea
            id="competitorUrls"
            name="competitorUrls"
            rows={5}
            placeholder={"https://competitor-one.com\nBrand Two - https://competitor-two.com"}
            className="focus-ring w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
          />
          <span className="block text-xs text-muted">Optional. One competitor per line, max 3.</span>
        </Field>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-[#0c6b5e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play aria-hidden="true" size={16} />
            {isSubmitting ? "Starting" : "Start audit"}
          </button>
          <Link
            href="/audits"
            className="focus-ring inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-panel"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  children,
  htmlFor,
  label,
  required = false
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-2">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
