const pptxgen = require("pptxgenjs");
const { buildIconSet } = require("./icons");

const NAVY = "0F172A";
const SLATE = "1E293B";
const SLATE_MUTED = "475569";
const MUTED = "64748B";
const MUTED2 = "94A3B8";
const BLUE = "2563EB";
const BLUE_BG = "EFF6FF";
const BLUE_BORDER = "93C5FD";
const GREEN = "16A34A";
const GREEN_BG = "F0FDF4";
const GREEN_BORDER = "86EFAC";
const AMBER = "D97706";
const AMBER_BG = "FFFBEB";
const RED = "DC2626";
const RED_BG = "FEF2F2";
const WHITE = "FFFFFF";
const BG_TINT = "F8FAFC";
const BORDER = "E2E8F0";
const PURPLE = "7C3AED";

const HEAD = "Georgia";
const BODY = "Calibri";
const W = 13.333, H = 7.5;

function freshShadow(opts = {}) {
  return { type: "outer", color: NAVY, blur: 9, offset: 3, angle: 135, opacity: 0.12, ...opts };
}

async function main() {
  const colorsNeeded = [NAVY, WHITE, BLUE, GREEN, AMBER, RED, MUTED, MUTED2, SLATE_MUTED, "2563EB", "60A5FA", "FCA5A5"];
  const ic = await buildIconSet([...new Set(colorsNeeded)]);

  let pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "ETL Orchestration Platform";
  pres.title = "ETL Orchestration & Automation Platform";

  let pageCounter = 1;
  function autoPageNum(slide) {
    pageCounter++;
    slide.addText(String(pageCounter).padStart(2, "0"), {
      x: W - 0.9, y: H - 0.55, w: 0.6, h: 0.35, fontFace: BODY, fontSize: 10,
      color: MUTED2, align: "right", margin: 0,
    });
  }

  function kicker(slide, text, color = BLUE) {
    slide.addText(text.toUpperCase(), {
      x: 0.7, y: 0.45, w: 9, h: 0.35, fontFace: BODY, bold: true, fontSize: 12.5,
      color, charSpacing: 2, margin: 0,
    });
  }

  function contentTitle(slide, text, opts = {}) {
    slide.addText(text, {
      x: 0.7, y: 0.78, w: opts.w || 11.5, h: 0.85, fontFace: HEAD, bold: true,
      fontSize: opts.size || 28, color: NAVY, margin: 0,
    });
  }

  function lightBg(slide) {
    slide.background = { color: WHITE };
  }

  function iconChip(slide, key, x, y, d, bg, fg, iconScale = 0.52) {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { type: "none" } });
    const s = d * iconScale;
    slide.addImage({ data: ic[key][fg], x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s });
  }

  function subtleCorner(slide) {
    slide.addShape(pres.shapes.OVAL, { x: W - 1.7, y: H - 1.9, w: 3.6, h: 3.6, fill: { color: BLUE_BG, transparency: 55 }, line: { type: "none" } });
  }

  function screenshotPlaceholder(slide, x, y, w, h, caption) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: "F8FAFC" },
      line: { color: "CBD5E1", width: 1.25, dashType: "dash" },
    });
    const d = Math.min(0.55, h * 0.32);
    iconChip(slide, "camera", x + (w - d) / 2, y + h / 2 - d - 0.14, d, "FFFFFF", MUTED2, 0.55);
    slide.addText(caption, {
      x: x + 0.2, y: y + h / 2, w: w - 0.4, h: 0.45,
      fontFace: BODY, italic: true, fontSize: 10.5, color: MUTED2,
      align: "center", margin: 0, lineSpacingMultiple: 1.2,
    });
  }

  function newSlide() {
    const s = pres.addSlide();
    lightBg(s);
    subtleCorner(s);
    return s;
  }

  // A horizontal pipeline of boxes connected by arrows
  function flowRow(slide, steps, x, y, boxW, boxH, gap) {
    let cx = x;
    steps.forEach((st, i) => {
      slide.addShape(pres.shapes.RECTANGLE, { x: cx, y, w: boxW, h: boxH, fill: { color: st.bg || WHITE }, line: { color: st.c || BORDER, width: 1.25 } });
      const titleH = st.d ? boxH * 0.52 : boxH;
      slide.addText(st.t, {
        x: cx + 0.06, y: y + (st.d ? 0.08 : 0), w: boxW - 0.12, h: titleH,
        fontFace: st.code ? "Consolas" : BODY, bold: true, fontSize: st.fs || 10.5, color: st.tc || NAVY,
        align: "center", valign: st.d ? "top" : "middle", margin: 0, lineSpacingMultiple: 1.05,
      });
      if (st.d) {
        slide.addText(st.d, {
          x: cx + 0.06, y: y + boxH * 0.5, w: boxW - 0.12, h: boxH * 0.45,
          fontFace: BODY, fontSize: 7.8, color: MUTED, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.05,
        });
      }
      if (i < steps.length - 1) {
        slide.addShape(pres.shapes.RIGHT_ARROW, {
          x: cx + boxW + gap / 2 - 0.09, y: y + boxH / 2 - 0.08, w: gap - 0.04, h: 0.16,
          fill: { color: MUTED2 }, line: { type: "none" },
        });
      }
      cx += boxW + gap;
    });
  }

  function dividerSlide(partLabel, title, subtitle, icon) {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addShape(pres.shapes.OVAL, { x: -2, y: -2.5, w: 5.5, h: 5.5, fill: { color: SLATE, transparency: 50 }, line: { type: "none" } });
    s.addShape(pres.shapes.OVAL, { x: 10.8, y: 4.8, w: 4.5, h: 4.5, fill: { color: SLATE, transparency: 58 }, line: { type: "none" } });
    iconChip(s, icon, 0.9, 2.0, 0.85, SLATE, "60A5FA", 0.5);
    s.addText(partLabel.toUpperCase(), { x: 0.9, y: 3.05, w: 10, h: 0.35, fontFace: BODY, bold: true, fontSize: 13, color: "60A5FA", charSpacing: 2, margin: 0 });
    s.addText(title, { x: 0.85, y: 3.45, w: 11, h: 1.1, fontFace: HEAD, bold: true, fontSize: 38, color: WHITE, margin: 0 });
    s.addText(subtitle, { x: 0.9, y: 4.55, w: 10, h: 0.6, fontFace: BODY, fontSize: 14, color: "CBD5E1", margin: 0, lineSpacingMultiple: 1.25 });
    return s;
  }

  // SLIDE 1 — Title
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addShape(pres.shapes.OVAL, { x: 10.6, y: -2.3, w: 6, h: 6, fill: { color: SLATE, transparency: 40 }, line: { type: "none" } });
    s.addShape(pres.shapes.OVAL, { x: -2.2, y: 5.2, w: 4.2, h: 4.2, fill: { color: SLATE, transparency: 55 }, line: { type: "none" } });
    iconChip(s, "network", 0.9, 0.85, 0.85, SLATE, BLUE, 0.5);
    s.addText("END-OF-STUDIES PROJECT  ·  AMARIS CONSULTING", {
      x: 0.9, y: 2.55, w: 10, h: 0.4, fontFace: BODY, bold: true, fontSize: 13, color: "60A5FA", charSpacing: 2, margin: 0,
    });
    s.addText("ETL Orchestration & Automation Platform", {
      x: 0.85, y: 2.95, w: 11.2, h: 1.7, fontFace: HEAD, bold: true, fontSize: 44, color: WHITE, margin: 0,
    });
    s.addText("A secure, role-based web platform that automates the full lifecycle of Python ETL pipelines — from upload to supervised execution, scheduling, and analytics.", {
      x: 0.9, y: 4.35, w: 9.6, h: 0.9, fontFace: BODY, fontSize: 15, color: "CBD5E1", margin: 0, lineSpacingMultiple: 1.25,
    });
    s.addShape(pres.shapes.LINE, { x: 0.9, y: 5.55, w: 4.2, h: 0, line: { color: "334155", width: 1 } });
    s.addText([
      { text: "Presented as part of the Engineering Degree in Applied & Technological Sciences", options: { breakLine: true } },
      { text: "Host Organisation: Amaris Consulting — Data & Business Intelligence Team", options: {} },
    ], {
      x: 0.9, y: 5.75, w: 9.8, h: 0.8, fontFace: BODY, fontSize: 11.5, color: MUTED2, margin: 0, lineSpacingMultiple: 1.3,
    });
    s.addNotes(
      "Good morning everyone, and thank you for being here. I'm going to present my end-of-studies project, done at Amaris Consulting. " +
      "It is a secure, role-based web platform that automates Python ETL pipelines. " +
      "In the next fifteen minutes, I will explain the problem, the solution I built, the methods I used, and then go through the platform itself."
    );
  }

  // SLIDE 2 — Agenda
  {
    const s = newSlide();
    kicker(s, "Roadmap");
    contentTitle(s, "What I'll cover");
    const items = [
      { icon: "warning", t: "General Context", d: "The problem & why existing tools fall short" },
      { icon: "project", t: "Proposed Solution", d: "The orchestration approach" },
      { icon: "tasks", t: "Project Initiation", d: "Methodology & architecture" },
      { icon: "cube", t: "The Platform", d: "Four modules — the technical core" },
      { icon: "sync", t: "Execution & Scheduling", d: "Threads, processes, polling — in depth" },
      { icon: "handshake", t: "Conclusion", d: "Results & next steps" },
    ];
    const cols = 3, gap = 0.35;
    const cardW = (W - 1.4 - gap * (cols - 1)) / cols, cardH = 1.85;
    items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 0.7 + col * (cardW + gap), y = 2.05 + row * (cardH + gap);
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: cardW, h: cardH, fill: { color: BG_TINT }, line: { color: BORDER, width: 1 } });
      iconChip(s, it.icon, x + 0.28, y + 0.28, 0.62, BLUE_BG, BLUE, 0.55);
      s.addText(String(i + 1), { x: x + cardW - 0.55, y: y + 0.18, w: 0.4, h: 0.4, fontFace: HEAD, bold: true, fontSize: 16, color: MUTED2, align: "right", margin: 0 });
      s.addText(it.t, { x: x + 0.28, y: y + 1.0, w: cardW - 0.5, h: 0.4, fontFace: BODY, bold: true, fontSize: 14.5, color: NAVY, margin: 0 });
      s.addText(it.d, { x: x + 0.28, y: y + 1.36, w: cardW - 0.5, h: 0.42, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0 });
    });
    autoPageNum(s);
    s.addNotes(
      "Here is the plan. First the context, then the solution I proposed, then the methods and the architecture. " +
      "After that, the main part: the platform itself, in four modules. I will spend extra time on execution and scheduling, since they are the most technical parts. " +
      "I will finish with the results and what could be improved next."
    );
  }

  dividerSlide("Part 01", "General Context", "Why Amaris needed this platform — and why existing tools weren't the answer", "warning");

  // Host Organisation
  {
    const s = newSlide();
    kicker(s, "Context");
    contentTitle(s, "Host Organisation — Amaris Consulting");
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 2.05, w: 6.7, h: 4.6, fill: { color: BG_TINT }, line: { color: BORDER, width: 1 } });
    iconChip(s, "building", 1.05, 2.4, 0.75, BLUE_BG, BLUE, 0.5);
    s.addText("Independent international consulting firm, founded 2007", {
      x: 2.0, y: 2.45, w: 5.2, h: 0.7, fontFace: BODY, bold: true, fontSize: 14, color: NAVY, margin: 0,
    });
    const facts = [
      "60+ countries, 7,500+ consultants worldwide",
      "Finance, telecom, healthcare, energy, industry",
      "IT consulting, business transformation, engineering",
      "Project carried out within the DCI team (Data & Business Intelligence) — 11 members, Tunisia & France",
    ];
    let fy = 3.35;
    facts.forEach(f => {
      iconChip(s, "check", 1.05, fy, 0.32, "FFFFFF", GREEN, 0.65);
      s.addText(f, { x: 1.55, y: fy - 0.04, w: 5.65, h: 0.55, fontFace: BODY, fontSize: 12.5, color: SLATE_MUTED, margin: 0, valign: "top" });
      fy += 0.78;
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 7.65, y: 2.05, w: 5.0, h: 4.6, fill: { color: NAVY }, line: { type: "none" } });
    iconChip(s, "cogs", 8.0, 2.4, 0.7, SLATE, "60A5FA", 0.55);
    s.addText("Internal tooling culture", { x: 8.0, y: 3.25, w: 4.3, h: 0.4, fontFace: BODY, bold: true, fontSize: 14, color: WHITE, margin: 0 });
    s.addText("Amaris regularly invests in internal automation projects to improve technical team efficiency and delivery reliability — this platform is one of them.", {
      x: 8.0, y: 3.7, w: 4.3, h: 2.7, fontFace: BODY, fontSize: 12.5, color: "CBD5E1", margin: 0, lineSpacingMultiple: 1.3,
    });
    autoPageNum(s);
    s.addNotes(
      "Amaris Consulting is an international consulting firm founded in 2007, present in over 60 countries with more than 7,500 consultants. " +
      "This project was carried out within the DCI team — Data and Business Intelligence — eleven members split between Tunisia and France. " +
      "Amaris regularly invests in internal tooling, and this platform is exactly that kind of initiative."
    );
  }

  // Problem statement
  {
    const s = newSlide();
    kicker(s, "Context", RED);
    contentTitle(s, "The operational gap");
    s.addText("ETL pipelines were run manually — entirely dependent on individual technical knowledge", {
      x: 0.7, y: 1.55, w: 11, h: 0.4, fontFace: BODY, italic: true, fontSize: 13.5, color: MUTED, margin: 0,
    });
    const pains = [
      { icon: "terminal", t: "Manual CLI execution", d: "Every run needed a developer to set up venvs & paths by hand" },
      { icon: "clock", t: "No scheduling", d: "Recurring runs triggered manually — risk of missed cycles" },
      { icon: "database", t: "No pipeline registry", d: "No structured place to register, validate or monitor pipelines" },
      { icon: "search", t: "No observability", d: "Failed runs were hard to diagnose, no execution history" },
      { icon: "lock", t: "No access control", d: "Everyone with codebase access had equal control" },
      { icon: "bell", t: "No notifications", d: "Results had to be collected and shared manually" },
    ];
    const cols = 3, gap = 0.3;
    const cardW = (W - 1.4 - gap * (cols - 1)) / cols, cardH = 2.05;
    pains.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 0.7 + col * (cardW + gap), y = 2.25 + row * (cardH + gap);
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: cardW, h: cardH, fill: { color: WHITE }, line: { color: BORDER, width: 1 }, shadow: freshShadow() });
      iconChip(s, p.icon, x + 0.25, y + 0.25, 0.55, RED_BG, RED, 0.55);
      s.addText(p.t, { x: x + 0.95, y: y + 0.25, w: cardW - 1.2, h: 0.55, fontFace: BODY, bold: true, fontSize: 13, color: NAVY, margin: 0, valign: "middle" });
      s.addText(p.d, { x: x + 0.25, y: y + 0.95, w: cardW - 0.5, h: 1.0, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.2 });
    });
    autoPageNum(s);
    s.addNotes(
      "As the number of ETL pipelines grew at Amaris, the lack of a central tool became a real problem. " +
      "Every script had to be started by hand from the command line, by someone who knew how to do it. There was no scheduling, no central list of pipelines, " +
      "no way to see past runs, no separation between who manages a pipeline and who just runs it, and no automatic way to send results. " +
      "If the one person who knew how to run a script was away, the whole process stopped. " +
      "We also looked at tools like Airflow and Prefect, but they need you to rewrite your scripts to fit their system, and they are made for technical users, " +
      "not for someone who just wants to click a button and run a report."
    );
  }

  dividerSlide("Part 02", "Proposed Solution", "Treat every ETL as a managed, parameterisable workflow unit", "project");

  // Proposed solution
  {
    const s = newSlide();
    kicker(s, "Solution");
    contentTitle(s, "The proposed approach");
    s.addText("Automate the full lifecycle — without requiring scripting or infrastructure knowledge from end users", {
      x: 0.7, y: 1.55, w: 11.5, h: 0.4, fontFace: BODY, italic: true, fontSize: 13.5, color: MUTED, margin: 0,
    });
    const steps = [
      { icon: "upload", t: "Register", d: "Admin uploads a ZIP — script untouched" },
      { icon: "check", t: "Validate & Activate", d: "Two-step gate before users can launch" },
      { icon: "play", t: "Guided Execution", d: "Users override config, classify paths, launch" },
      { icon: "bell", t: "Notify & Deliver", d: "In-app + email reports, output files" },
      { icon: "clock", t: "Automate", d: "Recurring schedules fire on their own" },
    ];
    const n = steps.length;
    const boxW = 2.05, boxH = 1.55, gapX = (W - 1.4 - boxW * n) / (n - 1);
    let x = 0.7;
    const y = 3.1;
    steps.forEach((st, i) => {
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: boxW, h: boxH, fill: { color: WHITE }, line: { color: BLUE_BORDER, width: 1.25 }, shadow: freshShadow() });
      iconChip(s, st.icon, x + (boxW - 0.55) / 2, y + 0.18, 0.55, BLUE_BG, BLUE, 0.55);
      s.addText(st.t, { x: x - 0.1, y: y + 0.82, w: boxW + 0.2, h: 0.35, fontFace: BODY, bold: true, fontSize: 12, color: NAVY, align: "center", margin: 0 });
      s.addText(st.d, { x: x - 0.1, y: y + 1.13, w: boxW + 0.2, h: 0.42, fontFace: BODY, fontSize: 9.5, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.1 });
      if (i < n - 1) {
        s.addShape(pres.shapes.RIGHT_ARROW, { x: x + boxW + gapX / 2 - 0.32, y: y + boxH / 2 - 0.12, w: gapX - 0.16, h: 0.24, fill: { color: MUTED2 }, line: { type: "none" } });
      }
      x += boxW + gapX;
    });
    const bottomNote = ["Role-based access (Admin / User)", "Supervised execution, never silent", "No CLI, no infra knowledge required"];
    let bx = 0.7;
    bottomNote.forEach(t => {
      s.addShape(pres.shapes.OVAL, { x: bx, y: 5.35, w: 0.16, h: 0.16, fill: { color: GREEN }, line: { type: "none" } });
      s.addText(t, { x: bx + 0.28, y: 5.18, w: 3.7, h: 0.5, fontFace: BODY, fontSize: 11.5, color: SLATE_MUTED, margin: 0, valign: "middle" });
      bx += 3.95;
    });
    autoPageNum(s);
    s.addNotes(
      "The platform takes each ETL pipeline and manages its whole life, from upload to delivery. " +
      "An admin uploads the script inside a ZIP file, exactly as it is — no changes needed. " +
      "Before anyone can use it, the ETL must go through two steps: validation, then activation. " +
      "After that, a normal user can open it, change some settings for their own run, choose which files are inputs and which are outputs, and launch it. " +
      "Once it finishes, they get notified automatically. The same ETL can also be set to run on its own, on a schedule, without anyone clicking launch. " +
      "And at every step, the system always knows if someone is an admin or a normal user, and limits what they can do."
    );
  }

  dividerSlide("Part 03", "Project Initiation", "Methodology, environment, and the architectural choices behind the platform", "cogs");

  // Methodology
  {
    const s = newSlide();
    kicker(s, "Methodology");
    contentTitle(s, "Scrum — roles, sprints, modules");
    s.addText("TEAM ROLES", { x: 0.7, y: 1.95, w: 4, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: MUTED, charSpacing: 1.5, margin: 0 });
    const roles = [
      { icon: "userShield", t: "Scrum Master / Tech Lead", d: "Technical supervision & sprint planning" },
      { icon: "users", t: "Product Owner", d: "Business needs, backlog, deliverable validation" },
      { icon: "code", t: "Development Team", d: "DCI team members across Tunisia & France" },
    ];
    let ry = 2.35;
    roles.forEach(r => {
      iconChip(s, r.icon, 0.7, ry, 0.5, BLUE_BG, BLUE, 0.55);
      s.addText(r.t, { x: 1.35, y: ry - 0.02, w: 4.3, h: 0.32, fontFace: BODY, bold: true, fontSize: 12.5, color: NAVY, margin: 0 });
      s.addText(r.d, { x: 1.35, y: ry + 0.28, w: 4.3, h: 0.45, fontFace: BODY, fontSize: 10.5, color: MUTED, margin: 0 });
      ry += 0.95;
    });
    s.addText("5 SPRINTS  →  4 PRESENTATION MODULES", { x: 6.5, y: 1.95, w: 6.2, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: MUTED, charSpacing: 1, margin: 0 });
    const mods = [
      { n: "M1", t: "Auth & User Management", c: BLUE },
      { n: "M2", t: "ETL Pipeline Management", c: GREEN },
      { n: "M3", t: "Execution Engine & Notifications", c: AMBER },
      { n: "M4", t: "Scheduling & Analytics", c: PURPLE },
    ];
    let my = 2.35;
    mods.forEach(m => {
      s.addShape(pres.shapes.RECTANGLE, { x: 6.5, y: my, w: 6.15, h: 0.78, fill: { color: BG_TINT }, line: { color: BORDER, width: 1 } });
      s.addShape(pres.shapes.RECTANGLE, { x: 6.5, y: my, w: 0.08, h: 0.78, fill: { color: m.c }, line: { type: "none" } });
      s.addText(m.n, { x: 6.75, y: my, w: 0.7, h: 0.78, fontFace: HEAD, bold: true, fontSize: 16, color: m.c, valign: "middle", margin: 0 });
      s.addText(m.t, { x: 7.5, y: my, w: 5.0, h: 0.78, fontFace: BODY, bold: true, fontSize: 13, color: NAVY, valign: "middle", margin: 0 });
      my += 0.98;
    });
    s.addText("≈ 20–21 weeks of development, tracked through daily stand-ups, sprint reviews & retrospectives.", {
      x: 0.7, y: 6.45, w: 11.9, h: 0.4, fontFace: BODY, italic: true, fontSize: 11.5, color: MUTED, margin: 0,
    });
    autoPageNum(s);
    s.addNotes(
      "I used Scrum for this project. A technical lead guided the development and planned the sprints. A product owner managed the list of features and " +
      "checked the work at the end of each sprint. The team worked together with daily short meetings. " +
      "For this presentation, I grouped the five sprints into four modules, and that is how I will present the platform. " +
      "In total, the project took about twenty to twenty-one weeks."
    );
  }

  // Architecture & stack
  {
    const s = newSlide();
    kicker(s, "Project Initiation");
    contentTitle(s, "Architecture & technology stack");
    const tiers = [
      { t: "Presentation", d: "React + TypeScript", icon: "react", c: BLUE },
      { t: "Application", d: "Django + DRF · Execution Engine · Scheduler", icon: "server", c: AMBER },
      { t: "Data", d: "PostgreSQL", icon: "database", c: GREEN },
    ];
    const tw = 3.55, th = 1.35, gap = 0.55;
    let tx = 0.7;
    const ty = 2.1;
    tiers.forEach((t, i) => {
      s.addShape(pres.shapes.RECTANGLE, { x: tx, y: ty, w: tw, h: th, fill: { color: WHITE }, line: { color: t.c, width: 1.5 }, shadow: freshShadow() });
      iconChip(s, t.icon, tx + 0.2, ty + (th - 0.55) / 2, 0.55, BG_TINT, t.c, 0.55);
      s.addText(t.t, { x: tx + 0.9, y: ty + 0.18, w: tw - 1.0, h: 0.4, fontFace: BODY, bold: true, fontSize: 13.5, color: NAVY, margin: 0 });
      s.addText(t.d, { x: tx + 0.9, y: ty + 0.6, w: tw - 1.0, h: 0.65, fontFace: BODY, fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.15 });
      if (i < tiers.length - 1) {
        s.addShape(pres.shapes.RIGHT_ARROW, { x: tx + tw + gap / 2 - 0.18, y: ty + th / 2 - 0.1, w: gap - 0.1, h: 0.2, fill: { color: MUTED2 }, line: { type: "none" } });
        const lbl = i === 0 ? "REST / JSON" : "Django ORM";
        s.addText(lbl, { x: tx + tw - 0.2, y: ty - 0.32, w: gap + 0.4, h: 0.3, fontFace: BODY, fontSize: 8.5, color: MUTED2, align: "center", margin: 0 });
      }
      tx += tw + gap;
    });
    s.addText("MTV pattern inside Django: Model = ORM · View = DRF ViewSets · Template = delegated entirely to React", {
      x: 0.7, y: 3.85, w: 11.9, h: 0.35, fontFace: BODY, italic: true, fontSize: 11.5, color: MUTED, margin: 0,
    });
    const stack = [
      { icon: "python", t: "Python" }, { icon: "server", t: "Django + DRF" }, { icon: "database", t: "PostgreSQL" },
      { icon: "react", t: "React + TS" }, { icon: "trend", t: "Recharts" }, { icon: "git", t: "Git / GitHub" }, { icon: "cube", t: "venv" },
    ];
    const sw = (W - 1.4) / stack.length;
    stack.forEach((it, i) => {
      const x = 0.7 + i * sw + sw / 2 - 0.42;
      iconChip(s, it.icon, x, 4.6, 0.85, NAVY, "60A5FA", 0.5);
      s.addText(it.t, { x: 0.7 + i * sw, y: 5.55, w: sw, h: 0.6, fontFace: BODY, fontSize: 10, color: SLATE_MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.1 });
    });
    autoPageNum(s);
    s.addNotes(
      "The platform is built in three layers. React and TypeScript handle the interface. Django and DRF handle the logic — this is also where the execution " +
      "engine and the scheduler live. PostgreSQL stores the data. " +
      "Inside Django, I follow its normal pattern: the Model is the database layer, the View handles each request, and the page itself is built by React, " +
      "since this is just an API, not a normal website with pages. " +
      "For the tools: Python everywhere on the backend, Django REST Framework for the API, PostgreSQL for the database, React with TypeScript for the frontend, " +
      "and a separate Python virtual environment for each ETL, so they never share dependencies."
    );
  }

  dividerSlide("Part 04", "The Platform", "Four modules — and the technical core of this project: execution and scheduling", "cube");

  // Module 1 — Auth
  {
    const s = newSlide();
    kicker(s, "Module 1");
    contentTitle(s, "Authentication & Access Management");
    const left = [
      { icon: "lock", t: "JWT authentication", d: "Short-lived access token + silent refresh" },
      { icon: "userShield", t: "Role-based access", d: "Admin inherits every User capability, plus privileged ops" },
      { icon: "users", t: "Group-based visibility", d: "Users see only ETLs assigned to their group(s)" },
    ];
    let ly = 2.2;
    left.forEach(it => {
      iconChip(s, it.icon, 0.7, ly, 0.62, BLUE_BG, BLUE, 0.55);
      s.addText(it.t, { x: 1.5, y: ly + 0.02, w: 4.7, h: 0.36, fontFace: BODY, bold: true, fontSize: 14, color: NAVY, margin: 0 });
      s.addText(it.d, { x: 1.5, y: ly + 0.38, w: 4.7, h: 0.5, fontFace: BODY, fontSize: 11.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.15 });
      ly += 1.18;
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 6.9, y: 2.15, w: 5.75, h: 3.35, fill: { color: NAVY }, line: { type: "none" } });
    s.addText("ETL VISIBILITY RULE", { x: 7.3, y: 2.4, w: 5, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: "60A5FA", charSpacing: 1.5, margin: 0 });
    s.addText([
      { text: "No groups assigned  →  ", options: { color: "CBD5E1" } },
      { text: "visible to everyone", options: { bold: true, color: GREEN_BG } },
    ], { x: 7.3, y: 2.78, w: 5.1, h: 0.5, fontFace: BODY, fontSize: 13, margin: 0 });
    s.addText([
      { text: "Groups assigned  →  ", options: { color: "CBD5E1" } },
      { text: "restricted to members only", options: { bold: true, color: "FCA5A5" } },
    ], { x: 7.3, y: 3.24, w: 5.1, h: 0.5, fontFace: BODY, fontSize: 13, margin: 0 });
    s.addShape(pres.shapes.LINE, { x: 7.3, y: 3.85, w: 4.95, h: 0, line: { color: "334155", width: 1 } });
    s.addText("Enforced inside ETLViewSet.get_queryset() — a single Django ORM query, not an after-the-fact filter.", {
      x: 7.3, y: 4.0, w: 4.95, h: 1.35, fontFace: BODY, italic: true, fontSize: 11.5, color: MUTED2, margin: 0, lineSpacingMultiple: 1.3,
    });
    screenshotPlaceholder(s, 0.7, 5.75, 11.95, 1.0, "Screenshot — Login screen & User / Group management");
    autoPageNum(s);
    s.addNotes(
      "The first module is the base for everything else: who can log in, and what they can see. " +
      "Login uses tokens — a short one for normal use, and a second one used quietly in the background to renew it, so the user is never logged out by surprise. " +
      "An admin is simply a user with extra rights — there is no separate admin account type. " +
      "The important rule is about visibility: when a new ETL is created, every user can see it. Once an admin assigns it to one or more groups, only the members " +
      "of those groups can see it. This rule is checked directly in the database query, every single time the list is loaded — not as a separate filter added later."
    );
  }

  // Module 2 — ETL lifecycle
  {
    const s = newSlide();
    kicker(s, "Module 2");
    contentTitle(s, "ETL Pipeline Management");
    s.addText("Every pipeline goes through a strict, three-step gate before anyone can run it", {
      x: 0.7, y: 1.55, w: 11, h: 0.4, fontFace: BODY, italic: true, fontSize: 13.5, color: MUTED, margin: 0,
    });
    const steps = [
      { icon: "fileArchive", t: "Upload", d: "ZIP extracted safely — path-traversal filtered, files searched recursively", c: MUTED, bg: "F1F5F9" },
      { icon: "check", t: "Validate", d: "Entry point, config & requirements re-resolved — strict, blocks on failure", c: AMBER, bg: AMBER_BG },
      { icon: "play", t: "Activate", d: "Becomes visible & launchable to its assigned groups", c: GREEN, bg: GREEN_BG },
    ];
    const bw = 3.55, bh = 2.5, gap = 0.55;
    let x = 0.7; const y = 2.25;
    steps.forEach((st, i) => {
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: bw, h: bh, fill: { color: WHITE }, line: { color: BORDER, width: 1 }, shadow: freshShadow() });
      s.addShape(pres.shapes.RECTANGLE, { x, y, w: bw, h: 0.08, fill: { color: st.c }, line: { type: "none" } });
      iconChip(s, st.icon, x + (bw - 0.7) / 2, y + 0.35, 0.7, st.bg, st.c, 0.55);
      s.addText(`${i + 1}.  ${st.t}`, { x, y: y + 1.2, w: bw, h: 0.4, fontFace: BODY, bold: true, fontSize: 15, color: NAVY, align: "center", margin: 0 });
      s.addText(st.d, { x: x + 0.25, y: y + 1.62, w: bw - 0.5, h: 0.8, fontFace: BODY, fontSize: 10.5, color: MUTED, align: "center", margin: 0, lineSpacingMultiple: 1.2 });
      if (i < steps.length - 1) {
        s.addShape(pres.shapes.RIGHT_ARROW, { x: x + bw + gap / 2 - 0.18, y: y + bh / 2 - 0.1, w: gap - 0.1, h: 0.2, fill: { color: MUTED2 }, line: { type: "none" } });
      }
      x += bw + gap;
    });
    s.addText([
      { text: "Key detail:  ", options: { bold: true, color: NAVY } },
      { text: "admin types a filename (e.g. main.py) — resolved recursively to an absolute path, regardless of folder depth.   ", options: { color: MUTED } },
      { text: "Security:  ", options: { bold: true, color: NAVY } },
      { text: "every ZIP entry is checked against the target directory before extraction — path-traversal entries are silently skipped.", options: { color: MUTED } },
    ], { x: 0.7, y: 5.0, w: 11.95, h: 0.65, fontFace: BODY, fontSize: 11.5, margin: 0, lineSpacingMultiple: 1.3 });
    screenshotPlaceholder(s, 0.7, 5.75, 11.95, 1.0, "Screenshot — ETL upload form & ETL card (validate / activate)");
    autoPageNum(s);
    s.addNotes(
      "Module two covers how a pipeline gets added to the platform. The admin packs the whole project — script, config file, requirements file — into a ZIP, " +
      "and uploads it exactly as it is, with no changes. " +
      "The platform unzips it safely, and removes any file path that tries to escape outside the folder, which is a basic security check. " +
      "Then it searches inside the ZIP for the main script, the config file, and the requirements file, by name, even if they are inside a subfolder. " +
      "It reads the config file no matter its format, and saves it. " +
      "Validation checks all of this again, and fails clearly if something important is missing, like the main script. " +
      "Only after validation passes can the admin activate the ETL and make it usable."
    );
  }

  // Module 3a — Execution lifecycle & isolation
  {
    const s = newSlide();
    kicker(s, "Module 3");
    contentTitle(s, "Execution Engine — lifecycle & isolation");
    s.addText("Every run is isolated, traceable, and supervised end-to-end", {
      x: 0.7, y: 1.55, w: 11, h: 0.4, fontFace: BODY, italic: true, fontSize: 13.5, color: MUTED, margin: 0,
    });
    const flow = [
      { t: "PENDING", c: MUTED }, { t: "VALIDATED", c: BLUE }, { t: "INSTALLING_DEPS", c: AMBER }, { t: "RUNNING", c: AMBER },
    ];
    const fbw = 1.95, fbh = 0.85, fgap = 0.3;
    let fx = 0.7; const fy = 2.25;
    flow.forEach((f, i) => {
      s.addShape(pres.shapes.RECTANGLE, { x: fx, y: fy, w: fbw, h: fbh, fill: { color: WHITE }, line: { color: f.c, width: 1.5 } });
      s.addText(f.t, { x: fx, y: fy, w: fbw, h: fbh, fontFace: BODY, bold: true, fontSize: 11, color: f.c, align: "center", valign: "middle", margin: 0 });
      if (i < flow.length - 1) {
        s.addShape(pres.shapes.RIGHT_ARROW, { x: fx + fbw + fgap / 2 - 0.12, y: fy + fbh / 2 - 0.09, w: fgap - 0.06, h: 0.18, fill: { color: MUTED2 }, line: { type: "none" } });
      }
      fx += fbw + fgap;
    });
    s.addShape(pres.shapes.RIGHT_ARROW, { x: fx + 0.05, y: fy + fbh / 2 - 0.09, w: 0.4, h: 0.18, fill: { color: MUTED2 }, line: { type: "none" } });
    const endX = fx + 0.5;
    s.addShape(pres.shapes.RECTANGLE, { x: endX, y: fy - 0.55, w: 1.7, h: 0.7, fill: { color: GREEN_BG }, line: { color: GREEN, width: 1.5 } });
    s.addText("SUCCESS", { x: endX, y: fy - 0.55, w: 1.7, h: 0.7, fontFace: BODY, bold: true, fontSize: 12, color: GREEN, align: "center", valign: "middle", margin: 0 });
    s.addShape(pres.shapes.RECTANGLE, { x: endX, y: fy + 0.55, w: 1.7, h: 0.7, fill: { color: RED_BG }, line: { color: RED, width: 1.5 } });
    s.addText("FAILED", { x: endX, y: fy + 0.55, w: 1.7, h: 0.7, fontFace: BODY, bold: true, fontSize: 12, color: RED, align: "center", valign: "middle", margin: 0 });
    s.addText("(CANCELLED reachable from any non-terminal state — user can stop a run at any time)", {
      x: 0.7, y: 3.55, w: 11.5, h: 0.35, fontFace: BODY, italic: true, fontSize: 10.5, color: MUTED2, margin: 0,
    });
    const facts = [
      { icon: "layers", t: "Isolated working directory", d: "Per-execution copy — concurrent runs never collide" },
      { icon: "cube", t: "Shared venv per ETL", d: "Created once, reused — installed only when deps change" },
      { icon: "search", t: "3-criteria outcome detection", d: "Return code · stderr exceptions · output file presence" },
      { icon: "sync", t: "Thread pool concurrency", d: "Different ETLs run in parallel; 1 run per ETL per user" },
    ];
    const fcw = (W - 1.4 - 0.3 * 3) / 4;
    facts.forEach((f, i) => {
      const x = 0.7 + i * (fcw + 0.3);
      const y = 4.35;
      iconChip(s, f.icon, x, y, 0.5, BLUE_BG, BLUE, 0.55);
      s.addText(f.t, { x, y: y + 0.62, w: fcw, h: 0.55, fontFace: BODY, bold: true, fontSize: 11.5, color: NAVY, margin: 0, lineSpacingMultiple: 1.1 });
      s.addText(f.d, { x, y: y + 1.2, w: fcw, h: 0.95, fontFace: BODY, fontSize: 10, color: MUTED, margin: 0, lineSpacingMultiple: 1.15 });
    });
    autoPageNum(s);
    s.addNotes(
      "This is the heart of the platform. When a user clicks launch, the run moves through clear steps: pending, validated, installing dependencies if needed, " +
      "running, and finally success or failed. The user can cancel it at any point before it finishes. " +
      "Each run gets its own private folder, so if two people run the same ETL at the same time, they never interfere with each other. " +
      "The Python packages it needs are installed once into a shared environment for that ETL, and reused after that — installing them again every time would " +
      "just waste time. " +
      "To decide if a run succeeded or failed, the system checks three things in order: did the script exit with an error code, is there an error message in the " +
      "logs, and did it actually produce an output file. If a script runs without crashing but makes no output, we still count that as a failure, because that " +
      "is usually a real problem."
    );
  }

  // Module 3b — Background threads, processes & live polling
  {
    const s = newSlide();
    kicker(s, "Module 3");
    contentTitle(s, "Execution Engine — running it in the background");
    s.addText("A background thread launches a real OS process — and the browser polls it live", {
      x: 0.7, y: 1.55, w: 11.5, h: 0.4, fontFace: BODY, italic: true, fontSize: 13, color: MUTED, margin: 0,
    });

    s.addText("LAUNCH PATH", { x: 0.7, y: 2.05, w: 5, h: 0.25, fontFace: BODY, bold: true, fontSize: 10, color: MUTED, charSpacing: 1.5, margin: 0 });
    flowRow(s, [
      { t: "Browser", d: "clicks Launch", fs: 11 },
      { t: "API thread", d: "returns instantly", c: BLUE_BORDER, bg: BLUE_BG, fs: 11 },
      { t: "Background thread", d: "subprocess.Popen( )", c: AMBER, bg: AMBER_BG, fs: 10 },
      { t: "OS Process", d: "PID stored on Execution", c: NAVY, bg: NAVY, tc: WHITE, fs: 11 },
    ], 0.7, 2.35, 2.6, 0.85, 0.25);

    s.addText("LIVE STATUS — POLLED FROM THE BROWSER", { x: 0.7, y: 3.42, w: 8, h: 0.25, fontFace: BODY, bold: true, fontSize: 10, color: MUTED, charSpacing: 1.5, margin: 0 });
    flowRow(s, [
      { t: "Execution row (DB)", d: "status column updated at each step", fs: 10.5 },
      { t: "Poll every 2s", d: "GET /executions/<id>/", c: BLUE_BORDER, bg: BLUE_BG, fs: 10.5 },
      { t: "Browser UI", d: "progress steps update live", fs: 10.5 },
    ], 0.7, 3.72, 3.5, 0.85, 0.3);

    s.addText([
      { text: "Cancel:  ", options: { bold: true, color: NAVY } },
      { text: "sets ", options: { color: MUTED } },
      { text: "cancel_requested = True", options: { fontFace: "Consolas", color: NAVY } },
      { text: ", then retrieves the stored PID and runs ", options: { color: MUTED } },
      { text: "taskkill /F /T /PID", options: { fontFace: "Consolas", color: NAVY } },
      { text: " (Windows) or a process-group kill (Linux) — the script and every child process it spawned are terminated.", options: { color: MUTED } },
    ], { x: 0.7, y: 4.95, w: 11.95, h: 0.6, fontFace: BODY, fontSize: 11, margin: 0, lineSpacingMultiple: 1.3 });

    screenshotPlaceholder(s, 0.7, 5.7, 11.95, 1.0, "Screenshot — Live execution progress & log viewer");
    autoPageNum(s);
    s.addNotes(
      "Let me show what happens right after the user clicks launch. " +
      "The server starts a background task and answers the browser right away — it does not wait for the script to finish. Without this, the page would just " +
      "freeze for as long as the script runs, which can be twenty minutes for a big report. " +
      "That background task then starts the ETL script as its own separate process on the computer, completely apart from the website itself, and it saves " +
      "the process number right away, so it can find it again later. " +
      "After that, the website checks the run's status every two seconds and updates the screen, so the user always sees what is really happening, not just a " +
      "loading icon. " +
      "If the user clicks Cancel, the platform takes that saved process number and stops the whole process, along with anything it started — not just one part of it."
    );
  }

  // Module 3c — Concurrency & Notifications
  {
    const s = newSlide();
    kicker(s, "Module 3");
    contentTitle(s, "Concurrency, Notifications & Reports");
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 2.15, w: 5.7, h: 4.1, fill: { color: BG_TINT }, line: { color: BORDER, width: 1 } });
    s.addText("CONCURRENT EXECUTION MODEL", { x: 1.0, y: 2.4, w: 5.1, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: MUTED, charSpacing: 1, margin: 0 });
    const lanes = [{ t: "User A — ETL 1", c: BLUE }, { t: "User B — ETL 1", c: BLUE }, { t: "User C — ETL 2", c: AMBER }];
    let lly = 2.85;
    lanes.forEach(l => {
      s.addShape(pres.shapes.RECTANGLE, { x: 1.0, y: lly, w: 4.0, h: 0.5, fill: { color: WHITE }, line: { color: l.c, width: 1.25 } });
      s.addText(l.t, { x: 1.2, y: lly, w: 3.6, h: 0.5, fontFace: BODY, fontSize: 11.5, color: NAVY, valign: "middle", margin: 0 });
      iconChip(s, "play", 5.15, lly + 0.08, 0.34, "FFFFFF", GREEN, 0.65);
      lly += 0.68;
    });
    s.addText("Different ETLs run in parallel via a thread pool. The same ETL can run for two different users simultaneously — but never twice for the same user.", {
      x: 1.0, y: 5.05, w: 5.1, h: 0.95, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0, lineSpacingMultiple: 1.25,
    });
    s.addText("File-based lock protects shared venv creation from race conditions when two users launch the same new ETL at once.", {
      x: 1.0, y: 5.85, w: 5.1, h: 0.7, fontFace: BODY, italic: true, fontSize: 10.5, color: MUTED2, margin: 0, lineSpacingMultiple: 1.25,
    });
    s.addText("NOTIFICATION & REPORT FLOW", { x: 6.8, y: 2.4, w: 5.8, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: MUTED, charSpacing: 1, margin: 0 });
    const notifSteps = [
      { icon: "check", t: "Execution finishes", d: "SUCCESS or FAILED determined" },
      { icon: "bell", t: "In-app notification", d: "Launching user + all admins (audit trail)" },
      { icon: "envelope", t: "Optional email report", d: "HTML report with config, overrides, outputs" },
    ];
    let ny = 2.85;
    notifSteps.forEach(n => {
      iconChip(s, n.icon, 6.8, ny, 0.5, BLUE_BG, BLUE, 0.55);
      s.addText(n.t, { x: 7.45, y: ny + 0.0, w: 5.0, h: 0.32, fontFace: BODY, bold: true, fontSize: 12.5, color: NAVY, margin: 0 });
      s.addText(n.d, { x: 7.45, y: ny + 0.33, w: 5.0, h: 0.45, fontFace: BODY, fontSize: 10.5, color: MUTED, margin: 0 });
      ny += 0.95;
    });
    s.addText("Email failures are logged on the execution and visible to admins — but never affect the run's actual outcome.", {
      x: 6.8, y: 5.85, w: 5.85, h: 0.7, fontFace: BODY, italic: true, fontSize: 10.5, color: MUTED2, margin: 0, lineSpacingMultiple: 1.25,
    });
    autoPageNum(s);
    s.addNotes(
      "Two more points here. First, several ETLs can run at the same time — up to four by default. Even the same ETL can run for two different users " +
      "at the same time, because each run has its own folder. The only thing that is blocked is one user running the same ETL twice at once. " +
      "There is also a small lock in place so that if two users start the same new ETL at the exact same moment, the environment is only built once, " +
      "not twice. " +
      "Second, every finished run sends a notification inside the app, to the user and to all admins, and can also send an email report if the user asked for one."
    );
  }

  // Module 4a — Scheduling: the background polling loop
  {
    const s = newSlide();
    kicker(s, "Module 4");
    contentTitle(s, "Scheduling Engine — the background polling loop");
    s.addText("A daemon thread, started automatically on server boot, wakes every 60 seconds", {
      x: 0.7, y: 1.55, w: 11.5, h: 0.4, fontFace: BODY, italic: true, fontSize: 13, color: MUTED, margin: 0,
    });

    flowRow(s, [
      { t: "Wake", d: "every 60s", fs: 11 },
      { t: "Evaluate", d: "active schedules", fs: 11 },
      { t: "Due &", d: "not yet fired?", c: AMBER, bg: AMBER_BG, fs: 11 },
      { t: "Create PENDING", d: "execution", c: BLUE_BORDER, bg: BLUE_BG, fs: 10.5 },
      { t: "Notify", d: "recipients", c: GREEN, bg: GREEN_BG, fs: 11 },
    ], 0.7, 2.15, 2.05, 0.85, 0.22);

    const facts = [
      { icon: "sync", t: "Atomic, race-safe", d: "A single SQL UPDATE on last_triggered_at — never fires the same schedule twice in one minute, even under concurrent ticks" },
      { icon: "calendar", t: "Day clamping", d: "A schedule set for day 31 fires on day 28 in February — computed automatically, no special configuration" },
      { icon: "userCheck", t: "Human confirmation, always", d: "The scheduler only ever creates a PENDING execution — a user must still review and click Launch" },
    ];
    const fcw = 3.75, fgap = 0.3;
    facts.forEach((f, i) => {
      const x = 0.7 + i * (fcw + fgap);
      s.addShape(pres.shapes.RECTANGLE, { x, y: 3.3, w: fcw, h: 1.55, fill: { color: WHITE }, line: { color: BORDER, width: 1 }, shadow: freshShadow() });
      iconChip(s, f.icon, x + 0.2, 3.5, 0.45, BLUE_BG, BLUE, 0.55);
      s.addText(f.t, { x: x + 0.78, y: 3.5, w: fcw - 1.0, h: 0.45, fontFace: BODY, bold: true, fontSize: 11.5, color: NAVY, margin: 0, valign: "middle", lineSpacingMultiple: 1.1 });
      s.addText(f.d, { x: x + 0.2, y: 4.05, w: fcw - 0.4, h: 0.75, fontFace: BODY, fontSize: 9.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.2 });
    });

    s.addText([
      { text: "ETLSchedule.objects.filter(id=schedule.id).update(last_triggered_at=now)", options: { fontFace: "Consolas", color: NAVY } },
    ], { x: 0.7, y: 5.05, w: 11.95, h: 0.32, fontFace: BODY, fontSize: 11, margin: 0 });
    s.addText("Direct SQL UPDATE, not a Python round-trip — safe even if two polling ticks overlap.", {
      x: 0.7, y: 5.38, w: 11.95, h: 0.3, fontFace: BODY, italic: true, fontSize: 10, color: MUTED, margin: 0,
    });
    screenshotPlaceholder(s, 0.7, 5.85, 11.95, 0.95, "Screenshot — Admin schedule editor (frequency, notify target)");
    autoPageNum(s);
    s.addNotes(
      "I want to explain scheduling in detail, because this is the only part of the platform that runs completely on its own, with no one clicking anything. " +
      "It is a background task that starts automatically when the server starts — nothing needs to be turned on manually. " +
      "Every sixty seconds it wakes up, looks at every schedule that is active, and checks if any of them are due, based on the frequency and time the admin set. " +
      "If one is due, it also checks that it has not already run in the last minute, just to be safe. " +
      "That check is done with one direct update to the database, so even if the check runs twice by accident, it still cannot create the same run twice. " +
      "If someone sets a schedule for the 31st of every month, and the month is shorter, like February, it simply runs on the last day of that month — the user " +
      "does not need to configure anything special for that. " +
      "And importantly, the scheduler never runs the script by itself. It only creates a run that is waiting, and sends a notification — a real person still has " +
      "to open it and press launch."
    );
  }

  // Module 4b — Scheduling: requests & approval
  {
    const s = newSlide();
    kicker(s, "Module 4");
    contentTitle(s, "Scheduling — independent requests, one source of truth");
    s.addText("Any user with access can request a schedule — one approval becomes the rule for everyone", {
      x: 0.7, y: 1.55, w: 11.5, h: 0.4, fontFace: BODY, italic: true, fontSize: 13, color: MUTED, margin: 0,
    });

    const users = ["User A — requests independently", "User B — requests independently", "User C — requests independently"];
    let uy = 2.3;
    users.forEach(t => {
      s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: uy, w: 3.0, h: 0.6, fill: { color: WHITE }, line: { color: BORDER, width: 1.25 } });
      s.addText(t, { x: 0.85, y: uy, w: 2.7, h: 0.6, fontFace: BODY, fontSize: 10, color: NAVY, valign: "middle", margin: 0, lineSpacingMultiple: 1.1 });
      uy += 0.75;
    });
    s.addShape(pres.shapes.RIGHT_ARROW, { x: 3.75, y: 3.27, w: 0.3, h: 0.16, fill: { color: MUTED2 }, line: { type: "none" } });
    s.addShape(pres.shapes.RECTANGLE, { x: 4.1, y: 2.7, w: 2.4, h: 1.3, fill: { color: NAVY }, line: { type: "none" } });
    s.addText("Admin reviews\n& approves ONE", { x: 4.25, y: 2.7, w: 2.1, h: 1.3, fontFace: BODY, bold: true, fontSize: 12, color: WHITE, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.2 });
    s.addShape(pres.shapes.RIGHT_ARROW, { x: 6.55, y: 2.97, w: 0.4, h: 0.16, fill: { color: GREEN }, line: { type: "none" } });
    s.addShape(pres.shapes.RIGHT_ARROW, { x: 6.55, y: 4.17, w: 0.4, h: 0.16, fill: { color: MUTED2 }, line: { type: "none" } });
    s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 2.55, w: 3.0, h: 1.0, fill: { color: GREEN_BG }, line: { color: GREEN, width: 1.25 } });
    s.addText("Becomes the ETL's schedule — for everyone", { x: 7.15, y: 2.55, w: 2.7, h: 1.0, fontFace: BODY, bold: true, fontSize: 11, color: NAVY, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.15 });
    s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 3.75, w: 3.0, h: 1.0, fill: { color: BG_TINT }, line: { color: BORDER, width: 1.25 } });
    s.addText("Other pending requests — auto-rejected, requesters notified", { x: 7.15, y: 3.75, w: 2.7, h: 1.0, fontFace: BODY, fontSize: 10.5, color: SLATE_MUTED, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.15 });

    s.addText([
      { text: "Enforced at the database level:  ", options: { bold: true, color: NAVY } },
      { text: "ETLSchedule.etl", options: { fontFace: "Consolas", color: NAVY } },
      { text: " is a ", options: { color: MUTED } },
      { text: "OneToOneField", options: { fontFace: "Consolas", color: NAVY } },
      { text: " — a UNIQUE constraint guarantees at most one active schedule per ETL, always.", options: { color: MUTED } },
    ], { x: 0.7, y: 4.95, w: 11.95, h: 0.4, fontFace: BODY, fontSize: 11, margin: 0, lineSpacingMultiple: 1.3 });
    screenshotPlaceholder(s, 0.7, 5.5, 11.95, 1.3, "Screenshot — Schedule request & approval panel");
    autoPageNum(s);
    s.addNotes(
      "There is one more part of scheduling I want to show, because it solves a real problem. Several users with access to the same ETL can each ask for a " +
      "schedule on their own, without waiting for each other. An admin then looks at all the requests and approves just one. As soon as that happens, it becomes " +
      "the schedule for that ETL, for everyone, and all the other requests for it are closed automatically, with a message explaining why. " +
      "This rule is not just a check in the code — it is also set up directly in the database, so it is actually impossible to ever end up with two active " +
      "schedules on the same ETL at the same time."
    );
  }

  // Module 4c — Analytics
  {
    const s = newSlide();
    kicker(s, "Module 4");
    contentTitle(s, "Analytics & Personal Dashboards");
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 2.1, w: 5.7, h: 2.85, fill: { color: WHITE }, line: { color: BLUE_BORDER, width: 1.25 }, shadow: freshShadow() });
    iconChip(s, "chart", 1.0, 2.35, 0.55, BLUE_BG, BLUE, 0.55);
    s.addText("Platform-wide dashboard", { x: 1.7, y: 2.38, w: 4.5, h: 0.35, fontFace: BODY, bold: true, fontSize: 13.5, color: NAVY, margin: 0 });
    s.addText("Admin only", { x: 1.7, y: 2.7, w: 4.5, h: 0.3, fontFace: BODY, fontSize: 10, color: MUTED2, italic: true, margin: 0 });
    const adminItems = ["KPI indicators & configurable date range", "Execution timeline, status distribution", "Top ETLs, top users, ETL health counters"];
    let ady = 3.15;
    adminItems.forEach(it => {
      iconChip(s, "check", 1.0, ady, 0.24, "FFFFFF", GREEN, 0.7);
      s.addText(it, { x: 1.35, y: ady - 0.05, w: 4.85, h: 0.4, fontFace: BODY, fontSize: 10.5, color: SLATE_MUTED, margin: 0, valign: "top" });
      ady += 0.55;
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 6.95, y: 2.1, w: 5.7, h: 2.85, fill: { color: WHITE }, line: { color: GREEN_BORDER, width: 1.25 }, shadow: freshShadow() });
    iconChip(s, "trend", 7.25, 2.35, 0.55, GREEN_BG, GREEN, 0.55);
    s.addText("Personal dashboard", { x: 7.95, y: 2.38, w: 4.5, h: 0.35, fontFace: BODY, bold: true, fontSize: 13.5, color: NAVY, margin: 0 });
    s.addText("All users — including admins", { x: 7.95, y: 2.7, w: 4.5, h: 0.3, fontFace: BODY, fontSize: 10, color: MUTED2, italic: true, margin: 0 });
    const userItems = ["Scoped exclusively to own executions", "Last-run banner — outcome at a glance", "Success rate, most-used ETLs"];
    let udy = 3.15;
    userItems.forEach(it => {
      iconChip(s, "check", 7.25, udy, 0.24, "FFFFFF", GREEN, 0.7);
      s.addText(it, { x: 7.6, y: udy - 0.05, w: 4.85, h: 0.4, fontFace: BODY, fontSize: 10.5, color: SLATE_MUTED, margin: 0, valign: "top" });
      udy += 0.55;
    });
    screenshotPlaceholder(s, 0.7, 5.05, 11.95, 1.3, "Screenshot — Analytics dashboard (KPIs, timeline & charts)");
    s.addText("All aggregation runs server-side via Django ORM (TruncDay, Count, Avg) — the database groups and counts, not Python loops.", {
      x: 0.7, y: 6.45, w: 11.95, h: 0.3, fontFace: BODY, italic: true, fontSize: 10, color: MUTED, margin: 0,
    });
    autoPageNum(s);
    s.addNotes(
      "Last part of this module: analytics. Admins get a full dashboard with key numbers, a timeline of runs, which ETLs and users are most active, and recent " +
      "failures, for any date range they choose. Every user, including admins, also has a personal dashboard that only shows their own runs. " +
      "All of these numbers are calculated by the database itself, not by looping through results in Python, so it stays fast even with a lot of data."
    );
  }

  dividerSlide("Part 05", "Conclusion", "Results, honest trade-offs, and where this goes next", "handshake");

  // Results & perspectives
  {
    const s = newSlide();
    kicker(s, "Conclusion");
    contentTitle(s, "Results & perspectives");
    s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 2.05, w: 5.7, h: 4.3, fill: { color: GREEN_BG }, line: { color: GREEN_BORDER, width: 1 } });
    iconChip(s, "check", 1.0, 2.35, 0.55, "FFFFFF", GREEN, 0.55);
    s.addText("Every limitation addressed", { x: 1.7, y: 2.4, w: 4.5, h: 0.4, fontFace: BODY, bold: true, fontSize: 14, color: NAVY, margin: 0 });
    const wins = [
      "No more manual CLI execution", "Automated dependency & environment management", "Role-based access from the ground up",
      "Full execution traceability & notifications", "Autonomous scheduling, zero missed cycles", "Platform-wide & personal analytics",
    ];
    let wy = 2.95;
    wins.forEach(w => {
      iconChip(s, "check", 1.0, wy, 0.24, "FFFFFF", GREEN, 0.75);
      s.addText(w, { x: 1.35, y: wy - 0.05, w: 4.85, h: 0.4, fontFace: BODY, fontSize: 11.5, color: SLATE_MUTED, margin: 0, valign: "top" });
      wy += 0.52;
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 6.95, y: 2.05, w: 5.7, h: 4.3, fill: { color: BG_TINT }, line: { color: BORDER, width: 1 } });
    iconChip(s, "rocket", 7.25, 2.35, 0.55, BLUE_BG, BLUE, 0.55);
    s.addText("Perspectives", { x: 7.95, y: 2.4, w: 4.5, h: 0.4, fontFace: BODY, bold: true, fontSize: 14, color: NAVY, margin: 0 });
    const persp = [
      "Dynamic thread-pool scaling under load", "Cron-expression scheduling for finer control",
      "Predictive analytics — failure probability scoring", "Multi-language pipeline execution support",
    ];
    let py = 2.95;
    persp.forEach(p => {
      iconChip(s, "bolt", 7.25, py, 0.24, "FFFFFF", BLUE, 0.75);
      s.addText(p, { x: 7.6, y: py - 0.05, w: 4.8, h: 0.4, fontFace: BODY, fontSize: 11.5, color: SLATE_MUTED, margin: 0, valign: "top" });
      py += 0.62;
    });
    s.addText("Honest scope note: single-server deployment, fixed recurrence frequencies, Python-only pipelines — by design, not oversight.", {
      x: 6.95, y: 5.7, w: 5.7, h: 0.6, fontFace: BODY, italic: true, fontSize: 10.5, color: MUTED, margin: 0, lineSpacingMultiple: 1.25,
    });
    autoPageNum(s);
    s.addNotes(
      "To conclude: this platform solves every problem I described at the start. Manual command-line runs are gone, dependencies are installed automatically, " +
      "access is controlled by role, every run can be tracked and sends notifications, scheduled runs no longer get forgotten, and there are dashboards to see " +
      "how everything is performing. " +
      "I also want to be honest about its limits: it runs on a single server, it supports four fixed schedule types instead of fully custom ones, and it only " +
      "works with Python scripts for now. These were conscious choices to keep the tool simple, and they are exactly what I would improve next."
    );
  }

  // Thank you
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addShape(pres.shapes.OVAL, { x: -2.5, y: -2.5, w: 6, h: 6, fill: { color: SLATE, transparency: 45 }, line: { type: "none" } });
    s.addShape(pres.shapes.OVAL, { x: 10.5, y: 4.5, w: 5, h: 5, fill: { color: SLATE, transparency: 55 }, line: { type: "none" } });
    iconChip(s, "handshake", W / 2 - 0.45, 1.55, 0.9, SLATE, "60A5FA", 0.55);
    s.addText("Thank you", { x: 0, y: 2.7, w: W, h: 1.1, fontFace: HEAD, bold: true, fontSize: 42, color: WHITE, align: "center", margin: 0 });
    s.addText("Questions & discussion", { x: 0, y: 3.75, w: W, h: 0.5, fontFace: BODY, fontSize: 16, color: "94A3B8", align: "center", margin: 0 });
    s.addShape(pres.shapes.LINE, { x: W / 2 - 1.6, y: 4.55, w: 3.2, h: 0, line: { color: "334155", width: 1 } });
    s.addText("ETL Orchestration & Automation Platform  ·  Amaris Consulting", {
      x: 0, y: 4.75, w: W, h: 0.4, fontFace: BODY, fontSize: 11.5, color: MUTED2, align: "center", margin: 0, charSpacing: 0.5,
    });
    s.addNotes(
      "Thank you for your attention. I'm happy to take any questions — whether about the technical design, the trade-offs I made, or to walk through a live " +
      "demonstration of the platform itself."
    );
  }

  await pres.writeFile({ fileName: process.env.OUT_FILE || "ETL_Platform_Presentation.pptx" });
  console.log("Presentation written.");
}

main().catch(e => { console.error(e); process.exit(1); });
