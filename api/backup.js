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
    const authHeader = "Bearer " + SB_KEY;
    const endpoint = SB_URL + "/rest/v1/crm_data?select=key,data&not.key=like.backup_%";

    const res = await fetch(endpoint, {
      headers: { apikey: SB_KEY, Authorization: authHeader }
    });
    const data = await res.json();

    const today = new Date().toISOString().slice(0, 10);
    const backup = {
      timestamp: new Date().toISOString(),
      date: today,
      rowCount: data.length,
      tables: {}
    };

    // Group rows by table prefix
    data.forEach(row => {
      const key = row.key;
      // Determine which tab this row belongs to
      const tabMatch = key.match(/^([a-z]+)_entry_/);
      const tab = tabMatch ? tabMatch[1] : key;
      if (!backup.tables[tab]) backup.tables[tab] = [];
      if (tabMatch) {
        backup.tables[tab].push(row.data);
      } else {
        backup.tables[tab] = row.data;
      }
    });

    const backupJson = JSON.stringify(backup, null, 2);

    // Save backup copy to Supabase (key = backup_YYYY-MM-DD)
    const saveRes = await fetch(SB_URL + "/rest/v1/crm_data", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: authHeader,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        key: "backup_" + today,
        data: backup,
        updated_at: new Date().toISOString()
      })
    });

    // Clean up backups older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = "backup_" + cutoff.toISOString().slice(0, 10);
    await fetch(SB_URL + "/rest/v1/crm_data?key=like.backup_%25&key=lt." + cutoffStr, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: authHeader, Prefer: "return=minimal" }
    });

    // Return as download for manual button clicks
    const filename = "jeoff-crm-backup-" + today + ".json";
    return new Response(backupJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=" + filename,
        "X-Backup-Saved": saveRes.ok ? "yes" : "no"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
