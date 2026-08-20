import type { Metadata } from "next";
import apiDocs from "../../api-docs.json";
import { toOpenApi, type ApiDocs } from "@/lib/api-docs-to-openapi";
import { SwaggerClient } from "./SwaggerClient";

const doc = apiDocs as unknown as ApiDocs;
const spec = toOpenApi(doc);

export const metadata: Metadata = {
  title: doc.title,
};

// Public API reference — no auth/middleware checks, visible in production.
// See docs/superpowers/specs/2026-07-28-api-docs-swagger-design.md.
export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <SwaggerClient spec={spec} />
    </div>
  );
}
