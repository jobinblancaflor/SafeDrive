import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/faq",
  "/terms",
  "/privacy",
  "/404",
  "/contact",
];

const ADMIN_PREFIX = "/admin";
const AUTHORITY_PREFIX = "/authority";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
  const isAdmin = pathname.startsWith(ADMIN_PREFIX);
  const isAuthority = pathname.startsWith(AUTHORITY_PREFIX);
  const isSellerOnboarding = pathname === "/onboarding/seller" || pathname.startsWith("/onboarding/seller/");

  // Unauthed users hitting protected routes → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Fetch role once for any authenticated request on a protected route —
  // reused by both the admin/authority gate below and the seller gate.
  let role: string | undefined;
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role as string | undefined;
  }

  // Role gates
  if (user && (isAdmin || isAuthority)) {
    if (isAdmin && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (isAuthority && role !== "admin" && role !== "authority") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Seller onboarding gate — a seller who hasn't finished onboarding can
  // only reach /onboarding/seller until they do. Page-level only: this
  // middleware's own matcher (below) never runs for /api/*.
  if (user && !isPublic && role === "seller" && !isSellerOnboarding) {
    const { data: sellerProfile } = await supabase
      .from("seller_profiles")
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sellerProfile?.onboarding_completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/seller";
      return NextResponse.redirect(url);
    }
  }

  // Authed users on auth pages → /
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - api routes
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
