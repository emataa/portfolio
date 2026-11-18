(() => {
  "use strict";

  // 1. Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // 2. Header border on scroll
  const header = document.getElementById("siteHeader");
  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // 2b. Mobile nav toggle
  const navToggle = document.getElementById("navToggle");
  const siteNav = document.getElementById("primary-nav");
  if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
      const open = !siteNav.classList.contains("is-open");
      siteNav.classList.toggle("is-open", open);
      navToggle.classList.toggle("is-active", open);
      navToggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    // Close nav when a link is tapped
    siteNav.querySelectorAll("a[data-nav]").forEach((link) => {
      link.addEventListener("click", () => {
        siteNav.classList.remove("is-open");
        navToggle.classList.remove("is-active");
        navToggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
  }

  // 3. Reveal on scroll
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  // 4. Window Tabs (CHIP-8 VM vs zsh // inspect)
  const tabBtns = document.querySelectorAll("[data-tab-target]");
  const paneVm = document.getElementById("pane-vm");
  const paneZsh = document.getElementById("pane-zsh");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab-target");
      tabBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      if (paneVm && paneZsh) {
        paneVm.hidden = target !== "vm";
        paneZsh.hidden = target !== "zsh";
      }
    });
  });

  // 5. Interactive CHIP-8 VM Interpreter
  const canvas = document.getElementById("chip8-canvas");
  const btnToggle = document.getElementById("btn-toggle");
  const btnStep = document.getElementById("btn-step");
  const romBtns = document.querySelectorAll("[data-rom]");
  if (!canvas || !btnToggle || !btnStep) return;

  const out = {
    status: document.getElementById("cpu-status"),
    pc: document.getElementById("reg-pc"),
    i: document.getElementById("reg-i"),
    sp: document.getElementById("reg-sp"),
    dt: document.getElementById("reg-dt"),
    v0: document.getElementById("reg-v0"),
    v1: document.getElementById("reg-v1"),
    op: document.getElementById("reg-op"),
  };

  const ctx = canvas.getContext("2d");
  const W = 64,
    H = 32,
    SCALE = 8,
    START = 0x200;

  const prog = (setup, loop, data, ipf) => {
    const L = START + setup.length * 2;
    return { code: [...setup, ...loop(L), 0x1000 | L], data, ipf };
  };

  const alienRow = [0xd018, 0x8400, 0x7410, 0xd418, 0x8500, 0x7520, 0xd518];

  const ROMS = {
    invaders: prog(
      [
        0x6004,
        0x6104,
        0x6201,
        0x661c,
        0x691d,
        0x681f,
        0x671a,
        0xa300,
        ...alienRow,
        0xa320,
        0xd693,
        0xa340,
        0xd872,
      ],
      () => [
        0xa300,
        ...alienRow,
        0x8024,
        0x4018,
        0x62ff,
        0x4004,
        0x6201,
        ...alienRow,
        0xa340,
        0xd872,
        0x77fe,
        0x4700,
        0x671a,
        0xd872,
      ],
      {
        0x300: [0x18, 0x3c, 0x7e, 0xdb, 0xff, 0x24, 0x5a, 0xa5],
        0x320: [0x18, 0x3c, 0xff],
        0x340: [0x80, 0x80],
      },
      10,
    ),
    pong: prog(
      [
        0x6020, 0x6110, 0x6201, 0x6301, 0xa310, 0x6401, 0x650c, 0xd458, 0x643d,
        0xd458, 0xa300,
      ],
      () => [
        0xd012, 0x8024, 0x8134, 0xd012, 0x4037, 0x62ff, 0x4005, 0x6201, 0x411e,
        0x63ff, 0x4100, 0x6301,
      ],
      { 0x300: [0xc0, 0xc0], 0x310: Array(8).fill(0xc0) },
      14,
    ),
    maze: prog(
      [0x6000, 0x6100],
      (L) => [
        0xc201,
        0xa300,
        0x4200,
        0xa308,
        0xd018,
        0x7008,
        0x3040,
        0x1000 | L,
        0x6000,
        0x7108,
        0x3120,
        0x1000 | L,
        0x00e0,
        0x6100,
      ],
      {
        0x300: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
        0x308: [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
      },
      8,
    ),
  };

  const m = {
    ram: new Uint8Array(4096),
    v: new Uint8Array(16),
    px: new Uint8Array(W * H),
    pc: START,
    i: 0,
    dt: 0x1b,
    op: 0,
  };
  let rom = ROMS.invaders;

  const load = (r) => {
    rom = r;
    m.ram.fill(0);
    m.v.fill(0);
    m.px.fill(0);
    m.pc = START;
    m.i = 0;
    m.dt = 0x1b;
    m.op = 0;
    r.code.forEach((w, k) => {
      m.ram[START + 2 * k] = w >> 8;
      m.ram[START + 2 * k + 1] = w & 255;
    });
    for (const [addr, bytes] of Object.entries(r.data)) {
      m.ram.set(bytes, Number(addr));
    }
  };

  const drawSprite = (x0, y0, n) => {
    let hit = 0;
    for (let r = 0; r < n; r++) {
      const bits = m.ram[(m.i + r) & 0xfff];
      for (let c = 0; c < 8; c++) {
        if (bits & (0x80 >> c)) {
          const k = ((y0 + r) % H) * W + ((x0 + c) % W);
          hit |= m.px[k];
          m.px[k] ^= 1;
        }
      }
    }
    m.v[15] = hit;
  };

  const step = () => {
    const op = (m.ram[m.pc] << 8) | m.ram[m.pc + 1];
    m.op = op;
    m.pc = (m.pc + 2) & 0xfff;
    // DT now decremented in frame loop at 60Hz, not per-instruction
    const x = (op >> 8) & 15,
      y = (op >> 4) & 15,
      n = op & 15;
    const nn = op & 255,
      nnn = op & 0xfff;
    switch (op >> 12) {
      case 0x0:
        if (op === 0x00e0) m.px.fill(0);
        break;
      case 0x1:
        m.pc = nnn;
        break;
      case 0x3:
        if (m.v[x] === nn) m.pc += 2;
        break;
      case 0x4:
        if (m.v[x] !== nn) m.pc += 2;
        break;
      case 0x6:
        m.v[x] = nn;
        break;
      case 0x7:
        m.v[x] += nn;
        break;
      case 0x8:
        if (n === 0) m.v[x] = m.v[y];
        else if (n === 4) {
          const sum = m.v[x] + m.v[y];
          m.v[x] = sum;
          m.v[15] = sum > 255 ? 1 : 0;
        }
        break;
      case 0xa:
        m.i = nnn;
        break;
      case 0xc:
        m.v[x] = Math.floor(Math.random() * 256) & nn;
        break;
      case 0xd:
        drawSprite(m.v[x], m.v[y], n);
        break;
    }
  };

  const render = () => {
    ctx.fillStyle = "#050807";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle CRT scanline grid
    ctx.fillStyle = "rgba(16, 185, 129, 0.04)";
    for (let y = 0; y < H; y++) {
      ctx.fillRect(0, y * SCALE, canvas.width, 1);
    }

    // Phosphor emerald active pixels
    ctx.fillStyle = "#10b981";
    for (let k = 0; k < m.px.length; k++) {
      if (m.px[k]) {
        ctx.fillRect(
          (k % W) * SCALE,
          Math.floor(k / W) * SCALE,
          SCALE - 1,
          SCALE - 1,
        );
      }
    }
  };

  const hex = (v, len) => v.toString(16).toUpperCase().padStart(len, "0");
  const disasm = (op) => {
    const x = (op >> 8) & 15,
      y = (op >> 4) & 15,
      n = op & 15,
      nn = hex(op & 255, 2),
      nnn = hex(op & 0xfff, 3);
    switch (op >> 12) {
      case 0x0:
        return "CLS";
      case 0x1:
        return `JP 0x${nnn}`;
      case 0x3:
        return `SE V${x}, 0x${nn}`;
      case 0x4:
        return `SNE V${x}, 0x${nn}`;
      case 0x6:
        return `LD V${x}, 0x${nn}`;
      case 0x7:
        return `ADD V${x}, 0x${nn}`;
      case 0x8:
        return n === 4 ? `ADD V${x}, V${y}` : `LD V${x}, V${y}`;
      case 0xa:
        return `LD I, 0x${nnn}`;
      case 0xc:
        return `RND V${x}, 0x${nn}`;
      case 0xd:
        return `DRW V${x}, V${y}, ${n}`;
      default:
        return "NOP";
    }
  };

  const telemetry = () => {
    if (out.pc) out.pc.textContent = "0x" + hex(m.pc, 4);
    if (out.i) out.i.textContent = "0x" + hex(m.i, 4);
    if (out.dt) out.dt.textContent = "0x" + hex(m.dt, 2);
    if (out.v0) out.v0.textContent = "0x" + hex(m.v[0], 2);
    if (out.v1) out.v1.textContent = "0x" + hex(m.v[1], 2);
    if (out.op) out.op.textContent = `${hex(m.op, 4)} // ${disasm(m.op)}`;
  };

  let running = true;
  let last = -1,
    acc = 0;
  const FRAME_MS = 1000 / 60;

  const setRunning = (on) => {
    running = on;
    acc = 0;
    last = -1; // reset so next frame doesn't spike
    btnToggle.textContent = on ? "⏸ Pause" : "▶ Resume";
    if (out.status) {
      out.status.textContent = on ? "RUNNING" : "PAUSED";
      out.status.className = on ? "state-running" : "state-paused";
    }
  };

  const frame = (t) => {
    requestAnimationFrame(frame);
    if (!running) return;

    // Skip first frame or resume to avoid huge delta spike
    if (last < 0) {
      last = t;
      return;
    }

    const dt = t - last;
    last = t;

    // Clamp to 2 frames max to prevent spiral-of-death stutter
    acc = Math.min(acc + dt, FRAME_MS * 2);

    let ran = false;
    while (acc >= FRAME_MS) {
      acc -= FRAME_MS;
      for (let k = 0; k < rom.ipf; k++) step();
      // Tick delay timer at 60Hz (once per frame tick, not per instruction)
      if (m.dt > 0) m.dt--;
      ran = true;
    }
    if (ran) {
      render();
      telemetry();
    }
  };

  btnToggle.addEventListener("click", () => setRunning(!running));
  btnStep.addEventListener("click", () => {
    setRunning(false);
    step();
    render();
    telemetry();
  });

  romBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-rom");
      romBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      load(ROMS[key] || ROMS.invaders);
      render();
      telemetry();
    });
  });

  const initialKey =
    document.querySelector("[data-rom].is-active")?.getAttribute("data-rom") ||
    "invaders";
  load(ROMS[initialKey] || ROMS.invaders);
  setRunning(true);
  render();
  telemetry();
  requestAnimationFrame(frame);
})();
