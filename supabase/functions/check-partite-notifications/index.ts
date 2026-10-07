import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Invio messaggio a Telegram
async function sendTelegram(text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "HTML",
    }),
  });
  return res.json();
}

// Stessa regola arbitro di app.js
function isRefereeNeeded(cat: string, isFriendly: boolean): boolean {
  if (isFriendly) return true;
  if (!cat) return true;
  const c = cat.toUpperCase().replace(/\s+/g, "");
  if (c === "U15" || c === "U17" || c === "U19") {
    return false;
  }
  return true;
}

// Stessa verifica completezza di app.js
function checkRequirements(item: any): { incompleta: boolean; mancanti: string[] } {
  const mancanti: string[] = [];
  const hasT1 = !!(item.t1 && item.t1.trim());
  const hasT2 = !!(item.t2 && item.t2.trim());
  const hasArb = !!(item.arb && item.arb.trim());

  if (!hasT1) mancanti.push("Tavolo 1");

  if (item.friendly) {
    if (!hasArb) mancanti.push("Arbitro");
  } else {
    if (!hasT2) mancanti.push("Tavolo 2");
    if (isRefereeNeeded(item.cat, false) && !hasArb) {
      mancanti.push("Arbitro");
    }
  }

  return { incompleta: mancanti.length > 0, mancanti };
}

// Formattazione data YYYY-MM-DD
function toIsoDate(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "urgent"; // 'urgent' oppure 'weekly'

  // Recupera i dati da 'partite_board' come fa app.js
  const { data: row, error } = await supabase
    .from("partite_board")
    .select("data")
    .eq("id", "partite")
    .maybeSingle();

  if (error || !row?.data) {
    return new Response(JSON.stringify({ error: error?.message || "Dati non trovati" }), {
      status: 500,
    });
  }

  const items: any[] = Array.isArray(row.data.items) ? row.data.items : [];
  const now = new Date();
  const todayIso = toIsoDate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toIsoDate(tomorrow);

  if (mode === "urgent") {
    // Gare di OGGI e di DOMANI ancora incomplete
    const urgentMatches = items.filter((it) => {
      const isUrgentDate = it.date === todayIso || it.date === tomorrowIso;
      return isUrgentDate && checkRequirements(it).incompleta;
    });

    if (urgentMatches.length > 0) {
      let msg = `⚠️ <b>PARTITE IMMINENTI INCOMPLETE (${urgentMatches.length})</b>\n\n`;
      urgentMatches.forEach((m) => {
        const { mancanti } = checkRequirements(m);
        const amich = m.friendly ? " [AMICHEVOLE]" : "";
        msg += `🏀 <b>${m.title || "Partita"}</b>${amich}\n`;
        msg += `📅 Data: <b>${m.date}</b> | Ore: <b>${m.time || "n.d."}</b> | Cat: ${m.cat || "n.d."}\n`;
        msg += `❌ Mancano: <b>${mancanti.join(", ")}</b>\n\n`;
      });

      await sendTelegram(msg);
      return new Response(JSON.stringify({ sent: true, count: urgentMatches.length }));
    }

    return new Response(JSON.stringify({ sent: false, message: "Nessuna gara urgente incompleta" }));
  }

  if (mode === "weekly") {
    // Promemoria del mercoledì per i prossimi 7 giorni
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekIso = toIsoDate(nextWeek);

    const upcoming = items
      .filter((it) => it.date >= todayIso && it.date <= nextWeekIso)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

    let msg = `📋 <b>PROMEMORIA TURNI DELLA SETTIMANA</b>\n`;
    msg += `È mercoledì! Controlla e invia i turni per i prossimi 7 giorni:\n\n`;

    if (upcoming.length === 0) {
      msg += `<i>Nessuna partita in programma nei prossimi 7 giorni.</i>`;
    } else {
      upcoming.forEach((m) => {
        const { incompleta, mancanti } = checkRequirements(m);
        const icon = incompleta ? "⚠️" : "✅";
        const amich = m.friendly ? " [A]" : "";
        msg += `${icon} <b>${m.date}</b> (${m.time || "n.d."}) - <b>${m.title || "Gara"}</b> [${m.cat || "n.d."}]${amich}\n`;
        if (incompleta) {
          msg += `   └ Mancano: <i>${mancanti.join(", ")}</i>\n`;
        }
      });
    }

    await sendTelegram(msg);
    return new Response(JSON.stringify({ sent: true, mode: "weekly", count: upcoming.length }));
  }

  return new Response(JSON.stringify({ error: "Modalità non valida" }), { status: 400 });
});
