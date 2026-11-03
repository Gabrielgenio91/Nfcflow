import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vdedvwgkvkzwbjfwlads.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZWR2d2drdmt6d2JqZndsYWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNDMxMTAsImV4cCI6MjEwNjYxOTExMH0.Ghydl-G4NqUxbQFIDCwt5Z1RQ-2tgJ4mzwEiu7ESwPo';
  return createBrowserClient(url, key);
}
