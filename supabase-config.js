// ========== Настройки Supabase ==========
// Подставьте URL и anon key из: Project Settings → API
const SUPABASE_URL = 'https://oavvxyncmtahgubvfsln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hdnZ4eW5jbXRhaGd1YnZmc2xuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTU4NzEsImV4cCI6MjA5OTc5MTg3MX0.J495zuM8lKa9QO-x3-7tWUK6F4tv0wdH2gcDmA6Tw6s';

// true = использовать Supabase; false = только localStorage (запасной режим)
const USE_SUPABASE = true;

let supabaseClient = null;

function initSupabase() {
    if (!USE_SUPABASE) return null;
    if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.warn('Supabase JS не загружен');
        return null;
    }
    if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT') ||
        !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR_ANON')) {
        console.warn('Укажите SUPABASE_URL и SUPABASE_ANON_KEY в supabase-config.js');
        return null;
    }
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseClient;
    } catch (e) {
        console.error('Supabase init error', e);
        return null;
    }
}

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    return initSupabase();
}

function isSupabaseReady() {
    return !!getSupabase();
}
