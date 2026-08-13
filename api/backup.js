const SB_URL = process.env.SUPABASE_URL || "https://htvpviogkfddllpsihbz.supabase.co";
const SB_KEY = process.env.SUPABASE_KEY || "sb_publishable_7Qjtm4tluK1-XlWgQ2Ve1g_4R-GUoPK";
const BACKUP_SECRET = process.env.BACKUP_SECRET || "jeoff-backup-2026";

export default async function handler(req, res) {
  const secret = req.query.secret || new URL(req.url, "https://x.x").searchParams.get("secret");
  if (secret !== BACKUP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

    // Fetch all crm_data rows
    const r = await fetch(SB_URL + "/rest/v1/crm_data?select=key,data", { headers });
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: "Supabase fetch failed: " + r.status, detail: text.slice(0, 200) });
    }
    const rows = await r.json();

    const today = new Date().toISOString().slice(0, 10);
    const backup = { timestamp: new Date().toISOString(), date: today, tables: {} };

    // Group row-level entries back into tab arrays
    rows.forEach(row => {
      const key = row.key;
      if (key.startsWith("backup_")) return; // skip previous backups
      const match = key.match(/^([a-z]+)_entry_/);
      if (match) {
        const tab = match[1];
        if (!backup.tables[tab]) backup.tables[tab] = [];
        backup.tables[tab].push(row.data);
      } else {
        // Meta key (jsid etc.)
        backup.tables[key] = row.data;
      }
    });

    const backupJson = JSON.stringify(backup, null, 2);

    // Save a copy back to Supabase as backup_YYYY-MM-DD
    await fetch(SB_URL + "/rest/v1/crm_data", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: "backup_" + today, data: backup, updated_at: new Date().toISOString() })
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="jeoff-crm-backup-' + today + '.json"');
    return res.status(200).send(backupJson);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
