// Test-only stub for the `astro:env/server` virtual module, which Astro provides at build/runtime
// but vitest cannot resolve. Secrets read here are `optional: true`, so absence (undefined) is a
// valid state the app already handles — and the pure helpers under test never read these values.
export const SUPABASE_URL: string | undefined = undefined;
export const SUPABASE_KEY: string | undefined = undefined;
export const ANTHROPIC_API_KEY: string | undefined = undefined;
