import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(5 * 1024 * 1024),
  PROCESSING_DELAY_MS: z.coerce.number().int().min(0).default(700),
  SEED_DEMO_DATA: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  /** When true, run full demo seed even if the library already has all fixtures. */
  SEED_FORCE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function tryLoadEnvFile(): void {
  // Best-effort load of a .env file (repo root or cwd) using Node's built-in
  // loader. Zero dependency; silently ignored when no file is present.
  const loader = (process as NodeJS.Process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;
  if (typeof loader !== "function") return;
  for (const candidate of [".env", "../../.env"]) {
    try {
      loader(candidate);
      return;
    } catch {
      // try next candidate
    }
  }
}

export function loadEnv(): Env {
  if (cached) return cached;
  tryLoadEnvFile();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
