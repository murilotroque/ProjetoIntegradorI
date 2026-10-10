/* Dashboard Selic x Câmbio x Comércio Exterior
 * Lê window.DADOS (dashboard/dados.js, gerado por src/gerar_dados_dashboard.py).
 * Para adicionar uma métrica nova: veja `agregar()` (cálculo) e `renderKpis()` (cartões).
 */
(() => {
  "use strict";

  /* ---------- Configuração (fácil de editar) ---------- */
  const CORES = {
    minerio_de_ferro: "#8b7bff",
    soja: "#38bdf8",
    petroleo: "#f472b6",
    maquinas: "#fcd34d",
  };
  const IND = {
    selic: { nome: "Selic (% a.a.)", curto: "Selic", fmt: (v) => `${nf(v, 2)}%` },
    dolar: { nome: "Dólar (R$/US$)", curto: "Dólar", fmt: (v) => `R$ ${nf(v, 2)}` },
  };
  const GRANS = {
    mes: { rotulo: "mensal", plural: "mensais" },
    tri: { rotulo: "trimestral", plural: "trimestrais" },
    ano: { rotulo: "anual", plural: "anuais" },
  };

  const D = window.DADOS;
  const PRODUTOS = Object.keys(D.commodities);
  const anos = [...new Set(PRODUTOS.flatMap((p) => Object.keys(D.commodities[p].serie).map((k) => +k.slice(0, 4))))].sort();
  const reduzMov = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const estado = {
    sel: new Set(PRODUTOS),
    gran: "mes",
    ind: "selic",
    de: anos[0],
    ate: anos[anos.length - 1],
    camadas: { exp: true, imp: true, saldo: false, ind: true }, // o que aparece no gráfico principal
  };

  /* ---------- Utilidades ---------- */
  const $ = (s) => document.querySelector(s);
  const nf = (v, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  function usd(v, sinal = false) {
    const a = Math.abs(v);
    const s = v < 0 ? "−" : sinal && v > 0 ? "+" : "";
    if (a >= 1e9) return `${s}US$ ${nf(a / 1e9, 2)} bi`;
    if (a >= 1e6) return `${s}US$ ${nf(a / 1e6, 1)} mi`;
    if (a >= 1e3) return `${s}US$ ${nf(a / 1e3, 0)} mil`;
    return `${s}US$ ${nf(a, 0)}`;
  }
  const el = (tag, attrs = {}, html) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (html != null) e.innerHTML = html;
    return e;
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  /* ---------- Agregação ---------- */
  function chavePeriodo(mesKey, gran) {
    const [a, m] = mesKey.split("-");
    if (gran === "mes") return mesKey;
    if (gran === "tri") return `${a}-T${Math.ceil(+m / 3)}`;
    return a;
  }
  const rotuloPeriodo = (k, gran) => (gran === "mes" ? `${k.slice(5)}/${k.slice(0, 4)}` : gran === "tri" ? `${k.slice(5)}/${k.slice(2, 4)}` : k);

  function mesesDoPeriodo() {
    const out = [];
    for (let a = estado.de; a <= estado.ate; a++) for (let m = 1; m <= 12; m++) out.push(`${a}-${String(m).padStart(2, "0")}`);
    return out;
  }

  function agregar(produtos = estado.sel, gran = estado.gran) {
    const mapa = new Map();
    const meses = mesesDoPeriodo();
    const faltaInd = [];
    for (const mk of meses) {
      const k = chavePeriodo(mk, gran);
      if (!mapa.has(k)) mapa.set(k, { k, exp: 0, imp: 0, expKg: 0, impKg: 0, indVals: [], selicVals: [], dolarVals: [] });
      const r = mapa.get(k);
      for (const p of produtos) {
        const x = D.commodities[p].serie[mk];
        if (x) { r.exp += x.exp; r.imp += x.imp; r.expKg += x.expKg; r.impKg += x.impKg; }
      }
      if (D.selic[mk] != null) r.selicVals.push(D.selic[mk]);
      if (D.dolar[mk] != null) r.dolarVals.push(D.dolar[mk]);
      if (D[estado.ind][mk] != null) r.indVals.push(D[estado.ind][mk]);
      else faltaInd.push(mk);
    }
    const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const rows = [...mapa.values()].map((r) => ({
      ...r,
      saldo: r.exp - r.imp,
      ind: avg(r.indVals),
      selic: avg(r.selicVals),
      dolar: avg(r.dolarVals),
    }));
    return { rows, faltaInd };
  }

  /* ---------- Controles ---------- */
  function montaControles() {
    const chips = $("#chips");
    PRODUTOS.forEach((p) => {
      const b = el("button", { class: "chip", "aria-pressed": "true", "data-p": p, style: `color:${CORES[p]}` }, `<i></i><span style="color:var(--texto)">${D.commodities[p].nome}</span>`);
      b.onclick = () => {
        if (estado.sel.has(p) && estado.sel.size === 1) return; // mantém ao menos 1
        estado.sel.has(p) ? estado.sel.delete(p) : estado.sel.add(p);
        b.setAttribute("aria-pressed", estado.sel.has(p));
        render();
      };
      chips.append(b);
    });

    const radio = (sel, chave) => {
      const g = $(sel);
      const marca = () => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === estado[chave]));
      g.querySelectorAll("button").forEach((b) => (b.onclick = () => { estado[chave] = b.dataset.v; marca(); render(); }));
      marca();
    };
    radio("#gran", "gran");
    radio("#ind", "ind");

    const de = $("#de"), ate = $("#ate");
    anos.forEach((a) => { de.append(el("option", { value: a }, a)); ate.append(el("option", { value: a }, a)); });
    de.value = estado.de; ate.value = estado.ate;
    de.onchange = () => { estado.de = +de.value; if (estado.ate < estado.de) { estado.ate = estado.de; ate.value = estado.ate; } render(); };
    ate.onchange = () => { estado.ate = +ate.value; if (estado.de > estado.ate) { estado.de = estado.ate; de.value = estado.de; } render(); };
  }

  /* ---------- KPIs ---------- */
  const kpiRefs = {};
  function animaNumero(chave, alvo, fmt) {
    const ref = kpiRefs[chave];
    const ini = ref.atual ?? 0;
    ref.atual = alvo;
    if (alvo == null) { ref.num.textContent = "—"; return; }
    if (reduzMov) { ref.num.textContent = fmt(alvo); return; }
    const t0 = performance.now(), dur = 650;
    cancelAnimationFrame(ref.raf);
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      ref.num.textContent = fmt(ini + (alvo - ini) * e);
      if (p < 1) ref.raf = requestAnimationFrame(passo);
    };
    ref.raf = requestAnimationFrame(passo);
  }

  function renderKpis(rows) {
    const soma = (f) => rows.reduce((s, r) => s + r[f], 0);
    const media = (f) => { const v = rows.map((r) => r[f]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const exp = soma("exp"), imp = soma("imp");
    const itens = [
      { id: "exp", titulo: "Exportações", valor: exp, fmt: usd, cor: "var(--exp)", sub: `${nf(soma("expKg") / 1e9, 1)} mi t exportadas` },
      { id: "imp", titulo: "Importações", valor: imp, fmt: usd, cor: "var(--imp)", sub: `${nf(soma("impKg") / 1e9, 1)} mi t importadas` },
      { id: "saldo", titulo: "Saldo comercial", valor: exp - imp, fmt: (v) => usd(v, true), cor: exp - imp >= 0 ? "var(--pos)" : "var(--neg)", sub: exp - imp >= 0 ? "superávit" : "déficit" },
      { id: "selic", titulo: "Selic média", valor: media("selic"), fmt: IND.selic.fmt, cor: "var(--ind)", sub: "% ao ano" },
      { id: "dolar", titulo: "Dólar médio", valor: media("dolar"), fmt: IND.dolar.fmt, cor: "var(--ind)", sub: "PTAX venda" },
    ];
    const box = $("#kpis");
    itens.forEach((it, i) => {
      if (!kpiRefs[it.id]) {
        const card = el("div", { class: "kpi", style: `animation-delay:${i * 70}ms` }, `<small>${it.titulo}</small><strong>—</strong><em></em>`);
        box.append(card);
        kpiRefs[it.id] = { card, num: card.querySelector("strong"), sub: card.querySelector("em"), atual: 0 };
      }
      const ref = kpiRefs[it.id];
      ref.card.style.setProperty("--cor", it.cor);
      ref.sub.textContent = it.sub;
      animaNumero(it.id, it.valor, it.fmt);
    });
  }

  /* ---------- Gráfico principal ---------- */
  const tick = (max, n = 5) => {
    const bruto = max / n, pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    const f = bruto / pot, passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
    return passo;
  };

  function renderGrafico(rows, faltaInd) {
    const host = $("#grafico");
    host.innerHTML = "";
    const W = Math.max(300, host.clientWidth || 1000);
    const peq = W < 640;
    const H = peq ? 320 : Math.min(430, Math.max(300, W * 0.4));
    const m = peq ? { l: 52, r: 38, t: 12, b: 30 } : { l: 76, r: 58, t: 14, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = rows.length;
    const c = estado.camadas;
    const vis = rows.flatMap((r) => [c.exp ? r.exp : null, c.imp ? r.imp : null, c.saldo ? r.saldo : null]).filter((v) => v != null);
    const vMax = Math.max(...vis, 1);
    const vMin = Math.min(0, ...vis);
    const passoY = tick(vMax - vMin);
    const yMax = Math.ceil(vMax / passoY) * passoY;
    const yMin = vMin < 0 ? Math.floor(vMin / passoY) * passoY : 0;
    const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

    const indVals = rows.map((r) => r.ind).filter((v) => v != null);
    const iMax = indVals.length ? Math.max(...indVals) * 1.12 : 1;
    const yi = (v) => m.t + ih - (v / iMax) * ih;

    const step = iw / n;
    const x = (i) => m.l + step * (i + 0.5);

    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Gráfico ${GRANS[estado.gran].rotulo} de exportações, importações, saldo e ${IND[estado.ind].curto}` });

    // grade e eixo esquerdo
    for (let v = yMin; v <= yMax + 1e-9; v += passoY) {
      svg.append(sv("line", { class: v === 0 ? "zero" : "grade", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = sv("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" });
      t.textContent = usd(v).replace("US$ ", "");
      svg.append(t);
    }
    // eixo direito
    const passoI = tick(iMax, 4);
    for (let v = 0; c.ind && v <= iMax; v += passoI) {
      const t = sv("text", { x: W - m.r + 8, y: yi(v) + 4, fill: "currentColor" });
      t.style.fill = "var(--ind)"; t.style.opacity = ".85";
      t.textContent = estado.ind === "selic" ? `${nf(v, 0)}%` : nf(v, 1);
      svg.append(t);
    }
    // eixo x
    const cada = Math.ceil(n / (peq ? 5 : 12));
    rows.forEach((r, i) => {
      if (i % cada) return;
      const t = sv("text", { x: x(i), y: H - 10, "text-anchor": "middle" });
      t.textContent = rotuloPeriodo(r.k, estado.gran);
      svg.append(t);
    });

    // barras de saldo
    const bw = Math.max(1.6, Math.min(26, step * 0.55));
    (c.saldo ? rows : []).forEach((r, i) => {
      const y0 = y(0), y1 = y(r.saldo);
      const b = sv("rect", {
        class: "barra-saldo", x: x(i) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)),
        rx: Math.min(3, bw / 2), fill: r.saldo >= 0 ? "var(--pos)" : "var(--neg)", opacity: ".38",
      });
      if (!reduzMov) b.style.animationDelay = `${Math.min(i * 8, 600)}ms`;
      svg.append(b);
    });

    // linhas
    const caminho = (f, valor) => {
      let d = "", aberto = false;
      rows.forEach((r, i) => {
        const v = valor(r);
        if (v == null) { aberto = false; return; }
        d += `${aberto ? "L" : "M"}${x(i).toFixed(1)} ${f(v).toFixed(1)}`;
        aberto = true;
      });
      return d;
    };
    const linha = (d, cor, extra = {}) => {
      const p = sv("path", { d, class: "linha" + (reduzMov ? "" : " desenha"), stroke: cor, ...extra });
      svg.append(p);
      return p;
    };
    const pExp = c.exp ? linha(caminho(y, (r) => r.exp), "var(--exp)") : null;
    const pImp = c.imp ? linha(caminho(y, (r) => r.imp), "var(--imp)") : null;
    const pInd = c.ind ? linha(caminho(yi, (r) => r.ind), "var(--ind)", { "stroke-dasharray": "6 5", "stroke-width": 2 }) : null;
    if (pInd) pInd.classList.remove("desenha");
    n <= 40 && c.ind && rows.forEach((r, i) => {
      if (r.ind != null) svg.append(sv("circle", { cx: x(i), cy: yi(r.ind), r: 2.6, fill: "var(--ind)" }));
    });

    // interação
    const guia = sv("line", { class: "guia", y1: m.t, y2: m.t + ih, opacity: 0 });
    const alvo = sv("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:crosshair" });
    svg.append(guia, alvo);
    const dica = $("#dica");
    const mostra = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev;
      const box = svg.getBoundingClientRect();
      const px = ((pt.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / step)));
      const r = rows[i];
      guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("opacity", 1);
      dica.hidden = false;
      dica.innerHTML = `<b>${rotuloPeriodo(r.k, estado.gran)}</b>
        <div><span style="color:var(--exp)">Exportações</span><span>${usd(r.exp)}</span></div>
        <div><span style="color:var(--imp)">Importações</span><span>${usd(r.imp)}</span></div>
        <div><span>Saldo</span><span>${usd(r.saldo, true)}</span></div>
        <div><span style="color:var(--ind)">${IND[estado.ind].curto}</span><span>${r.ind != null ? IND[estado.ind].fmt(r.ind) : "sem dado"}</span></div>`;
      const dx = pt.clientX + 16 + 190 > innerWidth ? pt.clientX - 206 : pt.clientX + 16;
      dica.style.left = `${dx}px`; dica.style.top = `${Math.max(8, pt.clientY - 20)}px`;
    };
    const esconde = () => { dica.hidden = true; guia.setAttribute("opacity", 0); };
    alvo.addEventListener("mousemove", mostra);
    alvo.addEventListener("touchmove", mostra, { passive: true });
    alvo.addEventListener("mouseleave", esconde);
    alvo.addEventListener("touchend", esconde);

    host.append(svg);

    // anima o desenho das linhas com o comprimento real
    [pExp, pImp].filter(Boolean).forEach((p) => p.style.setProperty("--len", p.getTotalLength ? Math.ceil(p.getTotalLength()) : 2000));

    renderCamadas();
    const lac = [...new Set(faltaInd)];
    $("#notaLacunas").textContent = lac.length
      ? `Sem dado de ${IND[estado.ind].curto} em ${lac.length} mês(es) do período (${lac.slice(0, 4).map((k) => rotuloPeriodo(k, "mes")).join(", ")}${lac.length > 4 ? "…" : ""}); a linha tracejada é interrompida nesses pontos.`
      : "";
  }

  /* ---------- Camadas do gráfico principal (também servem de legenda) ---------- */
  function renderCamadas() {
    const box = $("#camadas");
    box.innerHTML = "";
    const itens = [
      ["exp", "Exportações", "var(--exp)"],
      ["imp", "Importações", "var(--imp)"],
      ["saldo", "Saldo (barras)", "var(--pos)"],
      ["ind", `${IND[estado.ind].nome} · eixo direito`, "var(--ind)"],
    ];
    itens.forEach(([k, nome, cor]) => {
      const b = el("button", { class: "chip", "aria-pressed": estado.camadas[k], style: `color:${cor}` }, `<i></i><span style="color:var(--texto)">${nome}</span>`);
      b.onclick = () => { estado.camadas[k] = !estado.camadas[k]; render(); };
      box.append(b);
    });
  }

  /* ---------- Ranking por produto ---------- */
  function renderRanking() {
    const dados = PRODUTOS.map((p) => {
      const { rows } = agregar(new Set([p]));
      const exp = rows.reduce((s, r) => s + r.exp, 0), imp = rows.reduce((s, r) => s + r.imp, 0);
      return { p, exp, imp, saldo: exp - imp };
    }).sort((a, b) => b.saldo - a.saldo);
    const max = Math.max(...dados.map((d) => Math.abs(d.saldo)), 1);
    const box = $("#ranking");
    box.innerHTML = "";
    dados.forEach((d) => {
      const w = (Math.abs(d.saldo) / max) * 50;
      const linha = el("div", { class: "rk-linha", style: estado.sel.has(d.p) ? "" : "opacity:.45" }, `
        <div class="rk-topo"><span style="color:${CORES[d.p]}">${D.commodities[d.p].nome}</span><b>${usd(d.saldo, true)}</b></div>
        <div class="rk-trilho"><div class="rk-barra" style="background:${d.saldo >= 0 ? CORES[d.p] : "var(--neg)"};left:50%;width:0"></div></div>
        <div class="rk-sub">Exp. ${usd(d.exp)} · Imp. ${usd(d.imp)}</div>`);
      box.append(linha);
      const barra = linha.querySelector(".rk-barra");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        barra.style.width = `${w}%`;
        barra.style.left = d.saldo >= 0 ? "50%" : `${50 - w}%`;
      }));
    });
  }

  /* ---------- Correlação ---------- */
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 4) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  const leitura = (r) => {
    if (r == null) return "dados insuficientes para dizer";
    const a = Math.abs(r);
    if (a < 0.15) return "quase nenhuma relação";
    const f = a < 0.3 ? "fraca" : a < 0.5 ? "média" : "forte";
    return `relação ${f}: ${r > 0 ? "tendem a subir juntos" : "quando um sobe, o outro tende a cair"}`;
  };

  function renderCorrel(rows) {
    const validos = rows.filter((r) => r.ind != null);
    const box = $("#correl");
    const par = (titulo, campo) => {
      const r = pearson(validos.map((v) => v.ind), validos.map((v) => v[campo]));
      return `<div class="cr"><span class="tit">${titulo}</span>
        <div class="escala"><div class="pino" style="left:calc(${r == null ? 50 : ((r + 1) / 2) * 100}% - 2px)"></div></div>
        <div class="eixo"><span>um sobe, o outro cai</span><span>sobem juntos</span></div>
        <span class="leitura"><b>${leitura(r)}</b></span></div>`;
    };
    box.innerHTML = `
      ${par(`${IND[estado.ind].curto} e exportações`, "exp")}
      ${par(`${IND[estado.ind].curto} e importações`, "imp")}
      <p class="aviso">Andar junto não prova que uma coisa causa a outra: pandemia, safras e preços também mexeram nesses anos.</p>`;
  }

  /* ---------- Render geral ---------- */
  function render() {
    const { rows, faltaInd } = agregar();
    $("#tituloGrafico").textContent = `Exportações, importações e saldo · ${GRANS[estado.gran].rotulo}`;
    renderKpis(rows);
    renderGrafico(rows, faltaInd);
    renderRanking();
    renderCorrel(rows);
    DASH.onRender.forEach((f) => f());
  }

  // API para outros scripts (analises.js)
  const DASH = (window.DASH = { estado, agregar, usd, nf, el, sv, CORES, IND, D, PRODUTOS, anos, onRender: [] });

  montaControles();
  $("#fontes").textContent = `Fontes: ${D.fontes.comercio}; ${D.fontes.selic}; ${D.fontes.dolar}.`;
  render();

  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(render, 150); });
})();
