import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const serverPrefix = apiKey?.split("-").pop();

  if (!apiKey || !audienceId || !serverPrefix) {
    console.error("newsletter: Mailchimp env vars missing");
    return NextResponse.json({ error: "Newsletter signup is not configured." }, { status: 503 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const subscriberHash = createHash("md5").update(email).digest("hex");

  const res = await fetch(
    `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      },
      // status_if_new only sets status for brand-new members; it never
      // silently re-subscribes someone who previously unsubscribed.
      body: JSON.stringify({ email_address: email, status_if_new: "subscribed" }),
    },
  );

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    console.error("newsletter: Mailchimp error", res.status, detail);
    return NextResponse.json({ error: "Could not subscribe right now. Try again later." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
