export const config = { runtime: "edge" };

const SB_URL = process.env.SUPABASE_URL || "https://htvpviogkfddllpsihbz.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "sb_publishable_7Qjtm4tluK1-XlWgQ2Ve1g_4R-GUoPK";
const BACKUP_SECRET = process.env.BACKUP_SECRET || "jeoff-backup-2026";

export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== BACKUP_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const endpoint = SB_URL + "/rest/v1/crm_data?select=*";
    const authHeader = "Bearer " + SB_KEY;
    const res = await fetch(endpoint, {
      headers: { apikey: SB_KEY, Authorization: authHeader }
    });
    const data = await res.json();

    const today = new Date().toISOString().slice(0, 10);
    const backup = {
      timestamp: new Date().toISOString(),
      date: today,
      tables: {},
      totalRows: data.length
    };

    data.forEach(row => {
      backup.tables[row.key] = {
        entries: Array.isArray(row.data) ? row.data.length : 1,
        data: row.data
      };
    });

    const filename = "jeoff-crm-backup-" + today + ".json";
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=" + filename
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
