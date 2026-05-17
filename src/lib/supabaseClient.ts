import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

export function getBrowserSupabaseClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  if (!url || !publishableKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, publishableKey);
  return cachedClient;
}

export function getBrowserSupabaseMode() {
  return getBrowserSupabaseClient() ? "supabase-ready" : "local-demo";
}

export async function getSupabaseAccessToken() {
  const client = getBrowserSupabaseClient();
  if (!client) {
    return null;
  }

  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function sendSupabaseMagicLink(email: string) {
  const client = getBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase is not configured for this build.");
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href
    }
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutSupabaseUser() {
  const client = getBrowserSupabaseClient();
  if (!client) {
    return;
  }

  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}
