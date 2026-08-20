"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import type { OpenApi3 } from "@/lib/api-docs-to-openapi";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export function SwaggerClient({ spec }: { spec: OpenApi3 }) {
  return (
    <SwaggerUI
      spec={spec}
      docExpansion="list"
      defaultModelsExpandDepth={-1}
    />
  );
}
