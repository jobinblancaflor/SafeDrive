import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

const SYSTEM_PROMPT =
  "You are the support assistant embedded in Secure Signal, a personal-safety " +
  "incident monitoring dashboard. Secure Signal lets riders trigger an SOS " +
  "(button, volume keys, USB, or fall detection), streams their live location " +
  "to admin/authority staff, and lets staff message the rider, ping their " +
  "device, or send a stop-emergency push. Answer questions about how the " +
  "product works, account/billing basics, and general safety-app support. " +
  "Keep answers short and concrete. If asked something outside Secure Signal " +
  "or that requires account-specific data you don't have, say so plainly and " +
  "suggest contacting support instead of guessing.";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat is not configured yet. Set ANTHROPIC_API_KEY to enable it." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // No auth on this route (it backs a public support-chat widget), so this
  // is the only thing standing between it and someone scripting requests
  // against the Anthropic API on this app's dime.
  const supabase = createClient();
  const allowed = await checkRateLimit(supabase, `chat:${clientIp(req)}`, {
    max: 20,
    windowSeconds: 300,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests, try again shortly" }, { status: 429 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: parsed.data.messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Anthropic API error:", res.status, detail);
      return NextResponse.json({ error: "chat request failed" }, { status: 502 });
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = json.content.find((c) => c.type === "text")?.text ?? "";
    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("POST /api/chat failed:", err);
    return NextResponse.json({ error: "chat request failed" }, { status: 502 });
  }
}
