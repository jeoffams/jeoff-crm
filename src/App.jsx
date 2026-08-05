import React, { useState, useEffect, useCallback, useRef } from "react";
import { db, supabase } from "./supabase.js";

const R = "#f53a1b";
const C = { bg:"#ffffff", border:"#e5e5e5", text:"#111111", muted:"#909090" };


const uid = () => Math.random().toString(36).slice(2, 9);
const nowStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`; };
const parseDate = (s) => { if (!s) return null; const p = s.split("/"); if (p.length !== 3) return null; return new Date(2000+parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])); };
const daysUntil = (s) => { const d = parseDate(s); if (!d) return 999; return Math.round((d - new Date()) / 86400000); };
const plus14 = () => { const d = new Date(); d.setDate(d.getDate()+14); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`; };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate()+n); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`; };
const daysSince = (s) => { const d = parseDate(s); if (!d) return 999; return Math.round((new Date() - d) / 86400000); };
const contactHeat = (lc) => { if (!lc) return "#fff5f5"; const d = daysSince(lc); if (d > 28) return "#fff5f5"; if (d > 14) return "#fef3c7"; if (d > 7) return "#fffbeb"; return "#fff"; };

// ── Sweep ─────────────────────────────────────────────────────────────────────
// SWEEP INSTRUCTIONS (for Claude when "Run Sweep" is typed in chat):
// ─── 1. LINKEDIN JOBS — Amsterdam (all types, past week) ────────────────────────
//    URL: https://linkedin.com/jobs/search/?keywords=[term]&geoId=102011674&f_TPR=r604800&sortBy=DD
//    Batch A — Production: "creative producer", "executive producer", "content producer", "producent",
//             "VFX producer", "senior producer", "freelance producer", "AI producer", "AI creative producer"
//    Batch B — Creative Ops: "creative operations manager", "creative ops", "creative operations",
//             "creative services manager", "creative project manager", "head of creative operations"
//    Batch C — PM/Production: "project manager productie", "production manager", "campaign manager",
//             "head of production", "creative project manager", "generative AI producer"
// ─── 2. LINKEDIN JOBS — Remote (Benelux + UK + DE, contract/freelance only) ──────
//    Add: &f_WT=2 (remote) + &f_JT=C%2CF (contract/freelance)
//    NL: geoId=102890719 | BE: geoId=100565514 | UK: geoId=101165590 | DE: geoId=101282230
//    ALL FOUR must be run every sweep. Same keywords as Batch A+B above.
// ─── 3. LINKEDIN POSTS — Contextual brief signals (report in chat, NOT saved to CRM) ───────────
//    URL: https://linkedin.com/search/results/content/?keywords=[term]&datePosted=past-week&sortBy=date_posted
//    Navigate, wait 5s, read innerText, report any relevant posts directly in chat.
//    Use same technique as jobs sweep but present findings in chat rather than writing to Supabase.
//
//    Run these 4 searches in sequence:
//
//    Search A — Dutch production context (broad, no quotes):
//      wij zoeken producent campagne OR freelance producent OR branded content amsterdam
//
//    Search B — English opportunity signals:
//      creative producer freelance amsterdam OR production manager available netherlands
//
//    Search C — Jeoff's specific skill signals (animation/CG/VFX context):
//      animatie producent gezocht OR CG producer freelance OR branded content producer amsterdam
//
//    Search D — Campaign & shoot context:
//      campagne productie freelance OR shoot producer amsterdam OR postproductie producent gezocht
//
//    → DO NOT use exact quoted phrases — they kill recall. Unquoted terms cast a wider net.
//    → For each result: read the post, assess if someone is LOOKING FOR a producer/PM.
//    → Skip: people looking for work themselves, news posts, general industry content.
//    → Report relevant posts in chat with: poster name, company, what they need, post date.
// ─── 4. JELLOW.NL — Dutch freelance platform ─────────────────────────────────────
//    URL: https://www.jellow.nl/opdrachten
//    Search: "producent" / "producer" / "projectmanager" | Filter: Creative / Marketing
//    → Dutch-specific freelance brief platform. Brands + agencies post directly. High relevance.
// ─── 5. THE DOTS — https://the-dots.com/jobs ──────────────────────────────────────
//    URL: https://the-dots.com/jobs?q=producer&type=freelance
//    IMPORTANT: page is heavy JS — use get_page_text tool (not innerText) OR wait 6+ seconds after load
//    before reading. Check for job card elements with document.querySelector('.job-card') first.
//    → Best UK creative freelance platform for senior producers
// ─── 6. YUNOJUNO — https://yunojuno.com ─────────────────────────────────────────
//    Navigate standalone (not in browser_batch) to avoid permission errors.
//    Search: "producer" + "creative production" | Amsterdam + London + Remote
// ─── 7. GREENHOUSE BOARDS — Key brands/agencies ──────────────────────────────────
//    DEPT:         https://job-boards.greenhouse.io/dept
//    Booking.com:  https://jobs.booking.com (filter: Content/Creative/Production)
//    → These post to ATS before or instead of LinkedIn
// ─── 8. WARM LEADS FOLLOW-UP CHECK ─────────────────────────────────────────────
//    After sweep: flag any warm lead in jw with lastContact > 14 days ago (stage not Won/Paused)
//    Include in sweep report as "Overdue follow-ups" section
// ─── 9. RULES ──────────────────────────────────────────────────────────────────
//    • Write ALL new jobs directly to Supabase (jf=freelance, jc=contract) — never just seed
//    • NEVER write to jcr (crew/rolodex). Never modify existing entries.
//    • Dedup by company name before writing. Skip if company already in jf or jc this month.
//    • Include sweep date + source URL on every entry. Set isNew:true on all new entries.
//    • Skip: pure digital/media buying, DTC performance marketing, live events touring,
//             junior/intern roles, gaming unless production-focused, HR tech marketing.
//    • Flag "Actively reviewing applicants" roles — note it in the entry for prioritisation.
const SWEEP_ID = "10/06/26-1";
// Sweep 10/06/26: Full improved sweep — expanded keywords + remote geo + TheDots + YunoJuno + Greenhouse + Studio sites + warm lead check.
// NOTE: Sweeps never touch crew. Only jf/jc are ever modified by sweep logic.
const LATEST_SWEEP = [
  // ── Freelance ──────────────────────────────────────────────────────────────────────────
  { company:"NOMOBO",         role:"Technical Producer EU",              type:"Freelance", location:"Amsterdam",  sector:"Tech / Creative",   priority:"High",   source:"https://linkedin.com/jobs", notes:"EU-wide technical production lead. Amsterdam-based tech/creative studio.", date:"02/06/26" },
  { company:"Loop Earplugs",  role:"Freelance Creative Strategist",      type:"Freelance", location:"Amsterdam",  sector:"Consumer / Brand",  priority:"Medium", source:"https://linkedin.com/jobs", notes:"Creative strategy + content role. Consumer earplugs brand with strong content output.", date:"02/06/26" },
  { company:"Art of Dance",   role:"Creative Producer — Stage & Show Design", type:"Freelance", location:"Almere (Hybrid)", sector:"Events / Entertainment", priority:"Low", source:"https://linkedin.com/jobs", notes:"Stage and show design production. Dance/events sector. 30 min from Amsterdam.", date:"04/06/26" },
  { company:"Adidas",         role:"Freelance PM/Producer — AI Campaigns", type:"Freelance", location:"Amsterdam (On-site)", sector:"Sports / Fashion", priority:"High", source:"https://www.linkedin.com/search/results/content/?keywords=AI+campaign+producer+netherlands", notes:"DIRECT BRIEF via LinkedIn post. Anna Soderstrom (anna.soderstrom@externals.adidas.com). Freelance PM/Creative Producer for in-house AI campaign project. Mid-Aug to year-end. NL on-site. AI production experience required. YOU HAVE 2 YRS ADIDAS EMBED — EMAIL NOW.", date:"05/06/26" },
  // ── Contract ─────────────────────────────────────────────────────────────────────────
  { company:"Booking.com",    role:"Content Producer",                   type:"Contract",  location:"Amsterdam",  sector:"Tech / Travel",     priority:"High",   source:"https://linkedin.com/jobs", notes:"Content production role at one of Amsterdam's biggest employers. AMS HQ.", date:"02/06/26" },
  { company:"GoSpooky",       role:"Senior Project Manager",             type:"Contract",  location:"Amsterdam",  sector:"Social / Content",  priority:"Medium", source:"https://linkedin.com/jobs", notes:"Social-first creative agency. Growing Amsterdam studio.", date:"02/06/26" },
  { company:"DEPT®",     role:"Senior Project Manager",             type:"Contract",  location:"Amsterdam",  sector:"Digital / Agency",  priority:"High",   source:"https://linkedin.com/jobs", notes:"Global digital agency. Strong fit for senior CP with production background.", date:"02/06/26" },
  { company:"DIGIC Pictures", role:"Senior Producer — Games Cinematics", type:"Contract",  location:"Remote (EU)", sector:"Games / CGI",      priority:"High",   source:"https://linkedin.com/jobs", notes:"CGI games cinematics specialist role. Excellent fit for CG production background.", date:"02/06/26" },
  { company:"Netflix",        role:"Language Producer FTC",              type:"Contract",  location:"Amsterdam",  sector:"Streaming / Media", priority:"High",   source:"https://linkedin.com/jobs", notes:"12-month FTC. Prestige. Netflix Amsterdam office.", date:"02/06/26" },
  { company:"Monks",          role:"Senior Producer — Experiential EMEA", type:"Contract", location:"Amsterdam",  sector:"Agency / Production", priority:"High", source:"https://monks.com/careers", notes:"Integrated producer for EMEA experiential team. Strong AI/tech angle. Warm contacts inside (Cas, Tommaso).", date:"04/06/26" },
  { company:"Twine",          role:"Executive Producer — Preschool TV Packaging", type:"Contract", location:"Remote (EU)", sector:"TV / Broadcast", priority:"Medium", source:"https://linkedin.com/jobs", notes:"EP role for preschool TV packaging. Remote within EU.", date:"04/06/26" },
  { company:"DPG Media",      role:"Community Producer Libelle Club",    type:"Contract",  location:"Amsterdam (Hybrid)", sector:"Media / Publishing", priority:"Medium", source:"https://linkedin.com/jobs", notes:"6-month contract. Libelle Club community platform. DPG Media Nederland. 3 connections work here. Not core creative production but strong Dutch media name.", date:"05/06/26" },
  { company:"DEPT®",        role:"Project Manager (Creative)",         type:"Contract",  location:"Amsterdam / Rotterdam (Hybrid)", sector:"Digital / Agency", priority:"High",   source:"https://job-boards.greenhouse.io/dept/jobs/7957564", notes:"NEW posting. Day-to-day PM on major accounts: Philips, Netflix, Uber, Miele, Grolsch. End-to-end creative projects — content, social, design, 360 campaigns. Requires Dutch fluency. Confirmed active June 2026.", date:"08/06/26" },
  { company:"Boomerang",       role:"Project Manager",                    type:"Contract",  location:"Amsterdam (Hybrid)", sector:"Agency / Production", priority:"Medium", source:"https://linkedin.com/jobs", notes:"Part of Publicis Groupe. Production-focused agency. Head of Production: Han Schuurman. Posted 2 days ago. Good entry point into Publicis network.", date:"08/06/26" },
  { company:"Booking.com",     role:"Senior Project Manager",             type:"Contract",  location:"Amsterdam (On-site)", sector:"Tech / Travel", priority:"High",   source:"https://linkedin.com/jobs/view/4425619968", notes:"For independent contractors — explicitly a contract/freelance role. Amsterdam on-site. 1 connection there. 55 applicants 15h after posting. Booking.com is a previous client via TILT Amsterdam. Apply fast.", date:"09/06/26" },
  { company:"Bugaboo",         role:"Creative Operations Manager",        type:"Contract",  location:"Amsterdam (Hybrid)", sector:"Consumer / Design / Brand", priority:"High",   source:"https://www.linkedin.com/jobs/view/4422282918/", notes:"In-house creative studio ops role at premium Dutch stroller brand. Reports to Colinda Bijsterveld (Global Head of Creative, 2nd degree). 100+ applicants — move fast. Own workflows, resourcing, multi-channel campaigns.", date:"09/06/26" },
];
// ── Seed data ─────────────────────────────────────────────────────────────────
const mk = (x) => ({ ...x, id: uid() });
const SW = [
  // Seed intentionally empty — warm leads are managed entirely via Supabase.
  // Seeding here caused random IDs to regenerate on every load, re-merging
  // stale entries and overwriting the user's real CRM data. Do not add entries here.
];
const SN = [
  // Seed intentionally empty — new leads are managed via Supabase.
];
const SAg = [
  mk({ name:"72andSunny Amsterdam", contact:"Julie Bourges", email:"julie.bourges@72andsunny.com", website:"https://72andsunny.com", location:"Amsterdam", priority:"5/5", status:"In Warm Leads", notes:"Reached out first. High priority." }),
  mk({ name:"Monks", contact:"Cas de Brouwer / Tommaso M.", email:"cas.de.brouwer@monks.com", website:"https://monks.com", location:"Amsterdam", priority:"5/5", status:"In Warm Leads", notes:"Two contacts inside. Global studio." }),
  mk({ name:"Wieden+Kennedy", contact:"Jaime Tan (Head of Production)", email:"jaime.tan@wk.com", website:"https://wk.com", location:"Amsterdam", priority:"5/5", status:"Find contact", notes:"Head of Production. Email pattern: firstname.lastname@wk.com. President: Luiza Prata Carvalho (since 2024). Clients: Nike, Heineken, Samsung, Duolingo." }),
  mk({ name:"TBWA NEBOKO", contact:"Tom Broad (Talent Director)", email:"tom.broad@tbwa.nl", website:"https://tbwa-neboko.nl", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"Talent Director — RIGHT contact for freelance. Now 245 staff incl. absorbed DDB Amsterdam team (Dec 2025). Format: firstname.lastname@tbwa.nl. Clients: Heineken, Albert Heijn, adidas, Bol, VodafoneZiggo." }),
  mk({ name:"DDB Amsterdam", contact:"TBD", email:"", website:"https://tbwa-neboko.nl", location:"Amsterdam", priority:"3/5", status:"Closed", notes:"Merged into TBWA\u005cNEBOKO December 2025. Brand fully retired by Omnicom. All DDB Amsterdam staff + clients transferred. Reach out to TBWA\u005cNEBOKO instead." }),
  mk({ name:"DEPT(R)", contact:"TBD", email:"", website:"https://deptagency.com", location:"Amsterdam", priority:"5/5", status:"Find contact", notes:"Digital-native, massive growth." }),
  mk({ name:"Achtung McConnell", contact:"Sarah Vandermeer", email:"", website:"https://achtung.nl", location:"Amsterdam", priority:"3/5", status:"New Lead added", notes:"Full-service. Growing production dept." }),
  mk({ name:"SuperHeroes Amsterdam", contact:"Django Weisz Blanchetta", email:"airmail@hellosuperheroes.com", website:"https://hellosuperheroes.com", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"CEO & Co-Founder. Small agency (~50 people), CEO is right call. Won Ad Age Small Agency of Year 2025. Social-first, Gen Z, CGI/FOOH. Nike, Netflix, LEGO, Lenovo. General: airmail@hellosuperheroes.com." }),
  mk({ name:"Dentsu Amsterdam", contact:"TBD", email:"", website:"https://dentsu.com", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Japanese holding group." }),
  mk({ name:"Havas Amsterdam", contact:"TBD", email:"", website:"https://havas.com", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Strong in pharma/retail." }),
  mk({ name:"Publicis Amsterdam", contact:"TBD", email:"", website:"https://publicis.nl", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Holding group. Saatchi arm more creative." }),
  mk({ name:"FCB Amsterdam", contact:"TBD", email:"", website:"https://bbdo.com", location:"Amsterdam", priority:"2/5", status:"Closed", notes:"Brand being retired H1 2026 per Omnicom restructure. FCB merging into BBDO globally. NL: team absorbing into BBDO Amsterdam. Reach out to BBDO Amsterdam." }),
  mk({ name:"Fitzroy Amsterdam", contact:"Jur", email:"jur@fitzroy.nl", website:"https://fitzroy.nl", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"Key contact at this boutique creative shop. General: hello@fitzroy.nl | +31 20 40 80 774. Part of United Playgrounds. High-craft campaigns, strong brand work." }),
  mk({ name:"Ogilvy Amsterdam", contact:"TBD", email:"", website:"https://ogilvy.com", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Global holding. Less independent-creative." }),
  mk({ name:"GoldenEgg Amsterdam", contact:"TBD", email:"", website:"https://goldenegg.nl", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"Boutique strategy + creative. Growing." }),
  mk({ name:"CZAR", contact:"Karlijn Paardekooper", email:"karlijn@czar.nl", website:"https://czar.nl", location:"Amsterdam", priority:"5/5", status:"Find contact", notes:"EP & Managing Partner. Also Willem (EP): willem@czar.nl. Top Dutch commercial production house. Animation + live action. Danzigerbocht 45g Amsterdam." }),
  mk({ name:"Halal", contact:"Job Sanders", email:"job@halal.amsterdam", website:"https://halal.amsterdam", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"Head of Production/EP. NOTE: Rebranded to 100% Film (100prcnt.film) in 2025 — same team. Also Aemilia van Lent (EP). Branded content + editorial." }),
  mk({ name:"Hazazah", contact:"Jeroen van den Idsert", email:"jeroen@hazazah.nl", website:"https://hazazah.com", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"Award-winning film & photography production. Founded 1997. Commercials, branded content, documentary. Well-connected NL production world." }),
  mk({ name:"Submarine", contact:"Femke Wolting (EP)", email:"femke@submarine.nl", website:"https://submarine.nl", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Executive Producer. Confirmed via Safe Harbor (2025) production credits. Animation, feature film, branded content. Oscar-nominated studio." }),
  mk({ name:"KesselsKramer", contact:"Els Doornhein (curator)", email:"", website:"https://kesselskramer.com", location:"Amsterdam", priority:"1/5", status:"Closed", notes:"BANKRUPT June 2026 — 3 major clients dropped unexpectedly. 30-yr Amsterdam icon. Curator investigating possible restart. Monitor for doorstart but do not reach out now." }),
  mk({ name:"Anomaly Amsterdam", contact:"amsterdam@anomaly.com", email:"amsterdam@anomaly.com", website:"https://amsterdam.anomaly.com", location:"Amsterdam", priority:"4/5", status:"Find contact", notes:"No named production contact found publicly — use general AMS email to intro. Global indie agency. Strong embed target for senior PM/producer." }),
  mk({ name:"McCann Amsterdam", contact:"TBD", email:"", website:"https://mccann.nl", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Global creative network. Now one of 3 surviving Omnicom agencies (alongside TBWA + BBDO) after 2026 restructure. Picking up DDB/FCB clients." }),
  mk({ name:"BBDO Amsterdam", contact:"TBD", email:"", website:"https://bbdo.com", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Global creative network. Absorbing FCB teams in NL in 2026 (Omnicom restructure). Growth phase — good time to approach for production capacity." }),
  mk({ name:"Storm Post Production", contact:"TBD", email:"", website:"https://stormpost.nl", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Post production & VFX. Amsterdam. Commercial finishing, motion graphics. Boutique post house." }),
  mk({ name:"N=5", contact:"TBD", email:"", website:"https://n5.nl", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Brand + creative strategy agency. Amsterdam. Visual brand building, campaign development." }),
  mk({ name:"Synima Amsterdam", contact:"TBD", email:"info@synima.com", website:"https://synima.com", location:"Amsterdam", priority:"3/5", status:"Find contact", notes:"Production company. Kraijenhoffstraat 137A Amsterdam. Corporate + commercial video production." }),
];
const SBr = [
  mk({ brand:"Adidas", contactToFind:"Maria Drossos", sector:"Sports/Fashion", warmIn:"Yes", priority:"5/5", status:"In Warm Leads", notes:"Direct contact via Maria Drossos." }),
  mk({ brand:"Booking.com", contactToFind:"Head of Content", sector:"Travel/Tech", warmIn:"No", priority:"5/5", status:"Find contact", notes:"AMS HQ. Massive content operation." }),
  mk({ brand:"Heineken", contactToFind:"Head of Creative Production", sector:"FMCG/Beer", warmIn:"No", priority:"4/5", status:"Find contact", notes:"AMS-based. Premium global campaigns." }),
  mk({ brand:"Nike Amsterdam", contactToFind:"Head of Production", sector:"Sports/Fashion", warmIn:"No", priority:"5/5", status:"Find contact", notes:"Nike European HQ in AMS. Must get inside." }),
  mk({ brand:"Philips", contactToFind:"Senior Creative Producer", sector:"Tech/Health", warmIn:"No", priority:"3/5", status:"Find contact", notes:"AMS-based. Health tech content production." }),
  mk({ brand:"ING", contactToFind:"Head of Content", sector:"Finance", warmIn:"No", priority:"3/5", status:"Find contact", notes:"Dutch bank. Large content budget." }),
  mk({ brand:"Spotify", contactToFind:"Creative Producer", sector:"Tech/Music", warmIn:"No", priority:"4/5", status:"Find contact", notes:"Stockholm but AMS creative hub." }),
  mk({ brand:"TomTom", contactToFind:"Creative Director", sector:"Tech/Navigation", warmIn:"No", priority:"3/5", status:"Find contact", notes:"AMS-headquartered. Good for animated explainers." }),
  mk({ brand:"ASML", contactToFind:"Head of Communications", sector:"Tech/Semiconductor", warmIn:"No", priority:"3/5", status:"Find contact", notes:"Eindhoven. Corporate video + content." }),
  mk({ brand:"ABN AMRO", contactToFind:"Creative Producer", sector:"Finance", warmIn:"No", priority:"2/5", status:"Find contact", notes:"AMS bank. Volume content needs." }),
  mk({ brand:"Coolblue", contactToFind:"Content Lead", sector:"E-commerce", warmIn:"No", priority:"3/5", status:"Find contact", notes:"NL e-commerce. Known for high-quality content." }),
  mk({ brand:"bol.com", contactToFind:"Head of Content", sector:"E-commerce", warmIn:"No", priority:"2/5", status:"Find contact", notes:"AMS. Volume content." }),
  mk({ brand:"KLM", contactToFind:"Creative Production Lead", sector:"Aviation/Travel", warmIn:"No", priority:"4/5", status:"Find contact", notes:"Iconic brand. Global campaigns. AMS-based." }),
  mk({ brand:"Rituals", contactToFind:"Head of Brand Content", sector:"Beauty/Lifestyle", warmIn:"No", priority:"3/5", status:"Find contact", notes:"AMS brand. Strong visual identity." }),
];
// ── Crew seed data (Jeoff's real freelancer network) ─────────────────────────
// NOTE: Sweeps only write to jf/jc (freelance/contract jobs). Crew is never touched by sweeps.
const SCr = [
  // Motion Design
  mk({ name:"Edwin Haverkamp", specialty:"Motion Design", rate:"", email:"edwinhaverkamp@gmail.com", website:"https://edwinhaverkamp.com", location:"Amsterdam", notes:"2D Motion Design." }),
  mk({ name:"Jeff Beukema", specialty:"Motion Design", rate:"", email:"hello@jeffbeukema.com", website:"https://jeffbeukema.com", location:"", notes:"" }),
  mk({ name:"Ola Tandstad", specialty:"Motion Design", rate:"600/day", email:"olatandstad@gmail.com", website:"https://olatandstad.com", location:"", notes:"Motion Design + Cell Animation." }),
  mk({ name:"Rens Wegerif", specialty:"Motion Design", rate:"", email:"renswegerif@hotmail.com", website:"https://renswegrif.com", location:"Vaassen", notes:"" }),
  mk({ name:"Rob Wienk", specialty:"Motion Design", rate:"", email:"robwienk@gmail.com", website:"https://vuurvorm.nl", location:"Amsterdam", notes:"" }),
  mk({ name:"Max Peterse", specialty:"Motion Design", rate:"", email:"", website:"https://maxpeterse.nl", location:"", notes:"Motion Designer + Storyboarder." }),
  mk({ name:"Devon Moodley", specialty:"Motion Design", rate:"500/day", email:"devonmoodley@gmail.com", website:"https://devonmoodley.com", location:"Amsterdam", notes:"" }),
  mk({ name:"Dirk Jan Haarsma", specialty:"Motion Design", rate:"500/day", email:"mail@dirkjan.co", website:"https://dirkjan.co", location:"", notes:"" }),
  mk({ name:"Wim Dijksterhuis", specialty:"Motion Design", rate:"550/day", email:"contact@wim.studio", website:"https://wim.studio", location:"Amsterdam", notes:"" }),
  mk({ name:"Marco van der Vlag", specialty:"Motion Design", rate:"600/day", email:"hello@marcovandervlag.com", website:"https://marcovandervlag.com", location:"Utrecht", notes:"" }),
  mk({ name:"Pip Williamson", specialty:"Motion Design", rate:"400/day", email:"hello@williamsonpip.co.uk", website:"https://williamsonpip.co.uk", location:"Amsterdam", notes:"Motion Design + Cell Animation." }),
  mk({ name:"Joost Rutten", specialty:"Motion Design", rate:"", email:"workwithjoost@gmail.com", website:"https://joostrutten.com", location:"Amsterdam / Haarlem", notes:"2D Motion Design." }),
  mk({ name:"Kevin Megens", specialty:"Motion Design", rate:"", email:"hallo@skelter.tv", website:"https://skelter.tv", location:"Utrecht", notes:"Motion Director." }),
  mk({ name:"Sjoerd Olislagers", specialty:"Motion Design", rate:"", email:"hello@sjoerdolislagers.com", website:"https://sjoerdolislagers.com", location:"Amsterdam", notes:"3D Motion Designer." }),
  mk({ name:"Rene te Riele", specialty:"Motion Design", rate:"", email:"", website:"https://sundaes.space", location:"Amsterdam", notes:"" }),
  // 3D / CGI
  mk({ name:"Edwin van het Bolscher", specialty:"3D / CGI", rate:"", email:"3ddy@3dhype.com", website:"https://3dhype.com", location:"", notes:"3D / TD." }),
  mk({ name:"Jim Zondervan", specialty:"3D / CGI", rate:"", email:"", website:"https://new-motive.com", location:"", notes:"Motion Designer (3D)." }),
  mk({ name:"Johannes Matsson", specialty:"3D / CGI", rate:"", email:"hello@johannesm.com", website:"https://johannesm.com", location:"Amsterdam", notes:"Motion Designer (3D)." }),
  mk({ name:"Michiel van den Berg", specialty:"3D / CGI", rate:"", email:"michiel.animation@gmail.com", website:"https://michielvdb.com", location:"Amsterdam", notes:"Motion Designer (3D)." }),
  mk({ name:"Reinier Peersman", specialty:"3D / CGI", rate:"", email:"me@reinierpeersman.nl", website:"https://reinierpeersman.nl", location:"Amsterdam", notes:"Motion Designer (3D)." }),
  mk({ name:"Tim van der Wiel", specialty:"3D / CGI", rate:"", email:"", website:"https://timvanderwiel.com", location:"", notes:"3D Motion Designer." }),
  mk({ name:"Becanti Wijnbergh", specialty:"3D / CGI", rate:"", email:"bwijnbergh@live.nl", website:"", location:"Amsterdam", notes:"Compositor / 3D Artist." }),
  mk({ name:"Dylan van Sprang", specialty:"3D / CGI", rate:"400/day", email:"", website:"https://dylanvansprang.nl", location:"Amsterdam", notes:"3D / Motion." }),
  mk({ name:"Robin Nijhof", specialty:"3D / CGI", rate:"600/day", email:"robin@hausofwaus.nl", website:"https://hausofwaus.nl", location:"Utrecht", notes:"" }),
  mk({ name:"Johannes Kammerer", specialty:"3D / CGI", rate:"", email:"", website:"https://johanneskammerer.com", location:"Berlin", notes:"3D Generalist / Motion." }),
  mk({ name:"Tommy Jansen", specialty:"3D / CGI", rate:"", email:"", website:"https://tommyjansen.nl", location:"Utrecht", notes:"3D Generalist (Modeling)." }),
  mk({ name:"Jasper Hesseling", specialty:"3D / CGI", rate:"", email:"words@mayonnaise.tv", website:"https://mayonnaise.tv", location:"Amsterdam", notes:"3D Artist." }),
  mk({ name:"Ronald Kraft", specialty:"3D / CGI", rate:"500/day", email:"reffectstudio@gmail.com", website:"https://reffect.de", location:"", notes:"3D / CG / Realtime / Modeling." }),
  mk({ name:"Sem Kuipers", specialty:"3D / CGI", rate:"600/day", email:"", website:"https://creativearmour.com", location:"Eindhoven", notes:"3D / CG." }),
  mk({ name:"Sjors van der Werff", specialty:"3D / CGI", rate:"600-700/day", email:"info@werffdesign.com", website:"https://werffdesign.com", location:"", notes:"3D Animator / Videomapping. Includes hardware for projection mapping." }),
  // VFX
  mk({ name:"Giso Spijkerman", specialty:"VFX", rate:"", email:"hi@gisospijkerman.nl", website:"https://gisospijkerman.nl", location:"Groningen", notes:"Matchmove / Cleanup / Compositing." }),
  mk({ name:"Floris van der Veen", specialty:"VFX", rate:"600/day", email:"florisvanderveen7@gmail.com", website:"", location:"Amsterdam", notes:"VFX / Animation." }),
  mk({ name:"André Westerveld", specialty:"VFX", rate:"", email:"info@houseofretouch.nl", website:"https://houseofretouch.nl", location:"Houten", notes:"Retoucher / Comp." }),
  mk({ name:"Wieger Poutsma", specialty:"VFX", rate:"900/day", email:"wiegerpoutsma@mac.com", website:"https://fisk-imaging.com", location:"", notes:"VFX / CG / Photoshop." }),
  mk({ name:"Tobias Szabo", specialty:"VFX", rate:"700/day", email:"", website:"https://tobiasszabo.com", location:"Hamburg", notes:"Houdini Artist." }),
  mk({ name:"Jan Elsner", specialty:"VFX", rate:"700/day", email:"", website:"https://janelsner.com", location:"Hamburg", notes:"Houdini Artist." }),
  mk({ name:"Andi Boeinghoff", specialty:"VFX", rate:"700/day", email:"", website:"https://aboeinghoff.com", location:"Hamburg", notes:"Houdini Artist." }),
  // Cell Animation
  mk({ name:"Mickey Cohen", specialty:"Cell Animation", rate:"", email:"msdcohen@gmail.com", website:"https://mickeycohen.nl", location:"Amsterdam", notes:"" }),
  mk({ name:"Olga van den Brandt", specialty:"Cell Animation", rate:"", email:"info@olgavdbrandt.nl", website:"https://olgavdbrandt.nl", location:"Amsterdam", notes:"" }),
  mk({ name:"Tyka Beumers", specialty:"Cell Animation", rate:"", email:"tyka.beumers@gmail.com", website:"https://tykabeumers.myportfolio.com", location:"Amsterdam", notes:"64 BIT animator." }),
  mk({ name:"Mathijs Luijten", specialty:"Cell Animation", rate:"", email:"mathijsluijten@gmail.com", website:"https://mathijsluijten.com", location:"", notes:"" }),
  mk({ name:"Ines Fernandes", specialty:"Cell Animation", rate:"375/day", email:"hello@inesfernandes.com", website:"https://inesfernandes.com", location:"Rotterdam", notes:"Cell Animation + Motion Design." }),
  mk({ name:"Iris van den Akker", specialty:"Cell Animation", rate:"", email:"hello@irisvandenakker.com", website:"https://irisvandenakker.com", location:"Amsterdam", notes:"Illustrator / Animator / Cell." }),
  // Illustration
  mk({ name:"Joeri Lefevre", specialty:"Illustration", rate:"", email:"joeri@joerilefevre.com", website:"https://joerilefevre.com", location:"Amsterdam", notes:"Illustrator / Concept Artist." }),
  mk({ name:"Gigi van Grevenbroek", specialty:"Illustration", rate:"", email:"gigivangrevenbroek@gmail.com", website:"https://gigivangrevenbroek.com", location:"Amsterdam", notes:"Illustrator / Animator." }),
  mk({ name:"Monika Jurczyk", specialty:"Illustration", rate:"", email:"jurczyk.monika@gmail.com", website:"https://iammonsie.com", location:"", notes:"" }),
  // Character Design
  mk({ name:"Rachelle Slingerland", specialty:"Character Design", rate:"400/day", email:"rachellejoyworks@gmail.com", website:"https://artstation.com/rachellejoys", location:"Rotterdam", notes:"" }),
  mk({ name:"Maureen van der Hout", specialty:"Character Design", rate:"400/day", email:"Contact@maureenvanderhout.com", website:"https://artstation.com/tantepastellia", location:"Rotterdam", notes:"" }),
  // Design
  mk({ name:"Harold van Velsen", specialty:"Design", rate:"", email:"info@bigup.nl", website:"https://bigup.nl", location:"Amsterdam", notes:"Designer." }),
  mk({ name:"Sietse van den Broek", specialty:"Design", rate:"", email:"sietse@silverfox-graphics.nl", website:"https://silverfox-graphics.nl", location:"Amsterdam", notes:"Motion / Poster Designer." }),
  mk({ name:"Faris van de Lisdonk", specialty:"Design", rate:"350/day", email:"faris@refreshh.nl", website:"https://refreshh.nl", location:"Tilburg", notes:"Designer." }),
  // Editing
  mk({ name:"Davy Le", specialty:"Editing", rate:"350/day", email:"hello@davyle.nl", website:"https://davyle.com", location:"Amsterdam", notes:"" }),
  mk({ name:"Erik Verhulst", specialty:"Editing", rate:"", email:"", website:"https://erikedit.nl", location:"Amsterdam", notes:"Edit / Grade." }),
  mk({ name:"Jonathan van Warmerdam", specialty:"Editing", rate:"", email:"", website:"https://jvanwarmerdam.nl", location:"Amsterdam", notes:"Editor / Cinematography." }),
  mk({ name:"Annie Manueke", specialty:"Editing", rate:"500/day", email:"anniemanueke@gmail.com", website:"https://anniemanueke.com", location:"", notes:"Editor / Grader." }),
  mk({ name:"Mark van de Poel", specialty:"Editing", rate:"600/day", email:"mark@mediasaurus.nl", website:"https://mediasaurus.nl", location:"", notes:"Editor / Grader." }),
  // Production Management
  mk({ name:"Geert Jansen", specialty:"Production Management", rate:"", email:"hello@jansen.agency", website:"https://jansen.agency", location:"Amsterdam", notes:"Creative Producer." }),
  // DOP / Cinematography
  mk({ name:"Elise Wiebes", specialty:"DOP / Cinematography", rate:"", email:"", website:"https://elisewiebes.nl", location:"", notes:"Camera / Production." }),
  // Sound Design
  mk({ name:"Robert Ostiak", specialty:"Sound Design", rate:"", email:"", website:"https://vimeo.com/robertostiak", location:"", notes:"Sound Designer / Composer. Digital sound." }),
  mk({ name:"Six Feet High", specialty:"Sound Design", rate:"", email:"", website:"https://sixfeethigh.nl", location:"", notes:"Sound Design / Composing Studio." }),
  mk({ name:"Kloaq", specialty:"Sound Design", rate:"", email:"", website:"https://kloaq.com", location:"", notes:"Sound Design / Composing Studio." }),
  // Unreal / Realtime
  mk({ name:"Vincent van der Klauw", specialty:"Unreal / Realtime", rate:"", email:"", website:"https://linkedin.com/in/vincentvanderkl", location:"", notes:"Unreal / Twinmotion." }),
  mk({ name:"Auke Kruithof", specialty:"Unreal / Realtime", rate:"", email:"auke@studiorewind.tv", website:"", location:"", notes:"Unreal / Environmental." }),
  mk({ name:"Jurre Briene", specialty:"Unreal / Realtime", rate:"", email:"jurre.brienne@gmail.com", website:"", location:"", notes:"Unreal / Substance Painter." }),
  // AI / Tech / XR
  mk({ name:"Viviana Curella", specialty:"AI / Tech", rate:"", email:"viviana@inbold.studio", website:"", location:"", notes:"Mixed Reality / AR Director." }),
  // Line Producing
  mk({ name:"Bastiaan (Gardner Gallops)", specialty:"Line Producing", rate:"", email:"bastiaan@gardnergallops.com", website:"https://gardnergallops.com", location:"Amsterdam / Utrecht", notes:"Live Action Production. +31 6 15 90 78 34." }),
];

// ── UI primitives ─────────────────────────────────────────────────────────────
const Logo = () => (
  <svg viewBox="0 0 2570.89 948.35" width="130" height="48" xmlns="http://www.w3.org/2000/svg">
    <path fill={R} d="M1849.31,420.81c-21.43-185.56,174.65-268.76,322.02-192.31l-28.89,109.24c-77.55-34.23-152.39-13.99-141.65,83.07h234.56c-25.25-182.51,178.03-272.66,321.4-188.31l-32.88,103.18c-80.27-26.92-147.35-16.62-137.04,85.12h141.71v117.28h-141.71v395.82h-151.49v-395.82h-234.56v395.82h-151.49v-395.82h-83.07v-117.28h83.07Z"/>
    <path fill={R} d="M1398.73,407.59c188.67-19.41,350.18,98.45,332.67,298.46-24.72,282.54-459.91,323.15-557.33,69.93-66.37-172.51,41.45-349.54,224.66-368.39ZM1422.99,529.61c-160.4,22.81-150.98,299.59,27.84,291.97,184.65-7.87,162.69-319.06-27.84-291.97Z"/>
    <path fill={R} d="M1091.88,718.9h-390.93c23.83,126.58,197.99,136.34,276.09,53.99,13.96,14.61,71.05,75.52,80.12,84.58-145.91,152.47-458.46,101.02-501.36-122.92-80.94-422.5,597.83-443.85,536.08-15.65ZM807.27,519.84c-22.84,3.14-58.62,21.33-74.07,38.28-8.25,9.05-39.99,62.6-27.51,70.54l237.53-2.37c-1.47-70.74-67.89-115.82-135.95-106.46Z"/>
    <path fill={R} d="M456.62,269.33v481.33c0,57.18-38.68,131.11-87.81,161.41-99.81,61.56-284.19,39.73-356.8-58.79l80.55-100.08c43.55,67.44,182.28,110.22,207.68,7.23,0,0,2.31-366.36,2.31-366.36l-231.99-2.57v-122.17h386.04Z"/>
    <path fill={R} d="M1726.48,408.71l-57.35-17.65c16.12-52.39,10.87-107.92-14.77-156.36-25.65-48.44-68.62-84-121.01-100.12-108.15-33.27-223.21,27.64-256.48,135.79l-57.35-17.65c20.83-67.71,66.79-123.25,129.39-156.39,62.61-33.14,134.37-39.93,202.08-19.09,67.71,20.83,123.25,66.78,156.39,129.39,33.15,62.61,39.93,134.37,19.09,202.08Z"/>
    <path fill={R} d="M1565.91,368.77l-57.35-17.65c2.4-7.81,5.94-17.45,10.03-28.62,16.57-45.21,47.43-129.38,25.38-170.27-4.07-7.54-12.1-18.19-34.84-23.53l13.72-58.41c34.27,8.05,59.15,26.04,73.93,53.48,34.85,64.66-.65,161.52-21.87,219.39-3.8,10.36-7.08,19.32-9.02,25.61Z"/>
    <path fill={R} d="M1697.81,429.77c-2.75,0-5.69-.34-8.83-1.08-30.64-7.26-91.75-26.62-136.37-40.75-14.96-4.74-27.87-8.83-37.44-11.77l.03-.1c-49.2-14.81-105.71-31.93-165.13-50.22l17.64-57.35c103.19,31.75,197.65,60.01,260.16,78.71,24.65,7.37,44.12,13.2,57.69,17.31,7.18,2.18,12.37,3.77,15.86,4.87,2.08.66,3.66,1.17,4.72,1.54,18.27,6.28,24.18,23.2,20.57,36.67-2.61,9.74-12.24,22.16-28.91,22.16Z"/>
    <path fill={R} d="M1227.38,396.92c-85.33-28.89-144.74-54.96-181.61-79.7-18.75-12.58-31.77-24.92-39.81-37.73-12.63-20.12-10.78-37.64-7.01-48.8,10.14-29.95,47.15-30.92,59.31-31.25,20.08-.53,46.93,2.09,79.79,7.8,65.04,11.29,148.66,33.7,235.47,63.09l-19.24,56.83c-73.74-24.97-146.66-45.16-205.31-56.85-40.06-7.98-65.29-10.44-80.67-10.84,18.55,14.92,64.62,42.11,178.31,80.61l-19.24,56.83Z"/>
  </svg>
);

const EditCell = ({ value, onSave, multi }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  if (editing) {
    if (multi) return (
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { setEditing(false); onSave(v); }} rows={3}
        style={{ width:"100%", border:`1px solid ${R}`, borderRadius:4, padding:"4px 6px", fontSize:11, fontFamily:"inherit", resize:"both", outline:"none", background:"#fff", color:C.text }} />
    );
    return (
      <input autoFocus type="text" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { setEditing(false); onSave(v); }} onKeyDown={(e) => { if (e.key==="Enter") { setEditing(false); onSave(v); } }}
        style={{ width:"100%", border:`1px solid ${R}`, borderRadius:4, padding:"4px 6px", fontSize:11, outline:"none", background:"#fff", color:C.text }} />
    );
  }
  return (
    <div onClick={() => setEditing(true)} style={{ minHeight:18, fontSize:11, color: v ? C.text : C.muted+"66", cursor:"text", lineHeight:"1.5", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
      {v || "—"}
    </div>
  );
};

const Sel = ({ value, opts, onChange, cf }) => (
  <select value={value || opts[0]} onChange={(e) => onChange(e.target.value)}
    style={{ border:`1px solid ${C.border}`, borderRadius:4, padding:"3px 6px", fontSize:11, background:"#fff", color: cf ? cf(value||opts[0]) : C.text, outline:"none", cursor:"pointer", fontWeight: cf ? 600 : 400 }}>
    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const TC = ({ children, bold, muted, top }) => (
  <td style={{ padding:"8px 10px", fontSize:12, color: muted ? C.muted : C.text, fontWeight: bold ? 600 : 400, verticalAlign: top ? "top" : "middle" }}>
    {children != null ? children : <span style={{ color:C.muted+"55" }}>—</span>}
  </td>
);

const AddBtn = ({ label, onClick }) => (
  <button onClick={onClick} style={{ background:"#fff", color:R, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 14px", cursor:"pointer", fontSize:12, fontWeight:600 }}>
    + {label}
  </button>
);

const SecHd = ({ label, count, color }) => (
  <>
  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
    <div style={{ fontSize:10, fontWeight:700, color:color||R, textTransform:"uppercase", letterSpacing:"1.2px", whiteSpace:"nowrap" }}>{label}</div>
    <div style={{ flex:1, height:1, background:C.border }} />
    {count != null && <div style={{ fontSize:10, color:C.muted }}>{count}</div>}
  </div>
  <div className="mobile-scroll-hint">Swipe to see more →</div>
  </>
);

const MiniBar = ({ data }) => {
  const max = Math.max(...data.map((d) => d.v), 1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:92, fontSize:10, color:C.muted, textAlign:"right", flexShrink:0 }}>{d.name}</div>
          <div style={{ flex:1, background:C.border, borderRadius:2, height:9 }}>
            <div style={{ width:`${(d.v/max)*100}%`, background:R, height:"100%", borderRadius:2 }} />
          </div>
          <div style={{ width:16, fontSize:10, color:C.muted, textAlign:"right" }}>{d.v}</div>
        </div>
      ))}
    </div>
  );
};

const stageCol = (s) => { if (s==="Conversation") return "#059669"; if (s==="Proposal"||s==="Won") return "#16a34a"; if (s==="Nurturing") return "#d97706"; return C.muted; };

const DeleteBtn = ({ onDelete }) => {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 3000);
    return () => clearTimeout(t);
  }, [pending]);
  if (pending) {
    return (
      <button onClick={onDelete}
        style={{ background:R, color:"#fff", border:"none", borderRadius:5, padding:"3px 7px", cursor:"pointer", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>
        Confirm?
      </button>
    );
  }
  return (
    <button onClick={() => setPending(true)}
      style={{ background:"none", color:C.muted+"88", border:`1px solid ${C.border}`, borderRadius:5, padding:"2px 7px", cursor:"pointer", fontSize:12, lineHeight:1, fontWeight:400 }}>
      ×
    </button>
  );
};
const jobCol = (s) => { if (s==="Active"||s==="Conversation"||s==="Offer") return "#059669"; if (s==="Applied") return "#2563eb"; if (s==="No Response"||s==="Stale") return "#d97706"; if (s==="Passed"||s==="Rejected") return C.muted; return C.text; };
const appCol = (s) => { if (s==="Active"||s==="Had a call") return "#059669"; if (s==="Applied") return "#2563eb"; if (s==="No Response"||s==="Stale") return "#d97706"; if (s==="Offer") return "#16a34a"; if (s==="Passed") return C.muted; if (s==="Closed") return "#7c3aed"; return C.text; };
const TH_STYLE = { textAlign:"left", padding:"5px 10px", fontSize:10, color:C.muted, fontWeight:600, whiteSpace:"nowrap" };

const SPEC_COLORS = {
  "Design":                    { bg:"#fff7ed", col:"#c2410c" },
  "Motion Design":             { bg:"#dbeafe", col:"#1d4ed8" },
  "Cell Animation":            { bg:"#ccfbf1", col:"#115e59" },
  "Character Design":          { bg:"#fdf4ff", col:"#6b21a8" },
  "3D / CGI":                  { bg:"#ede9fe", col:"#6d28d9" },
  "VFX":                       { bg:"#fef3c7", col:"#92400e" },
  "Unreal / Realtime":         { bg:"#f0f9ff", col:"#075985" },
  "Direction":                 { bg:"#fee2e2", col:"#991b1b" },
  "Editing":                   { bg:"#d1fae5", col:"#065f46" },
  "Colour Grading":            { bg:"#fce7f3", col:"#9d174d" },
  "Sound Design":              { bg:"#fef9c3", col:"#713f12" },
  "Music Production":          { bg:"#e0e7ff", col:"#3730a3" },
  "Photography":               { bg:"#dcfce7", col:"#166534" },
  "Copywriting":               { bg:"#f3f4f6", col:"#374151" },
  "Production Management":     { bg:"#ffedd5", col:"#9a3412" },
  "Line Producing":            { bg:"#f0fdf4", col:"#14532d" },
  "DOP / Cinematography":      { bg:"#e0f2fe", col:"#0c4a6e" },
  "AI / Tech":                 { bg:"#ecfeff", col:"#164e63" },
  "Illustration":              { bg:"#fdf4ff", col:"#701a75" },
  "Storyboard / Animatic":     { bg:"#f7fee7", col:"#365314" },
  "Strategy / CD":             { bg:"#1e293b", col:"#f1f5f9" },
  "Account / Client Services": { bg:"#f1f5f9", col:"#334155" },
  "Miscellaneous":             { bg:"#f8fafc", col:"#64748b" },
};

// ── Global Search ─────────────────────────────────────────────────────────────
const GlobalSearch = ({ q, warm, newL, ag, br, crew, fl, ct, onGo }) => {
  const ql = q.toLowerCase();
  const hit = (v) => v && v.toLowerCase().includes(ql);
  const results = [
    ...warm.filter((x) => hit(x.name)||hit(x.company)||hit(x.role)||hit(x.notes)).map((x) => ({ tab:"warm", label:x.name, sub:x.role+" — "+x.company, badge:x.stage })),
    ...newL.filter((x) => hit(x.name)||hit(x.company)||hit(x.role)||hit(x.notes)).map((x) => ({ tab:"new", label:x.name, sub:x.role+" — "+x.company, badge:x.stage })),
    ...ag.filter((x) => hit(x.name)||hit(x.contact)||hit(x.notes)).map((x) => ({ tab:"agencies", label:x.name, sub:x.contact, badge:x.status })),
    ...br.filter((x) => hit(x.brand)||hit(x.contactToFind)||hit(x.notes)).map((x) => ({ tab:"brands", label:x.brand, sub:x.contactToFind, badge:x.status })),
    ...crew.filter((x) => hit(x.name)||hit(x.specialty)||hit(x.location)||hit(x.notes)||hit(x.email)).map((x) => ({ tab:"crew", label:x.name, sub:x.specialty+" · "+x.location, badge:x.rate })),
    ...fl.filter((x) => hit(x.company)||hit(x.role)).map((x) => ({ tab:"freelance", label:x.company, sub:x.role, badge:"Freelance" })),
    ...ct.filter((x) => hit(x.company)||hit(x.role)).map((x) => ({ tab:"contract", label:x.company, sub:x.role, badge:"Contract" })),
  ];
  if (!results.length) return (
    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", boxShadow:"0 8px 24px rgba(0,0,0,.08)", zIndex:200, fontSize:12, color:C.muted }}>
      No results for "{q}"
    </div>
  );
  return (
    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, maxHeight:360, overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,.08)", zIndex:200 }}>
      {results.slice(0,20).map((r, i) => (
        <div key={i} onClick={() => onGo(r.tab)} style={{ padding:"8px 14px", borderBottom:`1px solid ${C.border}`, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}
          onMouseEnter={(e) => e.currentTarget.style.background="#f9f9f9"} onMouseLeave={(e) => e.currentTarget.style.background="#fff"}>
          <div>
            <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{r.label}</span>
            <span style={{ fontSize:11, color:C.muted, marginLeft:6 }}>{r.sub}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:9, color:C.muted, background:C.border, borderRadius:4, padding:"1px 5px" }}>{r.badge}</span>
            <span style={{ fontSize:9, color:R, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>{r.tab}</span>
          </div>
        </div>
      ))}
      {results.length > 20 && <div style={{ padding:"8px 14px", fontSize:11, color:C.muted }}>{results.length-20} more results — narrow your search</div>}
    </div>
  );
};

// ── Overview ──────────────────────────────────────────────────────────────────
const Overview = ({ warm, newL, ag, br, fl, ct, pencils, onPencilChange, onGoToWarm }) => {
  // Availability: latest Booking endDate
  const parseDate = (s) => { if(!s)return null; const p=s.split('/'); if(p.length!==3)return null; return new Date(2000+parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])); };
  const latestBooking = (pencils||[]).filter(p=>p.type==='Booking'&&p.endDate).sort((a,b)=>parseDate(b.endDate)-parseDate(a.endDate))[0];
  const availFrom = latestBooking ? (() => { const d=parseDate(latestBooking.endDate); d.setDate(d.getDate()+1); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`; })() : null;
  const availDays = latestBooking ? Math.ceil((parseDate(latestBooking.endDate)-new Date())/86400000) : -1;
  const upcoming = warm.filter((w) => { const d = daysUntil(w.nextActionDate); return d >= -3 && d <= 14; }).sort((a,b) => daysUntil(a.nextActionDate)-daysUntil(b.nextActionDate));
  const stale = warm.filter((w) => daysUntil(w.nextActionDate) < -7 && w.stage !== "Won" && w.stage !== "Archived");
  const staleAgencies = (ag||[]).filter(a => {
    if (a.status!=='Contact found' || !a.contact || a.contact==='TBD') return false;
    const an = (a.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return !warm.some(w => {
      const wc = (w.company||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      return an.length>3 && (wc.includes(an.substring(0,6)) || an.includes(wc.substring(0,6)));
    });
  }).slice(0,6);
  const pipeData = ["Radar","Reached out to me","Replied","Won"].map((s) => ({ name:s, v:warm.filter((w) => w.stage===s).length }));
  const allJobs = [...fl, ...ct];
  const appliedJobs = allJobs.filter((j) => ["Applied","No Response","Conversation","Offer","Rejected"].includes(j.status||"New"));
  const appData = ["Applied","No Response","Conversation","Offer","Rejected"].map((s) => ({ name:s, v:appliedJobs.filter((j) => j.status===s).length })).filter((d) => d.v>0);
  const newJobs = fl.filter((j) => j.isNew).length + ct.filter((j) => j.isNew).length;
  const pencils = _pencils || [];
  const curYear = new Date().getFullYear();
  const realPencils = pencils.filter(p=>!p.__sentinel);
  const shownYears = Array.from(new Set(pencils.map(p=>p.year||curYear))).sort((a,b)=>b-a);
  const handleNewYear = () => { const maxY=shownYears.length?Math.max(...shownYears):curYear; const newY=maxY+1; if(shownYears.includes(newY))return; onPencilChange&&onPencilChange([...pencils,{id:'__y'+newY,__sentinel:true,year:newY}]); };
  const [addingForYear, setAddingForYear] = useState(null);
  const [hiddenYears, setHiddenYears] = useState([]);
  const [confirmDeleteYear, setConfirmDeleteYear] = useState(null);
  const toggleHideYear = (yr) => setHiddenYears(h=>h.includes(yr)?h.filter(y=>y!==yr):[...h,yr]);
  const deleteYear = (yr) => { onPencilChange&&onPencilChange(pencils.filter(p=>(p.year||curYear)!==yr)); setConfirmDeleteYear(null); };
  const [newPen, setNewPen] = useState({ person:"", company:"", rate:"", startDate:"", endDate:"", type:"Pencil", year:new Date().getFullYear() });
  const savePen = () => {
    if (!newPen.company||!newPen.startDate||!newPen.endDate) return;
    onPencilChange&&onPencilChange([...pencils, { ...newPen, id:uid() }]);
    setNewPen({ person:"", company:"", rate:"", startDate:"", endDate:"", type:"Pencil", year:addingForYear||curYear });
    setAddingForYear(null);
  };
  const togglePenType = (id) => { onPencilChange&&onPencilChange(pencils.map(p=>p.id===id?{...p,type:p.type==="Pencil"?"Booking":p.type==="Booking"?"Time Off":"Pencil"}:p)); };
  const deletePen = (id) => { onPencilChange&&onPencilChange(pencils.filter(p=>p.id!==id)); };
  const [editPenId,setEditPenId] = useState(null);
  const [editPen,setEditPen] = useState(null);
  const startEditPen = (p) => { setEditPenId(p.id); setEditPen({...p}); };
  const saveEditPen = () => { if(editPen){ onPencilChange&&onPencilChange(pencils.map(p=>p.id===editPenId?{...editPen}:p)); } setEditPenId(null); setEditPen(null); };
  const cancelEditPen = () => { setEditPenId(null); setEditPen(null); };
  const movePen = (id,dir) => { const idx=pencils.findIndex(p=>p.id===id); if(idx<0)return; const arr=[...pencils]; const ni=idx+dir; if(ni<0||ni>=arr.length)return; [arr[idx],arr[ni]]=[arr[ni],arr[idx]]; onPencilChange&&onPencilChange(arr); };
  const tNow = new Date(); tNow.setHours(0,0,0,0);
  const tWS = new Date(tNow.getFullYear(), 0, 1); // Jan 1 of current year
  const tWE = new Date(tNow.getFullYear(), 11, 31); // Dec 31 of current year
  const tSpan = tWE - tWS;
  const tPct = (d) => (Math.max(0,Math.min(100,((d-tWS)/tSpan)*100)).toFixed(1)+'%');
  const tBar = (en) => { const s=parseDate(en.startDate),e=parseDate(en.endDate); if(!s||!e)return null; const l=Math.max(0,((s-tWS)/tSpan)*100),r=Math.min(100,((e-tWS)/tSpan)*100); return {left:l.toFixed(1)+'%',width:Math.max(1.5,r-l).toFixed(1)+'%'}; };
  const tMonths=[]; { const d=new Date(tWS); d.setDate(1); if(d<tWS)d.setMonth(d.getMonth()+1); while(d<=tWE){ tMonths.push({label:d.toLocaleString('en',{month:'short'}).toUpperCase(),pct:tPct(d)}); d.setMonth(d.getMonth()+1); } }
  const yearTimelines = {};
  shownYears.forEach(yr => {
    const ws=new Date(yr,0,1),we=new Date(yr,11,31),sp=we-ws;
    const tn=new Date(); tn.setHours(0,0,0,0);
    const pct=(d)=>(Math.max(0,Math.min(100,((d-ws)/sp)*100)).toFixed(1)+'%');
    const bar=(en)=>{ const s=parseDate(en.startDate),e=parseDate(en.endDate); if(!s||!e)return null; const l=Math.max(0,((s-ws)/sp)*100),r=Math.min(100,((e-ws)/sp)*100); return {left:l.toFixed(1)+'%',width:Math.max(1.5,r-l).toFixed(1)+'%'}; };
    const months=[]; let md=new Date(yr,0,1);
    while(md.getFullYear()===yr){ months.push({label:md.toLocaleString('en',{month:'short'}).toUpperCase(),pct:pct(md)}); md.setMonth(md.getMonth()+1); }
    yearTimelines[yr]={pct,bar,months,tn};
  });
  return (
    <div style={{ padding:"16px 20px" }}>
      {availFrom && (
        <div style={{ display:"flex", alignItems:"center", gap:10, background:availDays<=14?"#fef3c7":availDays<=30?"#f0fdf4":"#f8fafc", border:`1px solid ${availDays<=14?"#fcd34d":availDays<=30?"#86efac":"#e2e8f0"}`, borderRadius:8, padding:"10px 16px", marginBottom:16 }}>
          <span style={{ fontSize:18 }}>{availDays<=14?"🔴":availDays<=30?"🟠":"🟢"}</span>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:availDays<=14?R:availDays<=30?"#d97706":"#059669" }}>
              {availDays<0?"Available now":`Available from ${availFrom}`}
            </div>
            <div style={{ fontSize:11, color:C.muted }}>
              {latestBooking?.`${latestBooking.company||''}` && `Current booking: ${latestBooking.company} → ${latestBooking.endDate}`}
            </div>
          </div>
        </div>
      )}
      <div className="stat-card-row" style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        {[
          { label:"Pipeline", val:warm.filter((w) => w.stage!=="Archived").length, sub:`${warm.filter((w) => ["Had Call","Brief Pending","Proposal"].includes(w.stage)).length} in conversation` },
          { label:"Archived", val:warm.filter((w) => w.stage==="Archived").length, sub:"not active" },
          { label:"Agencies & Studios", val:ag.length, sub:`${ag.filter((a) => a.status==="In Warm Leads").length} in pipeline` },
          { label:"Brands", val:br.length, sub:`${br.filter((b) => b.warmIn==="Yes").length} warm contacts` },
          { label:"Applied Jobs", val:appliedJobs.length, sub:`${appliedJobs.filter((j) => j.status==="Conversation"||j.status==="Offer").length} active` },
          stale.length > 0 ? { label:"Stale Leads", val:stale.length, sub:"overdue >7 days", alert:true } : null,
          newJobs > 0 ? { label:"New Jobs", val:newJobs, sub:"from last sweep" } : null,
        ].filter(Boolean).map((s, i) => (
          <div key={i} className="stat-card" style={{ background: s.alert ? "#fff5f5" : "#fff", border:`1px solid ${s.alert ? R+"44" : C.border}`, borderRadius:8, padding:"14px 18px", minWidth:110 }}>
            <div style={{ fontSize:26, fontWeight:700, fontFamily:"'Lora',serif", color: s.alert ? R : R }}>{s.val}</div>
            <div style={{ fontSize:11, fontWeight:600, color: s.alert ? R : C.text, marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {stale.length > 0 && (
        <div style={{ background:"#fff5f5", border:`1px solid ${R}33`, borderRadius:8, padding:"12px 16px", marginTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:R, fontFamily:"'Lora',serif" }}>
              ⚠️ {stale.length} lead{stale.length!==1?"s":""} need follow-up
            </div>
            <button onClick={onGoToWarm} style={{ background:R, color:"#fff", border:"none", borderRadius:5, padding:"4px 12px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
              Go to Warm Leads →
            </button>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {stale.map(w => {
              const d = Math.abs(daysUntil(w.nextActionDate));
              return (
                <div key={w.id} onClick={onGoToWarm} style={{ background:"#fff", border:`1px solid ${R}44`, borderRadius:6, padding:"6px 10px", cursor:"pointer", minWidth:160 }}>
                  <div style={{ fontSize:11, fontWeight:700 }}>{w.name||"(no name)"}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{w.company||""}</div>
                  <div style={{ fontSize:10, color:R, marginTop:2, fontWeight:600 }}>{d}d overdue</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {staleAgencies.length>0 && (
        <div style={{ background:"#fffbf0", border:"1px solid #f59e0b66", borderRadius:8, padding:"12px 16px", marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#92400e", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Agencies with contacts — no outreach yet</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {staleAgencies.map(a=>(
              <div key={a.id} className="stale-card" style={{ background:"#fff", border:"1px solid #f59e0b44", borderRadius:6, padding:"6px 10px", minWidth:150 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{a.name}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>{(a.contact||'').split(' (')[0]}</div>
                <div style={{ fontSize:10, color:"#b45309", marginTop:2, fontWeight:600 }}>No warm lead started</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-grid-3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:12 }}>Next Actions — 14 days</div>
          {upcoming.length === 0 && <div style={{ fontSize:12, color:C.muted }}>No upcoming actions.</div>}
          {upcoming.map((w) => {
            const d = daysUntil(w.nextActionDate);
            const dc = d<0 ? R : d<=2 ? R : d<=7 ? "#d97706" : C.muted;
            return (
              <div key={w.id} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:8, marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                  <div><span style={{ fontSize:12, fontWeight:600 }}>{w.name}</span><span style={{ fontSize:11, color:C.muted }}> — {w.company}</span></div>
                  <span style={{ fontSize:10, fontWeight:700, color:dc, whiteSpace:"nowrap" }}>{d<0 ? `${Math.abs(d)}d over` : d===0 ? "Today" : `${d}d`}</span>
                </div>
                {w.nextAction && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{w.nextAction}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:16, overflow:"hidden" }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:12 }}>Applications ({appliedJobs.length})</div>
          {appliedJobs.length === 0 && <div style={{ fontSize:12, color:C.muted }}>No applications yet. Hit Applied on a job.</div>}
          {appliedJobs.map((j) => {
            const sc = j.status==="Conversation"||j.status==="Offer" ? "#059669" : j.status==="No Response" ? "#d97706" : j.status==="Passed"||j.status==="Rejected" ? C.muted : "#2563eb";
            const appliedDaysAgo = j.appliedDate ? Math.floor((new Date()-(() => { const p=j.appliedDate.split('/'); return new Date(2000+parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])); })())/86400000) : null;
            const isStale = appliedDaysAgo!==null && appliedDaysAgo>=14 && (j.status==="Applied"||j.status==="No Response");
            return (
              <div key={j.id} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:8, marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.company}</div>
                      {isStale && <span style={{ fontSize:9, background:"#fef3c7", color:"#92400e", border:"1px solid #fcd34d", borderRadius:4, padding:"1px 5px", whiteSpace:"nowrap", flexShrink:0 }}>{appliedDaysAgo}d no reply</span>}
                    </div>
                    <div style={{ fontSize:11, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.role}</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                    <span style={{ fontSize:9, fontWeight:700, color:sc, background:sc+"18", borderRadius:3, padding:"1px 5px", whiteSpace:"nowrap" }}>{j.status}</span>
                    <span style={{ fontSize:9, color:C.muted }}>{j.appliedDate||j.date||"—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:10 }}>Pipeline</div>
          <MiniBar data={pipeData} />
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginTop:16, marginBottom:10 }}>Applications Status</div>
          <MiniBar data={appData} />
        </div>
      </div>

      {stale.length > 0 && (
        <div style={{ background:"#fff5f5", border:`1px solid ${R}33`, borderRadius:8, padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:R, marginBottom:10 }}>Stale Leads — overdue more than 7 days ({stale.length})</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {stale.map((w) => {
              const d = Math.abs(daysUntil(w.nextActionDate));
              return (
                <div key={w.id} style={{ background:"#fff", border:`1px solid ${R}33`, borderRadius:6, padding:"6px 10px" }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{w.name}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{w.company}</div>
                  <div style={{ fontSize:10, color:R, marginTop:2, fontWeight:600 }}>{d}d overdue · {w.stage}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── Current Availability ────────────────────────────────────────────────────── */}
      <div style={{ marginTop:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'Lora',serif" }}>Bookings {'&'} Pencils</div>
          <button onClick={handleNewYear} style={{ background:"none", color:R, border:`1px solid ${R}`, borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>+ New Year</button>
        </div>
        {shownYears.map(yr => {
          const yrEntries = realPencils.filter(p=>(p.year||curYear)===yr);
          const tl = yearTimelines[yr]||{};
          const tPct_y=tl.pct, tBar_y=tl.bar, tMonths_y=tl.months||[], tNow_y=tl.tn||new Date();
          return (
          <div key={yr} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:"#fafafa" }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:"'Lora',serif" }}>Bookings {'&'} Pencils {yr}</div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button onClick={()=>toggleHideYear(yr)} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 8px", cursor:"pointer", fontSize:10 }}>{hiddenYears.includes(yr)?'Show ▼':'Hide ▲'}</button>
                {confirmDeleteYear===yr ? (
                  <span style={{ fontSize:10, display:"flex", gap:4, alignItems:"center" }}>
                    <span style={{ color:C.text, fontWeight:600 }}>Sure?</span>
                    <button onClick={()=>deleteYear(yr)} style={{ background:R, color:"#fff", border:"none", borderRadius:4, padding:"2px 8px", cursor:"pointer", fontSize:10, fontWeight:700 }}>Yes, delete</button>
                    <button onClick={()=>setConfirmDeleteYear(null)} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 7px", cursor:"pointer", fontSize:10 }}>No</button>
                  </span>
                ) : (
                  <button onClick={()=>setConfirmDeleteYear(yr)} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"3px 8px", cursor:"pointer", fontSize:10 }}>Delete year</button>
                )}
                {!hiddenYears.includes(yr) && <button onClick={()=>{setAddingForYear(yr);setNewPen(p=>({...p,year:yr}));}} style={{ background:R, color:"#fff", border:"none", borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>+ Add</button>}
              </div>
            </div>
        {!hiddenYears.includes(yr) && addingForYear===yr && (
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:"#fff8f7", display:"flex", flexWrap:"wrap", gap:8, alignItems:"flex-end" }}>
            {newPen.type!=="Time Off" && [["CONTACT","person","e.g. Tommaso",90],["COMPANY","company","Monks",120],[String.fromCharCode(8364)+"/DAY","rate","600",65]].map(([lbl,key,ph,w])=>(
              <div key={key} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>{lbl}</span>
                <input value={newPen[key]} onChange={e=>setNewPen(p=>({...p,[key]:e.target.value}))} placeholder={ph} style={{ border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 8px", fontSize:12, width:w, outline:"none" }} />
              </div>
            ))}
            {newPen.type==="Time Off" && (
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>LABEL (optional)</span>
                <input value={newPen.company||""} onChange={e=>setNewPen(p=>({...p,company:e.target.value}))} placeholder="Holiday, Sick, etc." style={{ border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 8px", fontSize:12, width:120, outline:"none" }} />
              </div>
            )}
            {[["FROM (DD/MM/YY)","startDate","15/06/26",105],["TO (DD/MM/YY)","endDate","31/08/26",105]].map(([lbl,key,ph,w])=>(
              <div key={key} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>{lbl}</span>
                <input value={newPen[key]} onChange={e=>setNewPen(p=>({...p,[key]:e.target.value}))} placeholder={ph} style={{ border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 8px", fontSize:12, width:w, outline:"none" }} />
              </div>
            ))}
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>TYPE</span>
              <button onClick={()=>setNewPen(p=>({...p,type:p.type==="Pencil"?"Booking":p.type==="Booking"?"Time Off":"Pencil"}))} style={{ background:newPen.type==="Booking"?"#10b981":newPen.type==="Time Off"?"#6366f1":"#f59e0b", color:"#fff", border:"none", borderRadius:5, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, width:86 }}>{newPen.type==="Booking"?"✓ Booking":newPen.type==="Time Off"?"🌴 Time Off":"✏ Pencil"}</button>
            </div>
            <div style={{ display:"flex", gap:6, paddingBottom:1 }}>
              <button onClick={savePen} style={{ background:R, color:"#fff", border:"none", borderRadius:5, padding:"5px 14px", cursor:"pointer", fontSize:11, fontWeight:700 }}>Save</button>
              <button onClick={()=>setAddingForYear(null)} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 10px", cursor:"pointer", fontSize:11 }}>Cancel</button>
            </div>
          </div>
        )}

        {!hiddenYears.includes(yr) && yrEntries.length===0 && addingForYear!==yr && (
          <div style={{ padding:"20px 16px", fontSize:12, color:C.muted }}>No pencils or bookings yet — click + Add to log one.</div>
        )}

        {!hiddenYears.includes(yr) && yrEntries.length>0 && (
          <div>
            {/* Scrollable timeline wrapper */}
            <div style={{ overflowX:"auto" }}>
            <div style={{ minWidth:900 }}>
            {/* Timeline header */}
            <div style={{ display:"flex" }}>
              <div style={{ width:230, flexShrink:0, borderRight:`1px solid ${C.border}`, background:"#f9f9f9" }} />
              <div style={{ flex:1, position:"relative", height:26, background:"#f9f9f9", borderBottom:`1px solid ${C.border}` }}>
                {tMonths_y.map((m,i)=>(
                  <div key={i} style={{ position:"absolute", left:m.pct, top:6, fontSize:9, fontWeight:700, color:C.muted, whiteSpace:"nowrap", transform:"translateX(-50%)", pointerEvents:"none" }}>{m.label}</div>
                ))}
                <div style={{ position:"absolute", left:tPct_y(tNow_y), top:0, bottom:0, width:2, background:R, opacity:0.5 }} />
              </div>
            </div>
            {/* Rows */}
            {yrEntries.map((p,pIdx) => {
              if(editPenId===p.id && editPen) return (
                <div key={p.id} style={{ display:"flex", flexWrap:"wrap", gap:6, padding:"8px 12px", borderBottom:`1px solid ${C.border}`, background:"#fffbf5", alignItems:"flex-end" }}>
                  {[["CONTACT","person","e.g. Tommaso",90],["COMPANY","company","Monks",110],[String.fromCharCode(8364)+"/DAY","rate","600",65],["FROM","startDate","15/06/26",100],["TO","endDate","31/08/26",100]].map(([lbl,key,ph,w])=>(
                    <div key={key} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>{lbl}</span>
                      <input value={editPen[key]||""} onChange={e=>setEditPen(p=>({...p,[key]:e.target.value}))} placeholder={ph} style={{ border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 7px", fontSize:11, width:w, outline:"none" }} />
                    </div>
                  ))}
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    <span style={{ fontSize:9, color:C.muted, fontWeight:700 }}>TYPE</span>
                    <button onClick={()=>setEditPen(p=>({...p,type:p.type==="Pencil"?"Booking":p.type==="Booking"?"Time Off":"Pencil"}))} style={{ background:editPen.type==="Booking"?"#10b981":editPen.type==="Time Off"?"#6366f1":"#f59e0b", color:"#fff", border:"none", borderRadius:5, padding:"4px 9px", cursor:"pointer", fontSize:10, fontWeight:700, width:86 }}>{editPen.type==="Booking"?"✓ Booking":editPen.type==="Time Off"?"🌴 Time Off":"✏ Pencil"}</button>
                  </div>
                  <div style={{ display:"flex", gap:5, paddingBottom:1 }}>
                    <button onClick={saveEditPen} style={{ background:R, color:"#fff", border:"none", borderRadius:5, padding:"4px 12px", cursor:"pointer", fontSize:10, fontWeight:700 }}>Save</button>
                    <button onClick={cancelEditPen} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 9px", cursor:"pointer", fontSize:10 }}>Cancel</button>
                  </div>
                </div>
              );
              const bar = tBar_y(p);
              const isBook = p.type==="Booking";
              const isTimeOff = p.type==="Time Off";
              const col = isBook ? "#10b981" : isTimeOff ? "#6366f1" : "#f59e0b";
              return (
                <div key={p.id} style={{ display:"flex", alignItems:"stretch", borderBottom:`1px solid ${C.border}`, minHeight:40 }}>
                  <div style={{ width:230, flexShrink:0, padding:"6px 6px 6px 8px", borderRight:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:1, flexShrink:0 }}>
                      <button onClick={()=>movePen(p.id,-1)} disabled={pIdx===0} style={{ background:"none", border:"none", cursor:pIdx===0?"default":"pointer", color:pIdx===0?C.border:C.muted, fontSize:10, padding:"1px 3px", lineHeight:1 }}>▴</button>
                      <button onClick={()=>movePen(p.id,1)} disabled={pIdx===yrEntries.length-1} style={{ background:"none", border:"none", cursor:pIdx===yrEntries.length-1?"default":"pointer", color:pIdx===yrEntries.length-1?C.border:C.muted, fontSize:10, padding:"1px 3px", lineHeight:1 }}>▾</button>
                    </div>
                    <button onClick={()=>togglePenType(p.id)} style={{ background:col, color:"#fff", border:"none", borderRadius:4, padding:"2px 6px", cursor:"pointer", fontSize:9, fontWeight:700, flexShrink:0, whiteSpace:"nowrap" }}>{isBook?"✓ Booking":isTimeOff?"🌴 Time off":"✏ Pencil"}</button>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.company||"—"}</div>
                      <div style={{ fontSize:10, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{[p.person, p.rate?(String.fromCharCode(8364)+p.rate+'/d'):null].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div style={{ flex:1, position:"relative" }}>
                    <div style={{ position:"absolute", left:tPct(tNow), top:0, bottom:0, width:2, background:R, opacity:0.15 }} />
                    {bar && (
                      <div style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left:bar.left, width:bar.width, height:18, background:(isBook||isTimeOff)?col:col+'28', border:(isBook||isTimeOff)?"none":`2px dashed ${col}`, borderRadius:4, display:"flex", alignItems:"center", overflow:"hidden" }}>
                        <span style={{ fontSize:9, color:(isBook||isTimeOff)?"#fff":col, fontWeight:700, padding:"0 5px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.startDate}{p.endDate?' → '+p.endDate:''}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:4, padding:"0 8px" }}>
                    <button onClick={()=>startEditPen(p)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:12, lineHeight:1, padding:2 }}>✏</button>
                    <button onClick={()=>deletePen(p.id)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:16, lineHeight:1, padding:2 }}>×</button>
                  </div>
                </div>
              );
            })}
            </div>
            </div>
          </div>
        )}
          </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Warm Leads Tab ─────────────────────────────────────────────────────────────
const WARM_STAGES = ["Radar","Reached out to me","Replied","Won","Archived"];
const TIER_OPTS = ["A – Agency","A – Studio","B – Brand","B – Agency","C – Studio","C – Agency","Other"];

const WarmRow = ({ l, onUpdate, onStageChange, onArchive, onDelete, stageCol, daysUntilNA, daysSince }) => {
  const du = daysUntilNA(l.nextActionDate);
  const dc = du!==null&&du<0 ? R : du!==null&&du<=3 ? R : du!==null&&du<=7 ? "#d97706" : C.muted;
  const rowBg = l.starred ? "#fffbeb" : "#fff";
  return (
    <tr style={{ borderBottom:`1px solid ${C.border}`, background:rowBg }}>
      <td style={{ padding:"8px 6px", textAlign:"center", verticalAlign:"top", width:28 }}>
        <button onClick={()=>onUpdate(l.id,"starred",!l.starred)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, lineHeight:1, padding:0, color:l.starred?"#f59e0b":C.border }}>{l.starred?"★":"☆"}</button>
      </td>
      <td className="sticky-col-td" style={{ padding:"8px 10px", verticalAlign:"top", minWidth:140, backgroundColor:rowBg }}>
        <EditCell value={l.name} onSave={v=>onUpdate(l.id,"name",v)} bold />
        <div style={{ marginTop:3 }}>
          <span style={{ fontSize:10, background:stageCol(l.stage)+"22", color:stageCol(l.stage), border:`1px solid ${stageCol(l.stage)}44`, borderRadius:4, padding:"1px 6px", fontWeight:600 }}>{l.stage||"Radar"}</span>
        </div>
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", minWidth:120 }}>
        <EditCell value={l.company} onSave={v=>onUpdate(l.id,"company",v)} />
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}><EditCell value={l.role} onSave={v=>onUpdate(l.id,"role",v)} placeholder="Role" /></div>
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", width:160 }}>
        <Sel value={l.stage||"Radar"} opts={WARM_STAGES} onChange={v=>onStageChange(l.id,v)} cf={stageCol} />
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", width:110 }}>
        <EditCell value={l.lastContact} onSave={v=>onUpdate(l.id,"lastContact",v)} placeholder="DD/MM/YY" />
        {l.lastContact && <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{daysSince(l.lastContact)}d ago</div>}
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", minWidth:180 }}>
        <EditCell value={l.nextAction} onSave={v=>onUpdate(l.id,"nextAction",v)} multi placeholder="What needs doing..." />
        <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:5, flexWrap:"wrap" }}>
          {[3,7,14].map(n=>(
            <button key={n} onClick={()=>onUpdate(l.id,"nextActionDate",plusDays(n))} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 7px", cursor:"pointer", fontSize:10, fontWeight:600, color:C.muted }}>+{n}d</button>
          ))}
          {l.nextActionDate && <>
            <span style={{ fontSize:10, color:du<0?R:du<=2?"#d97706":"#059669", fontWeight:600 }}>{du<0?`${Math.abs(du)}d overdue`:du===0?"today":`in ${du}d`}</span>
            <button onClick={()=>onUpdate(l.id,"nextActionDate","")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:C.muted, padding:0 }} title="Clear">×</button>
          </>}
        </div>
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", minWidth:160 }}>
        <EditCell value={l.notes} onSave={v=>onUpdate(l.id,"notes",v)} multi placeholder="Notes..." />
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", width:80 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          <button onClick={()=>onArchive(l.id,"")} style={{ background:"#f1f5f9", color:"#475569", border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 8px", cursor:"pointer", fontSize:10, fontWeight:600 }}>Archive</button>
          <DeleteBtn onDelete={()=>onDelete(l.id)} />
        </div>
      </td>
    </tr>
  );
};

const WarmTab = ({ leads, onUpdate, onStageChange, onAdd, onDelete, onArchive }) => {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const active   = leads.filter(l => l.stage !== "Archived");
  const archived = leads.filter(l => l.stage === "Archived");
  const won  = active.filter(l => l.stage === "Won");
  const rest = active.filter(l => l.stage !== "Won");
  const nowD = new Date();
  const parseDT = (s) => { if(!s) return null; const p=s.split('/'); if(p.length!==3) return null; return new Date(2000+parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])); };
  const daysSince = (d) => { const dt=parseDT(d); return dt ? Math.floor((nowD-dt)/86400000) : 999; };
  const daysUntilNA = (d) => { const dt=parseDT(d); return dt ? Math.ceil((dt-nowD)/86400000) : null; };
  const stageCol = (s) => s==="Won"?"#10b981":s==="Reached out to me"?"#6366f1":s==="Replied"?"#f59e0b":C.muted;
  const qFilter = (l) => !q || [(l.name||''),(l.company||''),(l.role||''),(l.notes||''),(l.email||'')].some(v=>v.toLowerCase().includes(q.toLowerCase()));
  const sortFn = (a,b) => {
    if(!!b.starred !== !!a.starred) return b.starred ? 1 : -1;
    const aDue=daysUntilNA(a.nextActionDate), bDue=daysUntilNA(b.nextActionDate);
    const aOver=aDue!==null&&aDue<0, bOver=bDue!==null&&bDue<0;
    if(aOver!==bOver) return aOver?-1:1;
    if(aOver&&bOver) return aDue-bDue;
    return daysSince(b.lastContact)-daysSince(a.lastContact);
  };
  const sorted = [...rest].filter(qFilter).sort(sortFn);
  const archivedFiltered = archived.filter(qFilter);
  const rowProps = { onUpdate, onStageChange, onArchive, onDelete, stageCol, daysUntilNA, daysSince };
  const TH = [{label:"★",w:28},{label:"NAME",w:140},{label:"COMPANY",w:120},{label:"STAGE",w:160},{label:"LAST CONTACT",w:110},{label:"NEXT ACTION",w:180},{label:"NOTES",w:160},{label:"",w:80}];
  const thead = (<thead><tr style={{ borderBottom:`2px solid ${C.border}`, background:"#fafafa" }}>{TH.map((h,i)=><th key={i} className={i===1?"sticky-col-th":""} style={{...TH_STYLE,width:h.w}}>{h.label}</th>)}</tr></thead>);
  return (
    <div style={{ padding:"16px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts..." style={{ border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 12px", fontSize:12, flex:1, minWidth:180, outline:"none" }} />
        <span style={{ fontSize:11, color:C.muted }}>{rest.length} active{archived.length>0 && <button onClick={()=>setShowArchived(!showArchived)} style={{ marginLeft:8, background:"none", border:"none", cursor:"pointer", fontSize:11, color:showArchived?"#7c3aed":C.muted, textDecoration:"underline", padding:0 }}>{showArchived?"Hide":"Show"} archived ({archived.length})</button>}</span>
        <button onClick={()=>onAdd()} style={{ background:R, color:"#fff", border:"none", borderRadius:6, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>+ Add</button>
      </div>
      {won.length>0 && (<div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#10b981", marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>✓ Active Bookings</div>
        <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}>{thead}<tbody>{won.map(l=><WarmRow key={l.id} l={l} {...rowProps} />)}</tbody></table></div>
      </div>)}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}>
          {thead}
          <tbody>
            {sorted.length===0 && <tr><td colSpan={8} style={{ padding:20, textAlign:"center", color:C.muted, fontSize:12 }}>No contacts. Hit + Add to start.</td></tr>}
            {sorted.map(l=><WarmRow key={l.id} l={l} {...rowProps} />)}
          </tbody>
        </table>
      </div>
      {showArchived && archivedFiltered.length>0 && (<div style={{ marginTop:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Archived</div>
        <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860, opacity:0.6 }}>{thead}<tbody>{archivedFiltered.map(l=><WarmRow key={l.id} l={l} {...rowProps} />)}</tbody></table></div>
      </div>)}
    </div>
  );
};


const JobsTab = ({ data, onUpdate, onAdd, type, onApply, onUndo, onPass, onClose, onDelete }) => {
  const active  = data.filter((j) => ["New","Researching"].includes(j.status||"New"));
  const applied = data.filter((j) => ["Applied","No Response","Conversation","Offer","Rejected"].includes(j.status||"New"));
  const passed  = data.filter((j) => j.status === "Passed");
  const closed  = data.filter((j) => j.status === "Closed");
  const THead = () => (
    <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
      {["COMPANY","ROLE","LOCATION","SECTOR","PRIORITY","STATUS","NOTES","SOURCE","SWEPT","APPLIED",""].map((h,i) => <th key={i} className={i===0?"sticky-col-th":""} style={TH_STYLE}>{h}</th>)}
    </tr></thead>
  );
  const JobRow = ({ j }) => (
    <tr style={{ borderBottom:`1px solid ${C.border}`, background: j.isNew ? "#fff9f8" : "#fff" }}>
      <td className="sticky-col-td" style={{ padding:"8px 10px", verticalAlign:"top", backgroundColor: j.isNew ? "#fff9f8" : "#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          {j.isNew && <span style={{ background:R, color:"#fff", borderRadius:4, padding:"1px 4px", fontSize:9, fontWeight:700 }}>NEW</span>}
          <EditCell value={j.company||""} onSave={(v) => onUpdate(j.id,"company",v)} />
        </div>
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}><EditCell value={j.role||""} onSave={(v) => onUpdate(j.id,"role",v)} /></td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}><EditCell value={j.location||""} onSave={(v) => onUpdate(j.id,"location",v)} /></td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}><EditCell value={j.sector||""} onSave={(v) => onUpdate(j.id,"sector",v)} /></td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
        <Sel value={j.priority||"Medium"} opts={["High","Medium","Low"]} onChange={(v) => onUpdate(j.id,"priority",v)} cf={p => p==="High"?R:p==="Medium"?"#d97706":C.muted} />
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
        <Sel value={j.status||"New"} opts={["New","Researching","Applied","No Response","Conversation","Offer","Rejected","Closed"]} onChange={(v) => { onUpdate(j.id,"status",v); if(v==="Applied"&&!j.appliedDate){ const d=new Date(); onUpdate(j.id,"appliedDate",String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()).slice(2)); } }} cf={jobCol} />
      </td>
      <td style={{ padding:"8px 10px", minWidth:180, maxWidth:360, verticalAlign:"top", resize:"horizontal", overflow:"hidden" }}><EditCell value={j.notes} onSave={(v) => onUpdate(j.id,"notes",v)} multi /></td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
        <WebsiteCell value={j.source||""} onSave={(v) => onUpdate(j.id,"source",v)} />
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", whiteSpace:"nowrap" }}><span style={{ fontSize:11, color:C.muted }}>{j.date||"—"}</span></td>
      <td style={{ padding:"8px 10px", verticalAlign:"top", whiteSpace:"nowrap" }}>
        <span style={{ fontSize:11, color: j.appliedDate ? "#059669" : C.muted+"55" }}>{j.appliedDate||"—"}</span>
      </td>
      <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
        {j.appliedDate ? (
          <button onClick={() => onUndo(j.id)} style={{ background:"#f8fafc", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>Undo</button>
        ) : j.status === "Passed" ? (
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}><span style={{ fontSize:10, color:C.muted, fontStyle:"italic" }}>Passed</span><button onClick={() => onDelete&&onDelete(j.id)} style={{ background:"none", color:C.muted, border:"none", cursor:"pointer", fontSize:9, padding:0, opacity:0.5 }}>× delete</button></div>
        ) : j.status === "Closed" ? (
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}><span style={{ fontSize:10, color:"#7c3aed", fontStyle:"italic", fontWeight:600 }}>Closed</span><button onClick={() => onDelete&&onDelete(j.id)} style={{ background:"none", color:C.muted, border:"none", cursor:"pointer", fontSize:9, padding:0, opacity:0.5 }}>× delete</button></div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            <button onClick={() => onApply(j.id)} style={{ background:"#fff5f5", color:R, border:`1px solid ${R}`, borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>Applied</button>
            <button onClick={() => onPass(j.id)} style={{ background:"#f8f8f8", color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"4px 8px", cursor:"pointer", fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>Pass</button>
            <button onClick={() => onClose&&onClose(j.id)} style={{ background:"#f5f3ff", color:"#7c3aed", border:"1px solid #ddd6fe", borderRadius:5, padding:"4px 8px", cursor:"pointer", fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>Close</button>
            <button onClick={() => onDelete&&onDelete(j.id)} style={{ background:"none", color:C.muted, border:"none", cursor:"pointer", fontSize:9, padding:"2px 0", opacity:0.6 }}>× delete</button>
          </div>
        )}
      </td>
    </tr>
  );
  return (
    <div style={{ padding:"16px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <AddBtn label={"Add "+type+" Job"} onClick={onAdd} />
        <span style={{ fontSize:11, color:C.muted, marginLeft:"auto" }}>{data.length} total — {active.length} active — {passed.length + closed.length} archived</span>
      </div>
      <div style={{ marginBottom:20 }}>
        <SecHd label="Active — New and Researching" count={active.length} color={R} />
        {active.length===0 ? <div style={{ fontSize:12, color:C.muted, fontStyle:"italic", padding:"8px 0" }}>No active jobs. Run a Sweep to find new opportunities.</div> : (
          <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}><THead /><tbody>{active.map((j) => <JobRow key={j.id} j={j} />)}</tbody></table></div>
        )}
      </div>
      <div style={{ marginBottom:20 }}>
        <SecHd label="Applied and Responded" count={applied.length} color={C.muted} />
        {applied.length===0 ? <div style={{ fontSize:12, color:C.muted, fontStyle:"italic", padding:"8px 0" }}>No applied jobs yet.</div> : (
          <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}><THead /><tbody>{applied.map((j) => <JobRow key={j.id} j={j} />)}</tbody></table></div>
        )}
      </div>
      {passed.length > 0 && (
        <div>
          <SecHd label="Passed — Decided Not to Apply" count={passed.length} color={C.muted} />
          <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860, opacity:0.65 }}><THead /><tbody>{passed.map((j) => <JobRow key={j.id} j={j} />)}</tbody></table></div>
        </div>
      )}
      {closed.length > 0 && (
        <div>
          <SecHd label="Closed — Heard Back" count={closed.length} color="#7c3aed" />
          <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", minWidth:860, opacity:0.65 }}><THead /><tbody>{closed.map((j) => <JobRow key={j.id} j={j} />)}</tbody></table></div>
        </div>
      )}
    </div>
  );
};



// ── Login Screen ────────────────────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Incorrect email or password."); setLoading(false); }
  };
  const onKey = (e) => { if (e.key === "Enter") handleLogin(); };
  return (
    <div style={{ position:"fixed", inset:0, background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Open Sans',Arial,sans-serif" }}>
      <Logo />
      <div style={{ marginTop:40, width:"min(320px, 90vw)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}><div style={{ fontSize:14, fontWeight:700, fontFamily:"'Lora',serif", color:C.muted }}>Sign in to your CRM</div></div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey} autoFocus style={{ border:`1px solid ${C.border}`, borderRadius:7, padding:"11px 14px", fontSize:13, fontWeight:600, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" }} />
          <div style={{ position:"relative" }}>
            <input type={showPw?"text":"password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey} style={{ border:`1px solid ${C.border}`, borderRadius:7, padding:"11px 42px 11px 14px", fontSize:13, fontWeight:600, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" }} />
            <button onClick={() => setShowPw(p=>!p)} tabIndex={-1} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0, color:C.muted, display:"flex", alignItems:"center" }}>
              {showPw ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          {error && <div style={{ fontSize:12, color:R, textAlign:"center" }}>{error}</div>}
          <button onClick={handleLogin} disabled={loading || !email || !password} style={{ background: loading ? "#ccc" : R, color:"#fff", border:"none", borderRadius:7, padding:"12px", cursor: loading ? "not-allowed" : "pointer", fontSize:13, fontWeight:700, fontFamily:"'Lora',serif", letterSpacing:"0.02em", marginTop:4 }}>{loading ? "Signing in..." : "Sign In"}</button>
        </div>
      </div>
      <div style={{ position:"absolute", bottom:28, fontSize:11, color:"#ccc", fontFamily:"'Open Sans',Arial,sans-serif", letterSpacing:"0.05em" }}>jeoff.nl · private</div>
    </div>
  );
};

// ── Loading Screen ────────────────────────────────────────────────────────────
const LoadingScreen = ({ status }) => (
  <div style={{ position:"fixed", inset:0, background:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:9999 }}>
    <Logo />
    <div style={{ marginTop:32, width:"min(300px, 85vw)", textAlign:"center" }}>
      <div style={{ height:2, background:"#f0f0f0", borderRadius:2, overflow:"hidden", marginBottom:14 }}>
        <div style={{ height:"100%", background:R, borderRadius:2, animation:"loadbar 1.8s ease-in-out infinite", transformOrigin:"left" }} />
      </div>
      <div style={{ fontSize:11, color:C.muted }}>{status}</div>
    </div>
    <div style={{ position:"absolute", bottom:28, fontSize:10, color:"#ddd" }}>jeoff.nl · data stored in Google Drive</div>
  </div>
);

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [warm, setWarm]   = useState(SW);
  const [newL, setNewL]   = useState(SN);
  const [ag, setAg]       = useState(SAg);
  const [br, setBr]       = useState(SBr);
  const [fl, setFl]       = useState([]);
  const [ct, setCt]       = useState([]);
  const [pencils, setPencils] = useState([]);
  const [crew, setCrew]   = useState(SCr);
  const [tab, setTab]     = useState("overview");
  const [msg, setMsg]     = useState(null);
  const [globalQ, setGlobalQ] = useState("");
  const [exportModal, setExportModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [appReady, setAppReady]     = useState(false);
  const [session, setSession]         = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadStatus, setLoadStatus] = useState("Connecting to Google Drive...");
  const autoSaveTimer  = useRef(null);
  const linkedRef = useRef(new Set());

  const autoLinkContact = useCallback((lead) => {
    if (!lead?.company || !lead?.name) return;
    const comp=lead.company.toLowerCase().trim(), company=lead.company, name=lead.name, tier=lead.tier||'';
    const newId=()=>Math.random().toString(36).slice(2,9);
    const cm=(s)=>{const n=(s||'').toLowerCase().trim(),ws=n.split(/[\s,./&+()-]+/).filter(w=>w.length>2);return n===comp||n.includes(comp)||comp.includes(n)||ws.some(w=>comp.includes(w));};
    const isAgency=tier.includes('Agency')||tier.includes('Studio'), isBrand=tier.includes('Brand');
    if(isAgency){setAg(prev=>{const ex=prev.find(a=>cm(a.name));if(ex){if(ex.contact&&ex.contact!=='TBD'&&ex.contact!==''&&ex.contact!=='-')return prev;const next=prev.map(a=>a.id===ex.id?{...a,contact:name,status:a.status==='Find contact'?'New Lead added':a.status}:a);db.set('ja',next);return next;}const entry={id:newId(),name:company,contact:name,email:lead.email||'',website:'',location:'Amsterdam',priority:'3/5',status:'New Lead added',notes:`Contact added from Leads: ${name}.`};const next=[...prev,entry];db.set('ja',next);setMsg(`✓ Added ${company} to Agencies — ${name} as contact.`);return next;});}
    if(isBrand){setBr(prev=>{const ex=prev.find(b=>cm(b.brand));if(ex){if(ex.contactToFind&&ex.contactToFind!=='TBD'&&ex.contactToFind!==''&&ex.contactToFind!=='-')return prev;const next=prev.map(b=>b.id===ex.id?{...b,contactToFind:name}:b);db.set('jb',next);return next;}const entry={id:newId(),brand:company,contactToFind:name,sector:'',warmIn:'Yes',priority:'3/5',status:'In Warm Leads',notes:`Contact added from Leads: ${name}.`};const next=[...prev,entry];db.set('jb',next);setMsg(`✓ Added ${company} to Brands — ${name} as contact.`);return next;});}
  }, []);
  const initialLoad    = useRef(true);
  const searchRef = useRef(null);

  // ── Auto-link leads to agencies/brands ─────────────────────────────────────────
  useEffect(() => {
    if (!appReady) return;
    [...newL, ...warm].forEach(lead => {
      if (!lead.name || !lead.company) return;
      const key = (lead.name + '|' + lead.company).toLowerCase();
      if (linkedRef.current.has(key)) return;
      linkedRef.current.add(key);
      autoLinkContact(lead);
    });
  }, [newL, warm, appReady]);

  // ── Auth session ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);


  useEffect(() => {
    (async () => {
      try {
        // ── Load from Supabase ──────────────────────────────────────────────
        setLoadStatus("Loading your CRM from database...");
        const [w,n,a,b,cr,f,c,sid,pen] = await Promise.all([
          db.get("jw"), db.get("jn"), db.get("ja"), db.get("jb"),
          db.get("jcr"), db.get("jf"), db.get("jc"), db.get("jsid"), db.get("jpen")
        ]);

        const existAgNames=new Set((a&&a.length?a:[]).map(x=>(x.name||'').toLowerCase().trim()));
        const freshAgFromSeed=SAg.filter(s=>!existAgNames.has((s.name||'').toLowerCase().trim()));
        const loadedAg=(a&&a.length)?[...a,...freshAgFromSeed]:SAg;
        const loadedBr=(b&&b.length)?b:SBr;
        // Load pipeline directly — no auto-link merging (prevents resurrection bug)
        const finalWarm = (w && w.length) ? w : [];
        // One-time migration: move existing jn (new leads) into jw as Radar stage
        if (n && n.length) {
          const existIds = new Set(finalWarm.map(x=>x.id));
          const migrated = n.filter(l=>!existIds.has(l.id)).map(l=>({
            ...l, stage:'Radar', dateAdded:l.dateAdded||nowStr()
          }));
          const merged = migrated.length ? [...finalWarm,...migrated] : finalWarm;
          setWarm(merged);
          if(migrated.length) db.set('jw', merged);
          db.set('jn', []); // clear jn after migration
        } else {
          setWarm(finalWarm);
        }
        setNewL([]);
        // Update known closed/merged agencies in live data
        const agMigrations={"ddb amsterdam":{status:"Closed",notes:"Merged into TBWA\\NEBOKO December 2025. Brand retired. Reach out to TBWA\\NEBOKO instead."},"fcb amsterdam":{status:"Closed",notes:"Brand retiring H1 2026, merged into BBDO Amsterdam per Omnicom restructure."},"glassworks amsterdam":{status:"Closed",notes:"BANKRUPT/CLOSED: Amsterdam filed April 2025, full liquidation August 2025."},"the mill amsterdam":{status:"Closed",notes:"CLOSED: Parent Technicolor shut down February 2025. All offices closed."},"kesselskramer":{status:"Closed",notes:"BANKRUPT June 2026 \u2014 3 major clients dropped. Curator investigating restart. Do not reach out now."},"czar":{contact:"Karlijn Paardekooper",email:"karlijn@czar.nl",notes:"EP & Managing Partner. Also Willem (EP): willem@czar.nl. Top Dutch commercial production house."},"halal":{contact:"Job Sanders",email:"job@halal.amsterdam",notes:"Head of Production/EP. NOTE: Rebranded to 100% Film (100prcnt.film) in 2025 \u2014 same team. Also Aemilia van Lent (EP)."},"hazazah":{email:"jeroen@hazazah.nl"},"tbwa neboko":{contact:"Tom Broad (Talent Director)",email:"tom.broad@tbwa.nl",notes:"Talent Director \u2014 RIGHT contact for freelance. 245 staff incl. absorbed DDB Amsterdam team."},"superheroes amsterdam":{contact:"Django Weisz Blanchetta",email:"airmail@hellosuperheroes.com",notes:"CEO & Co-Founder. Small agency so CEO is right. Won Ad Age Small Agency of Year 2025."},"fitzroy amsterdam":{contact:"Jur",email:"jur@fitzroy.nl"},"submarine":{contact:"Femke Wolting (EP)",email:"femke@submarine.nl"},"wieden+kennedy":{contact:"Jaime Tan (Head of Production)",email:"jaime.tan@wk.com",notes:"Head of Production. President: Luiza Prata Carvalho (2024). Nike, Heineken, Samsung."}};
        const closedAgUpdates={"ddb amsterdam":{status:"Closed",notes:"Merged into TBWA\\NEBOKO December 2025. Brand retired. Reach out to TBWA\\NEBOKO instead."},"fcb amsterdam":{status:"Closed",notes:"Merging into BBDO Amsterdam H1 2026 per Omnicom restructure. Brand retired."},"glassworks amsterdam":{status:"Closed",notes:"CLOSED: Bankrupt April 2025, fully liquidated August 2025."},"the mill amsterdam":{status:"Closed",notes:"CLOSED: Parent Technicolor shut down February 2025. All offices closed."},"kesselskramer":{status:"Closed",notes:"BANKRUPT June 2026 \u2014 3 major clients dropped. Curator investigating restart. Do not reach out now."}};
        const hasAgUpd=loadedAg.some(a=>agMigrations[(a.name||'').toLowerCase()]);
        const loadedAgFinal=hasAgUpd?loadedAg.map(a=>{const u=agMigrations[(a.name||'').toLowerCase()];return u?{...a,...u}:a;}):loadedAg;
        setAg(loadedAgFinal); if(!a||!a.length||freshAgFromSeed.length||hasAgUpd)db.set("ja",loadedAgFinal);
        setBr(loadedBr); if(!b||!b.length)db.set("jb",loadedBr);
        if(pen&&pen.length) setPencils(pen);
        if (cr&&cr.length) setCrew(cr); else { setCrew(SCr); db.set("jcr", SCr); }

        let baseFl = f || [], baseCt = c || [];

        // ── Migration v1: remove fabricated contacts, fix titles ──────────
        let migDone = false;
        try { migDone = await db.get("migration_v1"); } catch {}
        if (!migDone) {
          const FAKE_WARM  = new Set(["Nick Turner","Bart Duivenvoorden"]);
          const FAKE_LEADS = new Set(["Sarah Vandermeer","Thomas Bakker","Anna Koelemeijer","Michiel Snijder","Femke de Jong","Joris van Kooten","Lauren Marks","Daan Westerhof","Irene Visser","Kevin Hollander"]);
          const TITLE_FIXES = {
            "Cas de Brouwer":  { role:"Director of Innovation - Content" },
            "Chance Woodward": { role:"Managing Executive Producer, European Group" },
            "Simon Sliphorst": { role:"Founder, Production Lead & AI Video Director", notes:"Cape has pivoted to AI video production. Founder + Production Lead + AI Video Director. Strong AI angle now." },
          };
          const REAL_LEADS = [
            { name:"Cheryl Warbrook",    role:"Head of Production",                    company:"Wieden+Kennedy Amsterdam", email:"",                          tier:"A – Agency",  stage:"New", contact:"LinkedIn", dateAdded:"04/06/26", notes:"Confirmed current HoP at W+K AMS. Key target — Nike, Samsung, Heineken, Duolingo clients. 73 mutual connections." },
            { name:"Marielle Koenders",  role:"Executive Creative Producer (Freelance)",company:"Ex Vidiboko / TBWA\\NEBOKO", email:"",                       tier:"A – Agency",  stage:"New", contact:"LinkedIn", dateAdded:"04/06/26", notes:"Left Vidiboko/TBWA — now freelancing as Exec Creative Producer. Strong Adidas overlap, pitch on shared client background." },
            { name:"Stefan Niemela",     role:"CG Production Manager",                 company:"Adidas",                   email:"stefan.niemela@adidas.com", tier:"B – Brand",   stage:"New", contact:"LinkedIn", dateAdded:"04/06/26", notes:"Direct internal Adidas contact from your 2022/2023 CG work. Dormant but warm — re-activate with a short reconnect note." },
            { name:"Karlijn Paardekoper",role:"Executive Producer",                    company:"CZAR Amsterdam",           email:"",                          tier:"A – Studio",  stage:"New", contact:"LinkedIn", dateAdded:"04/06/26", notes:"EP at one of NL's top production companies. CZAR works with all major Dutch/EU agencies. Find contact via czar.tv." },
          ];

          setWarm((prev) => {
            const next = prev
              .filter((x) => !FAKE_WARM.has(x.name))
              .map((x) => TITLE_FIXES[x.name] ? { ...x, ...TITLE_FIXES[x.name] } : x);
            db.set("jw", next);
            return next;
          });

          setNewL((prev) => {
            const existingNames = new Set(prev.map((x) => x.name));
            const cleaned = prev.filter((x) => !FAKE_LEADS.has(x.name));
            const toAdd = REAL_LEADS.filter((r) => !existingNames.has(r.name)).map((r) => mk(r));
            const next = [...toAdd, ...cleaned];
            db.set("jn", next);
            return next;
          });

          db.set("migration_v1", "done");
          setMsg("CRM cleaned — removed 12 unverified contacts, updated 3 titles, added 4 verified leads.");
        }
        // ── End migration ─────────────────────────────────────────────────

        let _baseFl = baseFl, _baseCt = baseCt;
        if (SWEEP_ID && SWEEP_ID!==sid && LATEST_SWEEP.length>0) {
          const sweepDate = SWEEP_ID.split("-")[0];
          // Normalise company name for dedup (case + punctuation insensitive)
          const normCo=(s)=>(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
          // One-time: deduplicate existing jobs by company (keep acted-on / latest)
          const dedupArr=(arr)=>{ const seen=new Set(); return arr.filter(j=>{ const k=normCo(j.company); if(seen.has(k))return false; seen.add(k); return true; }); };
          _baseFl=dedupArr(_baseFl); _baseCt=dedupArr(_baseCt);
          const existing = new Set([..._baseFl,..._baseCt].map((j)=>normCo(j.company)));
          const nFl = LATEST_SWEEP.filter((j) => j.type==="Freelance" && !existing.has(normCo(j.company))).map((j) => ({ ...j,id:uid(),date:sweepDate,status:"New",isNew:true }));
          const nCt = LATEST_SWEEP.filter((j) => j.type==="Contract" && !existing.has(normCo(j.company))).map((j) => ({ ...j,id:uid(),date:sweepDate,status:"New",isNew:true }));
          _baseFl = [..._baseFl,...nFl]; _baseCt = [..._baseCt,...nCt];
          await Promise.all([db.set("jf",_baseFl),db.set("jc",_baseCt),db.set("jsid",SWEEP_ID)]);
          if (nFl.length+nCt.length>0) setMsg(nFl.length+" freelance + "+nCt.length+" contract jobs loaded from last sweep.");
        }
        setFl(_baseFl); setCt(_baseCt);
        setLoadStatus("Ready.");
        setAppReady(true);
      } catch(e) { console.error(e); setAppReady(true); }
    })();
  }, []);

  // Move a warm lead to the Leads pool with a reason
  const archiveToLeads = useCallback((id, reason) => {
    setWarm((prev) => {
      const next = prev.map(x => x.id===id ? {...x, stage:"Archived", notes:(x.notes||'')+(reason?(' | Archived '+nowStr()+': '+reason):(' | Archived '+nowStr()))} : x);
      db.set("jw", next);
      return next;
    });
  }, []);


  // close search on outside click
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setGlobalQ(""); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const upd = useCallback((key, setter) => (id, field, val) => {
    setter((prev) => { const next = prev.map((x) => x.id===id ? {...x,[field]:val} : x); db.set(key,next); return next; });
  }, []);

  const add = useCallback((setter, key, template) => () => {
    const item = {...template, id:uid()};
    setter((prev) => { const next = [item, ...prev]; db.set(key,next); return next; });
  }, []);

  const del = useCallback((key, setter) => (id) => {
    setter((prev) => { const next = prev.filter((x) => x.id!==id); db.set(key,next); return next; });
  }, []);

  const updAgAndWarm=useCallback((id,field,val)=>{
    setAg(prev=>{
      const next=prev.map(x=>x.id===id?{...x,[field]:val}:x);
      db.set('ja',next);
      if(field==='status'&&val==='In Warm Leads'){
        const ag=next.find(x=>x.id===id);
        if(ag)setWarm(prevW=>{
          const cos=new Set(prevW.map(x=>(x.company||'').toLowerCase()));
          if(cos.has((ag.name||'').toLowerCase()))return prevW;
          const entry=mk({name:ag.contact||'Contact TBD',role:'',company:ag.name||'',email:ag.email||'',tier:'A – Agency',stage:'Nurturing',lastContact:nowStr(),nextActionDate:'',nextAction:'Follow up — added from Agencies.',notes:ag.notes||''});
          const nW=[...prevW,entry];db.set('jw',nW);return nW;
        });
      }
      return next;
    });
  },[]);

  const updBrAndWarm=useCallback((id,field,val)=>{
    setBr(prev=>{
      const next=prev.map(x=>x.id===id?{...x,[field]:val}:x);
      db.set('jb',next);
      if((field==='warmIn'&&val==='Yes')||(field==='status'&&val==='In Warm Leads')){
        const br=next.find(x=>x.id===id);
        if(br)setWarm(prevW=>{
          const cos=new Set(prevW.map(x=>(x.company||'').toLowerCase()));
          if(cos.has((br.brand||'').toLowerCase()))return prevW;
          const entry=mk({name:br.contactToFind||'Contact TBD',role:'',company:br.brand||'',email:'',tier:'B – Brand',stage:'Nurturing',lastContact:nowStr(),nextActionDate:'',nextAction:'Find and reach out.',notes:br.notes||''});
          const nW=[...prevW,entry];db.set('jw',nW);return nW;
        });
      }
      return next;
    });
  },[]);

  // Stage change with timestamp log
  const warmStageChange = useCallback((id, newStage) => {
    setWarm((prev) => {
      const next = prev.map((x) => {
        if (x.id!==id) return x;
        const log = [...(x.stageLog||[]), nowStr()+": "+x.stage+" → "+newStage];
        return {...x, stage:newStage, stageLog:log};
      });
      db.set("jw",next);
      return next;
    });
  }, []);

  const promoteToWarm = useCallback((id) => {
    setNewL((prevNew) => {
      const lead = prevNew.find((x) => x.id===id);
      if (!lead) return prevNew;
      const entry = mk({ name:lead.name||"", role:lead.role||"", company:lead.company||"", email:lead.email||"", tier:lead.tier||"A – Agency", stage:"Nurturing", lastContact:nowStr(), nextActionDate:"", nextAction:"Follow up — promoted from New Leads.", notes:lead.notes||"" });
      const nNew = prevNew.filter((x) => x.id!==id);
      db.set("jn",nNew);
      setWarm((prevWarm) => { const nWarm = [...prevWarm,entry]; db.set("jw",nWarm); return nWarm; });
      return nNew;
    });
  }, []);

  const applyJob = useCallback((key, setter) => (id) => {
    setter((prev) => { const next = prev.map((x) => x.id===id ? {...x,status:"Applied",appliedDate:nowStr(),isNew:false} : x); db.set(key,next); return next; });
  }, []);

  const undoApply = useCallback((key, setter) => (id) => {
    setter((prev) => { const next = prev.map((x) => x.id===id ? {...x,status:"New",appliedDate:null} : x); db.set(key,next); return next; });
  }, []);

  const passJob = useCallback((key, setter) => (id) => {
    setter((prev) => { const next = prev.map((x) => x.id===id ? {...x, status:"Passed", isNew:false} : x); db.set(key, next); return next; });
  }, []);

  const closeJob = useCallback((key, setter) => (id) => {
    setter((prev) => { const next = prev.map((x) => x.id===id ? {...x, status:"Closed", isNew:false} : x); db.set(key, next); return next; });
  }, []);

  const exportData = useCallback(() => {
    const data = { exportDate:nowStr(), warmLeads:warm, leads:newL, agencies:ag, brands:br, crew, freelanceJobs:fl, contractJobs:ct };
    setExportModal(JSON.stringify(data, null, 2));
  }, [warm,newL,ag,br,crew,fl,ct]);

  const importData = useCallback(() => {
    if (!importText.trim()) return;
    try {
      const data = JSON.parse(importText);
      (async () => {
        const leadsData = data.leads || data.newLeads;
        if (data.warmLeads)    { setWarm(data.warmLeads);    await db.set("jw", data.warmLeads); }
        if (leadsData)         { setNewL(leadsData);          await db.set("jn", leadsData); }
        if (data.agencies)     { setAg(data.agencies);       await db.set("ja", data.agencies); }
        if (data.brands)       { setBr(data.brands);         await db.set("jb", data.brands); }
        if (data.crew)         { setCrew(data.crew);          await db.set("jcr", data.crew); }
        if (data.freelanceJobs){ setFl(data.freelanceJobs);  await db.set("jf", data.freelanceJobs); }
        if (data.contractJobs) { setCt(data.contractJobs);   await db.set("jc", data.contractJobs); }
        setMsg("Imported — " + (data.exportDate || data.savedAt || "unknown date"));
        setImportModal(false);
        setImportText("");
      })();
    } catch(e) {
      alert("Invalid JSON — check the file and try again.");
    }
  }, [importText]);

  const flNew = fl.filter((j) => j.isNew).length;
  const ctNew = ct.filter((j) => j.isNew).length;


  const TABS = [
    { id:"overview",  label:"Overview" },
    { id:"warm",      label:"Pipeline ("+warm.filter(w=>w.stage!=="Archived").length+")" },
    { id:"agencies",  label:"Agencies & Studios ("+ag.length+")" },
    { id:"brands",    label:"Brands ("+br.length+")" },
    { id:"crew",      label:"Rolodex ("+crew.length+")" },
    { id:"freelance", label:"Freelance Jobs", badge:flNew },
    { id:"contract",  label:"Contract Jobs",  badge:ctNew },
  ];

  if (!authChecked) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh" }}><div style={{ width:24, height:24, border:"2px solid #eee", borderTopColor:R, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} /></div>;
  if (!session) return <LoginScreen />;
  if (!appReady) return <LoadingScreen status={loadStatus} />;

  return (
    <div style={{ fontFamily:"'Open Sans',Arial,sans-serif", background:C.bg, minHeight:"100vh", color:C.text }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        @keyframes bar { 0% { width:4% } 75% { width:89% } 100% { width:95% } }
        @keyframes loadbar { 0% { width:0% } 60% { width:75% } 85% { width:90% } 100% { width:100% } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:${C.border}; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:3px; }
        button:hover { opacity:.85; }
        a:hover { opacity:.8; }
        input, select, textarea { font-family:inherit; }
        .mobile-scroll-hint { display:none; }

        @media (max-width: 640px) {
          .app-header { flex-wrap: wrap !important; row-gap: 8px !important; padding: 10px 14px !important; }
          .app-header .global-search-wrap { order: 3 !important; flex-basis: 100% !important; max-width: 100% !important; }
          .app-header .header-actions { gap: 8px !important; }
          .sweep-info-text { display: none !important; }
          .stat-grid-3 { grid-template-columns: 1fr !important; }
          .content-wrap { padding-left: 10px !important; padding-right: 10px !important; }
          .tab-bar-row { padding-left: 10px !important; padding-right: 10px !important; }
          .stat-card { flex: 1 1 calc(50% - 6px) !important; min-width: 0 !important; }
          .stale-card { flex: 1 1 calc(50% - 6px) !important; min-width: 0 !important; }
          .mobile-scroll-hint { display:block !important; font-size:10px; color:#909090; margin-bottom:4px; }
          .sticky-col-th, .sticky-col-td { position:sticky !important; left:0 !important; box-shadow:2px 0 4px -2px rgba(0,0,0,0.15) !important; background-clip:padding-box !important; }
          .sticky-col-th { background-color:#fff !important; z-index:3 !important; }
          .sticky-col-td { z-index:1 !important; }
        }
      `}</style>

      {/* Header */}
      <div className="app-header" style={{ background:"#fff", borderBottom:`1px solid ${C.border}`, padding:"10px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100, gap:12 }}>
        <div onClick={() => setTab("overview")} style={{ cursor:"pointer", flexShrink:0 }} title="Go to Overview"><Logo /></div>

        {/* Global search */}
        <div ref={searchRef} className="global-search-wrap" style={{ position:"relative", flex:1, maxWidth:360 }}>
          <input
            type="text"
            placeholder="Search everything..."
            value={globalQ}
            onChange={(e) => setGlobalQ(e.target.value)}
            style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:7, padding:"7px 12px", fontSize:12, outline:"none", background:"#f9f9f9" }}
          />
          {globalQ.trim().length > 1 && (
            <GlobalSearch q={globalQ} warm={warm} newL={newL} ag={ag} br={br} crew={crew} fl={fl} ct={ct}
              onGo={(t) => { setTab(t); setGlobalQ(""); }} />
          )}
        </div>

        <div className="header-actions" style={{ display:"flex", alignItems:"center", gap:12 }}>
          {msg && (
            <div style={{ background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
              {msg}<button onClick={() => setMsg(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#16a34a", fontSize:14, lineHeight:1, padding:0 }}>x</button>
            </div>
          )}
          <button onClick={() => supabase.auth.signOut()} title="Lock CRM" style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 9px", cursor:"pointer", display:"flex", alignItems:"center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          <button onClick={exportData} style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 12px", cursor:"pointer", fontSize:11, fontWeight:600 }}>Export</button>

          
          <div className="sweep-info-text" style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
            <div style={{ fontSize:10, color:C.muted }}>Last sweep: <span style={{ color:C.text, fontWeight:600 }}>{SWEEP_ID.split("-")[0]}</span></div>
            <div style={{ color:C.muted, fontSize:9, textTransform:"uppercase", letterSpacing:"0.7px" }}>Type "Run Sweep" in chat to update</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar-row" style={{ background:"#fff", borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", overflowX:"auto", gap:2 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background:"none", border:"none", borderBottom:tab===t.id?`2px solid ${R}`:"2px solid transparent", color:tab===t.id?R:C.muted, padding:"8px 12px", cursor:"pointer", fontSize:12, fontWeight:tab===t.id?700:500, fontFamily:tab===t.id?"'Lora',serif":"inherit", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4, marginBottom:-1 }}>
            {t.label}
            {t.badge>0 && <span style={{ background:R, color:"#fff", borderRadius:8, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="content-wrap" style={{ maxWidth:1600, margin:"0 auto", paddingTop:20 }}>
        {tab==="overview"  && <Overview warm={warm} newL={newL} ag={ag} br={br} fl={fl} ct={ct} pencils={pencils} onPencilChange={(p)=>{ setPencils(p); db.set("jpen",p); }} onGoToWarm={()=>setTab("warm")} />}
        {tab==="warm"      && <WarmTab leads={warm} onUpdate={upd("jw",setWarm)} onStageChange={warmStageChange} onAdd={add(setWarm,"jw",{name:"",role:"",company:"",email:"",tier:"A – Agency",stage:"Radar",lastContact:"",nextActionDate:"",nextAction:"",notes:""})} onDelete={del("jw",setWarm)} onArchive={archiveToLeads} />}
        
        {tab==="agencies"  && <AgTab   data={ag}    onUpdate={updAgAndWarm}   onAdd={(extra={}) => {
              const defaults={name:"",contact:"",email:"",website:"",location:"Amsterdam",priority:"3/5",status:"Find contact",notes:""};
              const item=mk({...defaults,...extra});
              setAg(prev=>{ const next=[...prev,item]; db.set("ja",next); return next; });
              // Auto-create pipeline entry if a real contact name is provided
              if(item.contact && item.contact!=="TBD" && item.contact.trim()!=="") {
                setWarm(prev=>{
                  const alreadyIn=prev.some(w=>(w.name||"").toLowerCase().includes((item.contact||"").toLowerCase().split(" ")[0].toLowerCase()) && (w.company||"").toLowerCase().includes((item.name||"").toLowerCase().slice(0,5)));
                  if(alreadyIn) return prev;
                  const lead=mk({name:item.contact,role:"",company:item.name,email:item.email||"",tier:"A – Agency",stage:"Radar",lastContact:"",nextActionDate:"",nextAction:"Added from Agencies tab.",notes:""});
                  const next=[...prev,lead]; db.set("jw",next); return next;
                });
                setAg(prev=>{ const next=prev.map(a=>a.id===item.id?{...a,status:"In Warm Leads"}:a); db.set("ja",next); return next; });
              }
            }} onDelete={del("ja",setAg)} warm={warm} leads={newL} />}
        {tab==="brands"    && <BrTab   data={br}    onUpdate={updBrAndWarm}   onAdd={(extra={}) => {
              const defaults={brand:"",contactToFind:"",sector:"",warmIn:"No",priority:"3/5",status:"Cold",notes:""};
              const item=mk({...defaults,...extra});
              setBr(prev=>{ const next=[...prev,item]; db.set("jb",next); return next; });
              // Auto-create pipeline entry if a real contact name is provided
              if(item.contactToFind && item.contactToFind!=="TBD" && !item.contactToFind.startsWith("Head of") && item.contactToFind.trim()!=="") {
                setWarm(prev=>{
                  const alreadyIn=prev.some(w=>(w.name||"").toLowerCase().includes((item.contactToFind||"").toLowerCase().split(" ")[0].toLowerCase()) && (w.company||"").toLowerCase().includes((item.brand||"").toLowerCase().slice(0,5)));
                  if(alreadyIn) return prev;
                  const lead=mk({name:item.contactToFind,role:"",company:item.brand,email:"",tier:"B – Brand",stage:"Radar",lastContact:"",nextActionDate:"",nextAction:"Added from Brands tab.",notes:""});
                  const next=[...prev,lead]; db.set("jw",next); return next;
                });
                setBr(prev=>{ const next=prev.map(b=>b.id===item.id?{...b,warmIn:"Yes",status:"In Warm Leads"}:b); db.set("jb",next); return next; });
              }
            }} onDelete={del("jb",setBr)} />}
        {tab==="crew"      && <CrewTab data={crew}  onUpdate={upd("jcr",setCrew)} onAdd={add(setCrew,"jcr",{name:"",specialty:"Motion Design",rate:"",email:"",website:"",location:"Amsterdam",notes:""})} onDelete={del("jcr",setCrew)} />}
        {tab==="freelance" && <JobsTab data={fl}    onUpdate={upd("jf",setFl)}   onAdd={add(setFl,"jf",{company:"",role:"",location:"Amsterdam",sector:"",priority:"Medium",notes:"",source:"",date:nowStr(),status:"New",type:"Freelance"})} type="Freelance" onApply={applyJob("jf",setFl)} onUndo={undoApply("jf",setFl)} onPass={passJob("jf",setFl)} onClose={closeJob("jf",setFl)} onDelete={del("jf",setFl)} />}
        {tab==="contract"  && <JobsTab data={ct}    onUpdate={upd("jc",setCt)}   onAdd={add(setCt,"jc",{company:"",role:"",location:"Amsterdam",sector:"",priority:"Medium",notes:"",source:"",date:nowStr(),status:"New",type:"Contract"})}  type="Contract"  onApply={applyJob("jc",setCt)} onUndo={undoApply("jc",setCt)} onPass={passJob("jc",setCt)} onClose={closeJob("jc",setCt)} onDelete={del("jc",setCt)} />}
      </div>


      {/* Export modal */}
      {exportModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={() => setExportModal(null)}>
          <div style={{ background:"#fff", borderRadius:10, padding:24, width:"100%", maxWidth:560, display:"flex", flexDirection:"column", gap:12, maxHeight:"80vh" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Export data</div>
              <button onClick={() => setExportModal(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:C.muted, lineHeight:1 }}>×</button>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>Copy this JSON and save it somewhere safe. Use Import to restore it in any future version of this artifact.</div>
            <textarea readOnly value={exportModal} onClick={(e) => e.target.select()}
              style={{ flex:1, minHeight:200, border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 10px", fontSize:10, fontFamily:"monospace", resize:"vertical", outline:"none", color:C.text }} />
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => { navigator.clipboard.writeText(exportModal).then(() => { setMsg("Copied to clipboard!"); setExportModal(null); }).catch(() => {}); }}
                style={{ background:R, color:"#fff", border:"none", borderRadius:6, padding:"9px 0", cursor:"pointer", fontSize:12, fontWeight:700, flex:1 }}>
                Copy to clipboard
              </button>
              <button
                onClick={() => { const a=document.createElement("a"); a.href="data:application/json;charset=utf-8,"+encodeURIComponent(exportModal); a.download="jeoff-crm-"+nowStr().replace(/\//g,"-")+".json"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
                style={{ background:"#fff", color:C.text, border:`1px solid ${C.border}`, borderRadius:6, padding:"9px 14px", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                Download .json
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {importModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={() => { setImportModal(false); setImportText(""); }}>
          <div style={{ background:"#fff", borderRadius:10, padding:24, width:"100%", maxWidth:560, display:"flex", flexDirection:"column", gap:12, maxHeight:"80vh" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Import data</div>
              <button onClick={() => { setImportModal(false); setImportText(""); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:C.muted, lineHeight:1 }}>×</button>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>Select your exported .json file, or paste the JSON below. This replaces all current data.</div>
            <input type="file" accept=".json,application/json"
              onChange={(e) => { const f=e.target.files[0]; if (!f) return; const r=new FileReader(); r.onload=(ev) => setImportText(ev.target.result); r.readAsText(f); }}
              style={{ border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 10px", fontSize:12 }} />
            <textarea placeholder="Or paste JSON here..." value={importText} onChange={(e) => setImportText(e.target.value)}
              style={{ flex:1, minHeight:160, border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 10px", fontSize:10, fontFamily:"monospace", resize:"vertical", outline:"none", color:C.text }} />
            <button onClick={importData} disabled={!importText.trim()}
              style={{ background:importText.trim()?R:"#ccc", color:"#fff", border:"none", borderRadius:6, padding:"10px 0", cursor:importText.trim()?"pointer":"not-allowed", fontSize:12, fontWeight:700 }}>
              Import and restore data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
