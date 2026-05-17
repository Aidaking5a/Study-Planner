import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

export function getSupabaseAdminClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const secretKey = getSupabaseSecretKey();

  if (!url || !secretKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return cachedClient;
}

export function getSchoolIntelligenceProviderName() {
  return getSupabaseAdminClient() ? "supabase" : "demo-memory";
}

function getSupabaseSecretKey() {
  const explicitKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (explicitKey) {
    return explicitKey;
  }

  const secretKeysJson = process.env.SUPABASE_SECRET_KEYS;
  if (!secretKeysJson) {
    return undefined;
  }

  try {
    const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>;
    return secretKeys.default ?? Object.values(secretKeys)[0];
  } catch {
    return undefined;
  }
}
