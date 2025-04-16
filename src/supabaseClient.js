import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yhdatwfmoazntwkgtsok.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZGF0d2Ztb2F6bnR3a2d0c29rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MDkxMzAsImV4cCI6MjA2MDM4NTEzMH0.EzVconQWO2Uy97qEWHCW8X1xT-J6mwZeALx3jpWW1SU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey); 