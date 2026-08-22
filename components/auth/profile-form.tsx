"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProfileForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { fullname: string; phone: string; profile_img: string | null };
}) {
  const router = useRouter();
  const [fullname, setFullname] = useState(initial.fullname);
  const [phone, setPhone] = useState(initial.phone);
  const [profileImg, setProfileImg] = useState(initial.profile_img);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ fullname, phone })
      .eq("id", userId);
    setLoading(false);
    if (error) setStatus(error.message);
    else {
      setStatus("Saved.");
      router.refresh();
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/profile_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("profile_images")
      .upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploading(false);
      setUploadError(uploadErr.message);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("profile_images").getPublicUrl(path);
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ profile_img: publicUrl.publicUrl })
      .eq("id", userId);
    setUploading(false);
    if (updateErr) {
      setUploadError(updateErr.message);
      return;
    }
    setProfileImg(publicUrl.publicUrl);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar src={profileImg} alt={fullname || "Profile photo"} size={64} />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickPhoto}
          />
          {uploadError && <p className="mt-1 text-xs text-status-critical">{uploadError}</p>}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="fullname">Full name</Label>
          <Input id="fullname" required value={fullname} onChange={(e) => setFullname(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {status && <p className="text-sm text-slate-600">{status}</p>}
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
      </form>
    </div>
  );
}
