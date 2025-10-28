// TEMP DEBUG - quítalo después
console.log('ENV present on client', {
  url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});


import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
