(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setReady() {
    root.dataset.ready = "1";
  }

  function setYear() {
    const el = document.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function wireInkButtons() {
    const els = Array.from(document.querySelectorAll(".btn-ink"));
    for (const el of els) {
      const update = (ev) => {
        const r = el.getBoundingClientRect();
        const x = ((ev.clientX - r.left) / Math.max(1, r.width)) * 100;
        const y = ((ev.clientY - r.top) / Math.max(1, r.height)) * 100;
        el.style.setProperty("--mx", `${x}%`);
        el.style.setProperty("--my", `${y}%`);
      };
      el.addEventListener("pointermove", update);
      el.addEventListener("pointerdown", update);
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--mx", `50%`);
        el.style.setProperty("--my", `50%`);
      });
    }
  }

  // ---- Copilot mock ----
  const PRESETS = {
    q1: {
      question:
        "Which districts saw the biggest increase in bike-obstruction reports in the last 30 days?",
      summary:
        "Largest increases are concentrated in District 3 and District 7. The pattern is weekday-heavy, suggesting commute-time curbside loading and repeat blockages on two corridors.",
      table: {
        columns: ["District", "Change", "Top corridor"],
        rows: [
          ["District 3", "+18", "Market St"],
          ["District 7", "+14", "8th Ave"],
          ["District 2", "+9", "River Blvd"],
          ["District 5", "+6", "Union Sq"],
          ["District 1", "+4", "Harbor Rd"],
        ],
      },
      chart: {
        type: "bar",
        title: "30-day change (mock)",
        labels: ["D3", "D7", "D2", "D5", "D1"],
        values: [18, 14, 9, 6, 4],
      },
      note: "Source: service requests + event feed (mock)",
    },
    q2: {
      question: "Show a monthly trend and highlight the turning point.",
      summary:
        "The turning point occurs in May, when reports shift from steady to rising. The increase aligns with recurring obstruction clusters near three intersections.",
      table: {
        columns: ["Month", "Reports"],
        rows: [
          ["Jan", "42"],
          ["Feb", "45"],
          ["Mar", "44"],
          ["Apr", "46"],
          ["May", "58"],
          ["Jun", "63"],
        ],
      },
      chart: {
        type: "line",
        title: "Monthly reports (mock)",
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        values: [42, 45, 44, 46, 58, 63],
        highlightIndex: 4,
      },
      note: "Source: service requests + event feed (mock)",
    },
    q3: {
      question: "What categories drive repeat incidents near schools?",
      summary:
        "Repeat incidents near schools are driven by obstruction and visibility issues. The pattern suggests targeted curb management and quick maintenance can reduce repeats without corridor rebuilds.",
      table: {
        columns: ["Category", "Repeat share", "Typical trigger"],
        rows: [
          ["Obstruction", "38%", "Drop-off loading"],
          ["Visibility", "27%", "Corner parking"],
          ["Surface hazard", "19%", "Debris after events"],
          ["Signal conflict", "16%", "Peak hour timing"],
        ],
      },
      chart: {
        type: "bar",
        title: "Repeat share (mock)",
        labels: ["Obst", "Vis", "Surf", "Signal"],
        values: [38, 27, 19, 16],
      },
      note: "Source: service requests + event feed (mock)",
    },
  };

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function svgBarChart({ labels, values }) {
    const w = 340;
    const h = 140;
    const pad = 18;
    const max = Math.max(...values, 1);
    const n = values.length;
    const gap = 8;
    const barW = Math.floor((w - pad * 2 - gap * (n - 1)) / n);
    const baseY = h - pad;

    const bars = values
      .map((v, i) => {
        const x = pad + i * (barW + gap);
        const barH = Math.round(((h - pad * 2) * v) / max);
        const y = baseY - barH;
        const r = 8;
        const fill =
          i === 0
            ? "rgba(15,118,110,0.62)"
            : i === 1
              ? "rgba(249,115,22,0.56)"
              : "rgba(11,18,32,0.22)";
        return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${r}" fill="${fill}" stroke="rgba(11,18,32,0.16)"></rect>
                <text x="${x + barW / 2}" y="${h - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(11,18,32,0.64)">${esc(labels[i])}</text>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart (mock)">
      <path d="M${pad} ${baseY} H${w - pad}" stroke="rgba(11,18,32,0.16)" stroke-width="1" />
      ${bars}
    </svg>`;
  }

  function svgLineChart({ labels, values, highlightIndex }) {
    const w = 340;
    const h = 140;
    const pad = 18;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(1, max - min);
    const n = values.length;
    const xStep = (w - pad * 2) / Math.max(1, n - 1);

    const pts = values.map((v, i) => {
      const x = pad + i * xStep;
      const y = pad + ((max - v) / span) * (h - pad * 2);
      return { x, y, v, i };
    });

    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");

    const dots = pts
      .map((p) => {
        const isHi = p.i === highlightIndex;
        const r = isHi ? 5.2 : 3.6;
        const fill = isHi ? "rgba(249,115,22,0.86)" : "rgba(15,118,110,0.66)";
        const stroke = "rgba(11,18,32,0.22)";
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"></circle>`;
      })
      .join("");

    const xLabels = labels
      .map((lab, i) => {
        const x = pad + i * xStep;
        return `<text x="${x.toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(11,18,32,0.64)">${esc(lab)}</text>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Line chart (mock)">
      <path d="M${pad} ${h - pad} H${w - pad}" stroke="rgba(11,18,32,0.16)" stroke-width="1" />
      <path d="${d}" fill="none" stroke="rgba(15,118,110,0.80)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}
      ${xLabels}
    </svg>`;
  }

  function renderAnswer(preset) {
    const tableHead = preset.table.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
    const tableRows = preset.table.rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");

    const chartSvg =
      preset.chart.type === "bar"
        ? svgBarChart(preset.chart)
        : svgLineChart(preset.chart);

    return `
      <div class="answer-summary">${esc(preset.summary)}</div>
      <div class="answer-grid">
        <table class="mini-table">
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="mini-chart">
          ${chartSvg}
        </div>
      </div>
      <div class="answer-note">${esc(preset.note)}</div>
    `;
  }

  function wireCopilot() {
    const answerWrap = document.querySelector("#rb-answer .answer");
    const answerBubble = document.getElementById("rb-answer");
    const thinking = document.getElementById("rb-thinking");
    const chips = Array.from(document.querySelectorAll(".chip[data-q]"));
    if (!answerWrap || chips.length === 0) return;

    function setPressed(key) {
      for (const c of chips) {
        const on = c.dataset.q === key;
        c.setAttribute("aria-pressed", on ? "true" : "false");
      }
    }

    function show(key) {
      const preset = PRESETS[key];
      if (!preset) return;
      setPressed(key);

      const apply = () => {
        answerWrap.innerHTML = renderAnswer(preset);
      };

      if (reduceMotion) {
        if (thinking) thinking.hidden = true;
        if (answerBubble) answerBubble.hidden = false;
        apply();
        return;
      }

      if (thinking) thinking.hidden = false;
      if (answerBubble) answerBubble.hidden = true;
      // Small, deliberate pause to make it feel like a real artifact.
      window.setTimeout(() => {
        if (thinking) thinking.hidden = true;
        if (answerBubble) answerBubble.hidden = false;
        apply();
      }, 520);
    }

    for (const c of chips) {
      c.addEventListener("click", () => show(String(c.dataset.q)));
    }

    show("q2");
  }

  document.addEventListener("DOMContentLoaded", () => {
    setYear();
    wireInkButtons();
    wireCopilot();
    setReady();
  });
})();
