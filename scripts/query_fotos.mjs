import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://kpgmcebtzbeatmznwbfb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ21jZWJ0emJlYXRtem53YmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTg3MTM0NiwiZXhwIjoyMDYxNDQ3MzQ2fQ.K1TXPFHcmApciI2Ap9ZWn1ggbHapSrjdhwesjjSG3TM"
);

async function main() {
  const { data, error } = await supabase.rpc("exec_sql", {
    query: `select count(*), array_agg(id), fotos from propiedades where codigo_propiedad = '2372409961' group by fotos;`,
  });
  if (error) {
    console.error("RPC error:", error.message);
    // Fallback to direct query
    const { data: d2, error: e2 } = await supabase
      .from("propiedades")
      .select("id, fotos")
      .eq("codigo_propiedad", "2372409961");
    if (e2) {
      console.error("Direct query error:", e2.message);
      return;
    }
    console.log("count:", d2.length);
    console.log(JSON.stringify(d2, null, 2));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
