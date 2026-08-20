import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing sig" }, { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad sig";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const obj = event.data.object as Stripe.Subscription | Stripe.Checkout.Session;
      let sub: Stripe.Subscription | null = null;
      if (event.type === "checkout.session.completed") {
        const session = obj as Stripe.Checkout.Session;
        if (!session.subscription) break;
        sub = await stripe.subscriptions.retrieve(session.subscription as string);
      } else {
        sub = obj as Stripe.Subscription;
      }
      if (!sub) break;
      const userId = (sub.metadata?.supabase_user_id as string) || null;
      if (!userId) break;
      await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          subscription_id: sub.id,
          status: sub.status as never,
          start: new Date(sub.start_date * 1000).toISOString(),
          end: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
        },
        { onConflict: "subscription_id" },
      );
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("subscription_id", sub.id);
      break;
    }
    default:
      break;
  }

  await supabase.from("logs").insert({
    actor: null,
    action: `stripe.${event.type}`,
    entity: "stripe",
    entity_id: event.id,
    meta: { type: event.type } as never,
  });

  return NextResponse.json({ received: true });
}
