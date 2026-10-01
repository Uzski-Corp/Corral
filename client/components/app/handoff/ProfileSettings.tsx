"use client";
/**
 * Settings → Profile. Name and email come from the mail account. A photo can be
 * uploaded when that account didn't supply one.
 */
import { useRef, useState } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { workspaceApiFor, LOGO_MAX_BYTES } from "@/lib/api";
import { Icon } from "../icons";
import { Monogram } from "../primitives";
import { useToast } from "../Toaster";

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const SAMPLE = { name: "Tomás Ibarra", email: "tomas@coldtrace.io", role: "Owner", avatarUrl: null as string | null };

/** A picture we stored lives under /avatars/. Anything else came from the mail account. */
const fromMail = (url: string | null) => !!url && !url.includes("/avatars/");

export function ProfileSettings() {
  const session = useSession();
  const toast = useToast();
  const live = session?.status === "authenticated" ? session.account : null;
  const person = live ?? SAMPLE;
  const [uploaded, setUploaded] = useState<string | null>(null);
  const avatarUrl = uploaded ?? person.avatarUrl;
  const file = useRef<HTMLInputElement>(null);
  const mail = fromMail(avatarUrl);

  async function onPhoto(picked: File) {
    if (!live || !session) { toast({ children: "This is the sample profile" }); return; }
    if (picked.size > LOGO_MAX_BYTES) { toast({ tone: "error", children: "Photos can be up to 2 MB." }); return; }
    if (picked.type && !PHOTO_TYPES.includes(picked.type)) { toast({ tone: "error", children: "Use a PNG, JPEG, GIF or WebP." }); return; }
    const r = await workspaceApiFor(session.config).uploadPicture(picked);
    if (!r.ok) { toast({ tone: "error", children: r.error.message }); return; }
    setUploaded(r.value.pictureUrl);
    await session.reload();
    toast({ tone: "success", children: "Photo updated" });
  }

  return (
    <div className="i-page">
      <div className="i-head">
        <h2>Profile</h2>
        <p>Your name and photo. The name and email come from your mail account.</p>
      </div>
      <div className="i-ws">
        <div className="i-ws__logo">
          {avatarUrl
            ? <img className="i-ws__photo" src={avatarUrl} alt="" width={48} height={48} referrerPolicy="no-referrer" /> /* eslint-disable-line @next/next/no-img-element -- photo host is the mail account or the configured R2 domain */
            : <Monogram name={person.name} email={person.email} size={48} />}
          {mail
            ? <span className="c-muted">This picture comes from your mail account.</span>
            : <button type="button" className="c-btn" onClick={() => file.current?.click()}><Icon name="upload" />{avatarUrl ? "Replace photo" : "Add a photo"}</button>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden aria-label="Profile photo file" onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) void onPhoto(picked);
          }} />
        </div>
        <dl className="i-profile">
          <div><dt>Name</dt><dd>{person.name}</dd></div>
          <div><dt>Email</dt><dd>{person.email}</dd></div>
          <div><dt>Role</dt><dd>{person.role}</dd></div>
        </dl>
      </div>
    </div>
  );
}
