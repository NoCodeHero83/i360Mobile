import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kpgmcebtzbeatmznwbfb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ21jZWJ0emJlYXRtem53YmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTg3MTM0NiwiZXhwIjoyMDYxNDQ3MzQ2fQ.K1TXPFHcmApciI2Ap9ZWn1ggbHapSrjdhwesjjSG3TM"
);

async function main() {
  const { data, error } = await supabase
    .from("debug_logs")
    .select("payload, created_at")
    .eq("contexto", "polygon_filter")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  process.stdout.write(JSON.stringify(data));
}

main();
