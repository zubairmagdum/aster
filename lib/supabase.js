import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getUser = async () => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const signInWithMagicLink = async (email) => {
  if (!supabase) return { error: 'Supabase not configured' };
  return await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : 'https://astercopilot.com',
      data: { app_name: 'Aster' }
    }
  });
};

export const signOut = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};
