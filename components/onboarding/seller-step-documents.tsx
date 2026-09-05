"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { SellerDocument } from "@/lib/supabase/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type DocumentType = "business_permit" | "government_id";

const DOCUMENT_LABELS: Record<DocumentType, { label: string; description: string }> = {
  business_permit: {
    label: "Business permit or license",
    description: "A photo or scan of your business registration/permit",
  },
  government_id: {
    label: "Government-issued ID",
    description: "A valid ID for the person running this business",
  },
};

export function SellerStepDocuments({
  userId,
  initialDocuments,
  onBack,
  onNext,
}: {
  userId: string;
  initialDocuments: SellerDocument[];
  onBack: () => void;
  onNext: () => void;
}) {
  const [uploaded, setUploaded] = useState<Record<DocumentType, boolean>>({
    business_permit: initialDocuments.some((d) => d.document_type === "business_permit"),
    government_id: initialDocuments.some((d) => d.document_type === "government_id"),
  });
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPickFile(documentType: DocumentType, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Use a JPEG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File must be under 10MB.");
      return;
    }

    setUploading(documentType);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "bin";
    const path = `${userId}/${documentType}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("seller_documents")
      .upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploading(null);
      setError(uploadErr.message);
      return;
    }

    const { error: rowErr } = await supabase.from("seller_documents").upsert(
      {
        seller_user_id: userId,
        document_type: documentType,
        storage_path: path,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "seller_user_id,document_type" },
    );
    setUploading(null);
    if (rowErr) {
      setError(rowErr.message);
      return;
    }
    setUploaded((prev) => ({ ...prev, [documentType]: true }));
  }

  const canContinue = uploaded.business_permit && uploaded.government_id;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>Business documents</Label>
        <p className="text-sm text-slate-500">Both documents are required before you can start receiving requests.</p>
      </div>

      <div className="space-y-3">
        {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((type) => {
          const meta = DOCUMENT_LABELS[type];
          const isUploaded = uploaded[type];
          const isUploading = uploading === type;
          return (
            <div key={type} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                  <p className="text-xs text-slate-500">{meta.description}</p>
                </div>
              </div>
              <div className="shrink-0">
                {isUploaded ? (
                  <span className="flex items-center gap-1.5 text-sm text-status-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Uploaded
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {isUploading ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(",")}
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => onPickFile(type, e)}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-status-critical">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" disabled={!canContinue} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
