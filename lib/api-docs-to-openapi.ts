// Converts the repo's custom `api-docs.json` format into a valid OpenAPI 3.0
// document so it can be rendered with swagger-ui-react at /api-docs.
// See docs/superpowers/specs/2026-07-28-api-docs-swagger-design.md for the
// design this implements.

export type ApiDocsRoute = {
  path: string; // e.g. "/api/ping"
  methods: string[]; // ["POST", "PATCH"]
  auth?: string;
  description?: string;
  query?: Record<string, string>;
  schemas?: {
    postRequest?: Record<string, string>;
    patchRequest?: Record<string, string>;
    getRequest?: Record<string, string>;
    deleteRequest?: Record<string, string>;
    putRequest?: Record<string, string>;
  };
  responses?: Record<string, string>;
  sideEffects?: string[];
  [key: string]: unknown; // unrecognized keys are ignored by the converter
};

export type ApiDocs = {
  title: string;
  version: string;
  baseUrl: string;
  description?: string;
  routes: ApiDocsRoute[];
  [key: string]: unknown;
};

// Minimal OpenAPI 3.0 shape — just enough for swagger-ui-react to render.
export type OpenApi3 = {
  openapi: "3.0.3";
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
};

type OpenApiOperation = {
  summary: string;
  description?: string;
  parameters?: {
    name: string;
    in: "query";
    description?: string;
    required: boolean;
    schema: { type: "string" };
  }[];
  requestBody?: {
    content: {
      "application/json": {
        schema: {
          type: "object";
          properties: Record<string, { type: "string"; description?: string }>;
          required: string[];
        };
      };
    };
  };
  responses: Record<string, { description: string }>;
};

const SCHEMA_KEY_BY_METHOD: Record<string, keyof NonNullable<ApiDocsRoute["schemas"]>> = {
  post: "postRequest",
  patch: "patchRequest",
  get: "getRequest",
  delete: "deleteRequest",
  put: "putRequest",
};

function firstLine(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const line = text.split("\n").find((l) => l.trim().length > 0);
  return line?.trim() || fallback;
}

function buildParameters(query: ApiDocsRoute["query"]): OpenApiOperation["parameters"] {
  if (!query) return undefined;
  const entries = Object.entries(query);
  if (entries.length === 0) return undefined;
  return entries.map(([name, description]) => ({
    name,
    in: "query" as const,
    description,
    required: false,
    schema: { type: "string" as const },
  }));
}

function buildRequestBody(
  schemas: ApiDocsRoute["schemas"],
  method: string,
): OpenApiOperation["requestBody"] | undefined {
  if (!schemas) return undefined;
  const key = SCHEMA_KEY_BY_METHOD[method];
  if (!key) return undefined;
  const shape = schemas[key];
  if (!shape) return undefined;

  const properties: Record<string, { type: "string"; description?: string }> = {};
  for (const [propName, propDescription] of Object.entries(shape)) {
    properties[propName] = { type: "string", description: propDescription };
  }

  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties,
          required: [],
        },
      },
    },
  };
}

function buildResponses(responses: ApiDocsRoute["responses"]): OpenApiOperation["responses"] {
  if (!responses || Object.keys(responses).length === 0) {
    return { "200": { description: "OK" } };
  }
  const out: OpenApiOperation["responses"] = {};
  for (const [code, description] of Object.entries(responses)) {
    out[code] = { description };
  }
  return out;
}

function buildDescription(route: ApiDocsRoute): string | undefined {
  const parts: string[] = [];
  if (route.description) parts.push(route.description);
  if (route.auth) parts.push(`Auth: ${route.auth}`);
  if (route.sideEffects && route.sideEffects.length > 0) {
    parts.push(`Side effects:\n${route.sideEffects.map((s) => `- ${s}`).join("\n")}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function toOpenApi(doc: ApiDocs): OpenApi3 {
  const paths: OpenApi3["paths"] = {};

  for (const route of doc.routes ?? []) {
    if (!route?.path || !Array.isArray(route.methods)) continue;

    const operations: Record<string, OpenApiOperation> = {};
    for (const rawMethod of route.methods) {
      const method = rawMethod.toLowerCase();
      operations[method] = {
        summary: firstLine(route.description, `${rawMethod} ${route.path}`),
        description: buildDescription(route),
        parameters: buildParameters(route.query),
        requestBody: buildRequestBody(route.schemas, method),
        responses: buildResponses(route.responses),
      };
    }

    paths[route.path] = operations;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: doc.title,
      version: doc.version,
      description: doc.description,
    },
    servers: [{ url: doc.baseUrl }],
    paths,
  };
}
