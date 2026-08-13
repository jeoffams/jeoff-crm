export const config = { runtime: "edge" };

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const BACKUP_SECRET = process.env.BACKUP_SECRET || "jeoff-backup-2026";

export default async function handler(req) {
  // Simple secret check to prevent abuse
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== BACKUP_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const res = await fetch(, {
      headers: { apikey: SB_KEY, Authorization:  }
    });
    const data = await res.json();

    const backup = {
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString("nl-NL"),
      tables: {},
      totalRows: data.length
    };

    data.forEach(row => {
      backup.tables[row.key] = {
        entries: Array.isArray(row.data) ? row.data.length : 1,
        data: row.data
      };
    });

    // Return as downloadable JSON
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
