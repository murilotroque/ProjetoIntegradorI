
(() => {
  "use strict";
  const { estado, agregar, usd, nf, el, sv, CORES, IND, D, PRODUTOS } = window.DASH;
  const raiz = document.getElementById("analises");

  const st = { metrica: "exp", n: 12, seed: 7, prod: "soja", fluxo: "exp", medida: "valor", dessaz: true, tend: true, lag: null };
  const NOME_METRICA = { exp: "Exportações", imp: "Importações", saldo: "Saldo" };
  const MAX_LAG = 12;

  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const quant = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  const T975 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
  const tcrit = (df) => (df <= 30 ? T975[df] : df <= 40 ? 2.021 : df <= 60 ? 2.0 : df <= 120 ? 1.98 : 1.96);
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 12) return null;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function amostra(arr, n, rnd) { // sem reposição
    const a = arr.slice();
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }
  function ticks(min, max, n = 5) {
    const raw = (max - min || 1) / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) out.push(v);
    return out;
  }
  const curto = (v) => usd(v).replace("US$ ", "");
  const shift = (k, d) => { const [a, m] = k.split("-").map(Number); const i = a * 12 + (m - 1) + d; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
  const mesRot = (k) => `${k.slice(5)}/${k.slice(2, 4)}`;


  raiz.innerHTML = `
    <h2 class="secao">Amostras aleatórias e comparação
      <small>Séries mensais do recorte atual (produtos e período escolhidos lá em cima). Cada mês é uma observação.</small></h2>
    <div class="mini">
      <span class="rotulo">Métrica</span>
      <div class="seg" id="s-metrica" role="radiogroup" aria-label="Métrica analisada">
        <button role="radio" data-v="exp">Exportações</button>
        <button role="radio" data-v="imp">Importações</button>
        <button role="radio" data-v="saldo">Saldo</button>
      </div>
    </div>
    <div class="duas">
      <section class="painel">
        <div class="painel-topo"><h2>Quanto uma amostra aleatória erra a média?</h2></div>
        <div class="mini">
          <label>Tamanho da amostra: <b id="n-val"></b> meses
            <input type="range" id="n-in" min="5" max="48" step="1"></label>
          <button id="sorteia">Sortear outra amostra</button>
        </div>
        <div class="grafico" id="s1"></div>
        <div class="txt" id="s1-txt"></div>
      </section>
      <section class="painel">
        <div class="painel-topo"><h2 id="s2-tit">Meses de indicador alto × baixo</h2></div>
        <div class="grafico" id="s2"></div>
        <div class="txt" id="s2-txt"></div>
      </section>
    </div>

    <h2 class="secao">Compra × saída: qual cenário a commodity acompanha?
      <small>Contratos costumam ser fechados meses antes do embarque. Compare o fluxo do mês com o indicador do mesmo mês (defasagem 0) e de até ${MAX_LAG} meses antes.</small></h2>
    <section class="painel grande">
      <div class="mini">
        <label>Produto <select id="a-prod"></select></label>
        <div class="seg" id="a-fluxo" role="radiogroup" aria-label="Fluxo">
          <button role="radio" data-v="exp">Exportação</button><button role="radio" data-v="imp">Importação</button>
        </div>
        <div class="seg" id="a-medida" role="radiogroup" aria-label="Medida">
          <button role="radio" data-v="valor">Valor (US$)</button><button role="radio" data-v="kg">Volume (kg)</button>
        </div>
        <label class="chk"><input type="checkbox" id="a-dessaz"> Remover sazonalidade</label>
        <label class="chk"><input type="checkbox" id="a-tend"> Remover tendência</label>
      </div>
      <div class="mini">
        <label>Defasagem: <b id="a-lag-val"></b>
          <input type="range" id="a-lag" min="0" max="${MAX_LAG}" step="1"></label>
        <button id="a-auto">Usar a de maior associação</button>
      </div>
      <div class="duas dois-graf">
        <div><p class="sub-graf">Correlação por defasagem (clique numa barra)</p><div class="grafico" id="a-barras"></div></div>
        <div><p class="sub-graf" id="a-linha-tit"></p><div class="grafico" id="a-linha"></div></div>
      </div>
      <div class="txt" id="a-txt"></div>
    </section>`;

  const $ = (s) => raiz.querySelector(s);


  const mensal = (produtos = estado.sel) => agregar(produtos, "mes").rows;

  /* ---------- 1) Distribuição amostral ---------- */
  function renderAmostragem() {
    const pop = mensal().map((r) => r[st.metrica]);
    const N = pop.length;
    const nMax = Math.max(5, Math.floor(N / 2));
    st.n = Math.min(Math.max(5, st.n), nMax);
    $("#n-in").max = nMax; $("#n-in").value = st.n; $("#n-val").textContent = st.n;
    const n = st.n, mu = mean(pop);
    const sigma = Math.sqrt(pop.reduce((s, v) => s + (v - mu) ** 2, 0) / N);

    // 2000 amostras (semente fixa: o histograma só muda com o recorte ou o n)
    const rnd = rng(12345), B = 2000, medias = [];
    let cobre = 0;
    for (let b = 0; b < B; b++) {
      const a = amostra(pop, n, rnd), m = mean(a);
      medias.push(m);
      if (Math.abs(m - mu) <= (tcrit(n - 1) * sd(a)) / Math.sqrt(n)) cobre++;
    }
    // amostra "atual" (muda com a semente)
    const a = amostra(pop, n, rng(st.seed * 7919 + 13));
    const xb = mean(a), s = sd(a), h = (tcrit(n - 1) * s) / Math.sqrt(n);
    const contem = Math.abs(xb - mu) <= h;

    const ord = sorted(medias), lo95 = quant(ord, 0.025), hi95 = quant(ord, 0.975);
    const host = $("#s1");
    host.innerHTML = "";
    const W = Math.max(300, host.clientWidth || 600), H = 270;
    const m = { l: 12, r: 12, t: 22, b: 62 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const dmin = Math.min(ord[0], xb - h, mu), dmax = Math.max(ord[ord.length - 1], xb + h, mu);
    const pad = (dmax - dmin) * 0.04;
    const x = (v) => m.l + ((v - (dmin - pad)) / (dmax - dmin + 2 * pad)) * iw;
    const bins = 26, largura = (dmax - dmin) / bins || 1, cont = new Array(bins).fill(0);
    medias.forEach((v) => { cont[Math.min(bins - 1, Math.floor((v - dmin) / largura))]++; });
    const cmax = Math.max(...cont);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Histograma das médias de 2000 amostras aleatórias" });
    const y0 = m.t + ih;
    svg.append(sv("line", { class: "zero", x1: m.l, x2: W - m.r, y1: y0, y2: y0 }));
    cont.forEach((c, i) => {
      const v0 = dmin + i * largura, v1 = v0 + largura, dentro = v1 >= lo95 && v0 <= hi95;
      const alt = (c / cmax) * ih;
      const r = sv("rect", { x: x(v0) + 0.5, y: y0 - alt, width: Math.max(1, x(v1) - x(v0) - 1), height: alt, rx: 2, fill: "var(--exp)", opacity: dentro ? 0.85 : 0.3 });
      const t = sv("title"); t.textContent = `${curto(v0)} a ${curto(v1)}: ${c} amostras`; r.append(t);
      svg.append(r);
    });
    ticks(dmin, dmax, peqW(W) ? 3 : 5).forEach((v) => {
      const t = sv("text", { x: x(v), y: y0 + 15, "text-anchor": "middle" }); t.textContent = curto(v); svg.append(t);
    });
    // μ
    svg.append(sv("line", { x1: x(mu), x2: x(mu), y1: m.t - 6, y2: y0, stroke: "#fff", "stroke-dasharray": "4 4", opacity: 0.8 }));
    const tm = sv("text", { x: x(mu), y: m.t - 9, "text-anchor": "middle" }); tm.style.fill = "#fff"; tm.textContent = "μ (todos os meses)"; svg.append(tm);
    // IC da amostra atual
    const yi = y0 + 38, cor = contem ? "var(--imp)" : "var(--neg)";
    svg.append(sv("line", { x1: x(xb - h), x2: x(xb + h), y1: yi, y2: yi, stroke: cor, "stroke-width": 3, "stroke-linecap": "round" }));
    [xb - h, xb + h].forEach((v) => svg.append(sv("line", { x1: x(v), x2: x(v), y1: yi - 6, y2: yi + 6, stroke: cor, "stroke-width": 2 })));
    svg.append(sv("circle", { cx: x(xb), cy: yi, r: 5, fill: cor }));
    const tl = sv("text", { x: Math.min(W - m.r, Math.max(m.l, x(xb))), y: yi + 20, "text-anchor": x(xb) < 90 ? "start" : x(xb) > W - 90 ? "end" : "middle" });
    tl.style.fill = cor; tl.textContent = `esta amostra: x̄ e IC 95%`; svg.append(tl);
    host.append(svg);

    const seTeo = (sigma / Math.sqrt(n)) * Math.sqrt((N - n) / (N - 1));
    $("#s1-txt").innerHTML = `
      <p><b>População:</b> ${N} meses · μ = <b>${usd(mu)}</b> · σ = ${usd(sigma)}</p>
      <p><b>Amostra #${st.seed}</b> (n = ${n}): x̄ = <b>${usd(xb)}</b> · IC 95% [${usd(xb - h)} ; ${usd(xb + h)}] — <b style="color:${cor}">${contem ? "contém" : "NÃO contém"}</b> μ</p>
      <p>Em ${B} amostras sorteadas, <b>${nf((cobre / B) * 100, 1)}%</b> dos IC 95% contêm μ (esperado ≈ 95%). As barras claras do histograma ficam dentro do intervalo central de 95% das médias amostrais (${curto(lo95)} a ${curto(hi95)}).</p>
      <p>Erro-padrão simulado: ${usd(sd(medias))} · teórico (σ/√n com correção de população finita): ${usd(seTeo)}. Aumente n e veja o histograma afinar.</p>`;
  }
  const peqW = (W) => W < 520;

  /* ---------- 2) Comparação entre regimes ---------- */
  function renderRegimes() {
    const rows = mensal().filter((r) => r.ind != null);
    const nomeInd = IND[estado.ind].curto;
    $("#s2-tit").textContent = `Meses de ${nomeInd} alta × baixa: ${NOME_METRICA[st.metrica].toLowerCase()}`;
    const host = $("#s2"), txt = $("#s2-txt");
    host.innerHTML = "";
    const med = quant(sorted(rows.map((r) => r.ind)), 0.5);
    const baixa = rows.filter((r) => r.ind <= med).map((r) => r[st.metrica]);
    const alta = rows.filter((r) => r.ind > med).map((r) => r[st.metrica]);
    if (baixa.length < 6 || alta.length < 6) { txt.innerHTML = `<p class="aviso">Poucos meses com dado de ${nomeInd} neste período para comparar (alta: ${alta.length}, baixa: ${baixa.length}). Amplie o período.</p>`; return; }

    const rnd = rng(2024), B = 2000, P = 5000;
    const boot = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[Math.floor(rnd() * arr.length)]; return s / arr.length; };
    const ic = (arr) => { const ms = []; for (let b = 0; b < B; b++) ms.push(boot(arr)); const o = sorted(ms); return [quant(o, 0.025), quant(o, 0.975)]; };
    const icB = ic(baixa), icA = ic(alta);
    const difs = []; for (let b = 0; b < B; b++) difs.push(boot(alta) - boot(baixa));
    const od = sorted(difs), icD = [quant(od, 0.025), quant(od, 0.975)];
    const obs = mean(alta) - mean(baixa);
    const todos = baixa.concat(alta), nA = alta.length;
    let extremos = 0;
    for (let p = 0; p < P; p++) {
      for (let i = todos.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [todos[i], todos[j]] = [todos[j], todos[i]]; }
      const d = mean(todos.slice(0, nA)) - mean(todos.slice(nA));
      if (Math.abs(d) >= Math.abs(obs)) extremos++;
    }
    const pval = (extremos + 1) / (P + 1);

    const W = Math.max(300, host.clientWidth || 600), H = 200;
    const m = { l: 12, r: 12, t: 8, b: 28 };
    const iw = W - m.l - m.r;
    const vmin = Math.min(...todos), vmax = Math.max(...todos), pad = (vmax - vmin) * 0.05 || 1;
    const x = (v) => m.l + ((v - (vmin - pad)) / (vmax - vmin + 2 * pad)) * iw;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Meses de indicador baixo e alto com média e intervalo de confiança" });
    ticks(vmin, vmax, peqW(W) ? 3 : 5).forEach((v) => {
      svg.append(sv("line", { class: "grade", x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }));
      const t = sv("text", { x: x(v), y: H - 10, "text-anchor": "middle" }); t.textContent = curto(v); svg.append(t);
    });
    const jr = rng(99);
    const linhaGrupo = (arr, ic95, cy, cor, rotulo) => {
      const lab = sv("text", { x: m.l, y: cy - 38 }); lab.style.fill = cor; lab.textContent = rotulo; svg.append(lab);
      arr.forEach((v) => svg.append(sv("circle", { cx: x(v), cy: cy + (jr() - 0.5) * 34, r: 3, fill: cor, opacity: 0.4 })));
      svg.append(sv("line", { x1: x(ic95[0]), x2: x(ic95[1]), y1: cy, y2: cy, stroke: "#fff", "stroke-width": 4, "stroke-linecap": "round" }));
      const mx = x(mean(arr));
      svg.append(sv("path", { d: `M${mx} ${cy - 8} l7 8 l-7 8 l-7 -8z`, fill: cor, stroke: "#fff", "stroke-width": 1.5 }));
    };
    linhaGrupo(baixa, icB, 62, "var(--imp)", `${nomeInd} baixa (≤ ${IND[estado.ind].fmt(med)}) · ${baixa.length} meses`);
    linhaGrupo(alta, icA, 148, "var(--exp)", `${nomeInd} alta (> ${IND[estado.ind].fmt(med)}) · ${alta.length} meses`);
    host.append(svg);

    const sig = pval < 0.05;
    txt.innerHTML = `
      <p>Losango = média; barra branca = IC 95% por bootstrap (${B} reamostragens); pontos = cada mês.</p>
      <p><b>Alta:</b> ${usd(mean(alta))} · <b>Baixa:</b> ${usd(mean(baixa))}</p>
      <p><b>Diferença (alta − baixa): ${usd(obs, true)}</b> · IC 95% [${usd(icD[0], true)} ; ${usd(icD[1], true)}] · p = <b>${nf(pval, 3)}</b> (teste de permutação, ${nf(P)} sorteios) — ${sig ? "diferença distinguível de zero" : "sem evidência suficiente de diferença"}.</p>
      <p class="aviso">Meses vizinhos não são independentes e os regimes coincidem com outros eventos (pandemia, safras); o p tende a ser otimista. Leia como indício, não como prova.</p>`;
  }

  /* ---------- 3) Compra x saída ---------- */
  function serieAntecedencia() {
    const rows = mensal(new Set([st.prod]));
    const f = (r) => (st.fluxo === "exp" ? (st.medida === "valor" ? r.exp : r.expKg) : st.medida === "valor" ? r.imp : r.impKg);
    let vals = rows.map(f);
    if (st.tend) { // razão à média móvel centrada de ~12 meses: tira a tendência de longo prazo (crescimento, preço)
      const orig = vals.slice();
      vals = orig.map((v, i) => {
        const jan = orig.slice(Math.max(0, i - 6), Math.min(orig.length, i + 7));
        if (jan.length < 7) return null;
        const mm = mean(jan);
        return mm > 0 ? v / mm : null;
      });
    }
    if (st.dessaz) { // valor / média do mesmo mês-do-ano: remove a safra/sazonalidade
      const soma = Array(12).fill(0), cnt = Array(12).fill(0);
      rows.forEach((r, i) => { if (vals[i] == null) return; const mm = +r.k.slice(5) - 1; soma[mm] += vals[i]; cnt[mm]++; });
      vals = rows.map((r, i) => { const mm = +r.k.slice(5) - 1; const mu = cnt[mm] ? soma[mm] / cnt[mm] : 0; return vals[i] != null && mu > 0 ? vals[i] / mu : null; });
    }
    return rows.map((r, i) => ({ k: r.k, v: vals[i] }));
  }
  const indEm = (k, L) => D[estado.ind][shift(k, -L)];

  function renderAntecedencia() {
    const serie = serieAntecedencia();
    const nomeInd = IND[estado.ind].curto, nomeProd = D.commodities[st.prod].nome;
    const rs = [];
    for (let L = 0; L <= MAX_LAG; L++) {
      const pares = serie.filter((p) => p.v != null && indEm(p.k, L) != null);
      rs.push({ L, n: pares.length, r: pearson(pares.map((p) => indEm(p.k, L)), pares.map((p) => p.v)) });
    }
    const validos = rs.filter((o) => o.r != null);
    const melhor = validos.length ? validos.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : null;
    const lag = Math.min(MAX_LAG, st.lag ?? (melhor ? melhor.L : 0));
    $("#a-lag").value = lag; $("#a-lag-val").textContent = lag === 0 ? "0 mês (época da saída)" : `${lag} ${lag === 1 ? "mês" : "meses"} antes`;
    const medidaTxt = st.medida === "valor" ? "valor" : "volume";
    $("#a-linha-tit").textContent = `${nomeProd} (${st.fluxo === "exp" ? "exportação" : "importação"}, ${medidaTxt}${st.tend ? ", sem tendência" : ""}${st.dessaz ? ", sem sazonalidade" : ""}) × ${nomeInd} de ${lag} ${lag === 1 ? "mês" : "meses"} antes — em desvios-padrão`;

    /* barras de r por defasagem */
    const hb = $("#a-barras"); hb.innerHTML = "";
    const W = Math.max(300, hb.clientWidth || 480), H = 260, m = { l: 34, r: 8, t: 14, b: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / (MAX_LAG + 1);
    const rmax = Math.max(0.3, Math.ceil(Math.max(...validos.map((o) => Math.abs(o.r)), 0.3) * 10) / 10);
    const y = (v) => m.t + ih / 2 - (v / rmax) * (ih / 2);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Correlação por defasagem em meses" });
    [-rmax, -rmax / 2, 0, rmax / 2, rmax].forEach((v) => {
      svg.append(sv("line", { class: v === 0 ? "zero" : "grade", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      const t = sv("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }); t.textContent = nf(v, 2); svg.append(t);
    });
    rs.forEach((o) => {
      const cx = m.l + bw * (o.L + 0.5);
      if (o.r != null) {
        const sel = o.L === lag, best = melhor && o.L === melhor.L;
        const r = sv("rect", { x: cx - bw * 0.36, y: Math.min(y(0), y(o.r)), width: bw * 0.72, height: Math.max(1.5, Math.abs(y(o.r) - y(0))), rx: 3,
          fill: o.r >= 0 ? "var(--exp)" : "var(--neg)", opacity: sel ? 1 : 0.5, stroke: sel ? "#fff" : best ? "var(--ind)" : "none", "stroke-width": 2, style: "cursor:pointer" });
        const tt = sv("title"); tt.textContent = `defasagem ${o.L}: r = ${nf(o.r, 2)} (${o.n} meses)`; r.append(tt);
        r.addEventListener("click", () => { st.lag = o.L; renderAntecedencia(); });
        svg.append(r);
      }
      const t = sv("text", { x: cx, y: H - 26, "text-anchor": "middle" }); t.textContent = o.L; svg.append(t);
    });
    const ex = sv("text", { x: m.l, y: H - 6 }); ex.textContent = "← saída"; svg.append(ex);
    const ec = sv("text", { x: W - m.r, y: H - 6, "text-anchor": "end" }); ec.textContent = "meses antes (compra) →"; svg.append(ec);
    hb.append(svg);

    const hl = $("#a-linha"); hl.innerHTML = "";
    const pts = serie.map((p) => ({ k: p.k, a: p.v, b: indEm(p.k, lag) }));
    const za = zscore(pts.map((p) => p.a)), zb = zscore(pts.map((p) => p.b));
    const W2 = Math.max(300, hl.clientWidth || 480), m2 = { l: 30, r: 8, t: 14, b: 30 };
    const iw2 = W2 - m2.l - m2.r, ih2 = H - m2.t - m2.b, n = pts.length, step = iw2 / n;
    const zs = [...za, ...zb].filter((v) => v != null);
    const zlim = Math.max(2, Math.ceil(Math.max(...zs.map(Math.abs), 2)));
    const y2 = (v) => m2.t + ih2 / 2 - (v / zlim) * (ih2 / 2), x2 = (i) => m2.l + step * (i + 0.5);
    const s2 = sv("svg", { viewBox: `0 0 ${W2} ${H}`, role: "img", "aria-label": "Série da commodity e do indicador defasado, padronizadas" });
    for (let v = -zlim; v <= zlim; v += zlim / 2) {
      s2.append(sv("line", { class: v === 0 ? "zero" : "grade", x1: m2.l, x2: W2 - m2.r, y1: y2(v), y2: y2(v) }));
      const t = sv("text", { x: m2.l - 6, y: y2(v) + 4, "text-anchor": "end" }); t.textContent = nf(v, 0 + (zlim % 2 ? 1 : 0)); s2.append(t);
    }
    const cada = Math.ceil(n / (peqW(W2) ? 4 : 8));
    pts.forEach((p, i) => { if (i % cada) return; const t = sv("text", { x: x2(i), y: H - 10, "text-anchor": "middle" }); t.textContent = mesRot(p.k); s2.append(t); });
    const traco = (zv, cor, extra = {}) => {
      let d = "", ab = false;
      zv.forEach((v, i) => { if (v == null) { ab = false; return; } d += `${ab ? "L" : "M"}${x2(i).toFixed(1)} ${y2(v).toFixed(1)}`; ab = true; });
      s2.append(sv("path", { d, class: "linha", stroke: cor, ...extra }));
    };
    traco(zb, "var(--ind)", { "stroke-dasharray": "6 5", "stroke-width": 2 });
    traco(za, CORES[st.prod]);
    const guia = sv("line", { class: "guia", y1: m2.t, y2: m2.t + ih2, opacity: 0 });
    const alvo = sv("rect", { x: m2.l, y: m2.t, width: iw2, height: ih2, fill: "transparent", style: "cursor:crosshair" });
    s2.append(guia, alvo);
    const dica = document.getElementById("dica");
    const mostra = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev, box = s2.getBoundingClientRect();
      const px = ((pt.clientX - box.left) / box.width) * W2;
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - m2.l) / step))), p = pts[i];
      guia.setAttribute("x1", x2(i)); guia.setAttribute("x2", x2(i)); guia.setAttribute("opacity", 1);
      dica.hidden = false;
      dica.innerHTML = `<b>${mesRot(p.k)}</b>
        <div><span style="color:${CORES[st.prod]}">${nomeProd}</span><span>${za[i] == null ? "—" : nf(za[i], 2) + " σ"}</span></div>
        <div><span style="color:var(--ind)">${nomeInd} (${shift(p.k, -lag).slice(5)}/${shift(p.k, -lag).slice(2, 4)})</span><span>${p.b == null ? "sem dado" : IND[estado.ind].fmt(p.b)}</span></div>`;
      dica.style.left = `${pt.clientX + 16 + 200 > innerWidth ? pt.clientX - 216 : pt.clientX + 16}px`; dica.style.top = `${Math.max(8, pt.clientY - 20)}px`;
    };
    const some = () => { dica.hidden = true; guia.setAttribute("opacity", 0); };
    alvo.addEventListener("mousemove", mostra); alvo.addEventListener("touchmove", mostra, { passive: true });
    alvo.addEventListener("mouseleave", some); alvo.addEventListener("touchend", some);
    hl.append(s2);

    /* leitura */
    const r0 = rs[0].r, rl = rs.find((o) => o.L === lag);
    let leitura;
    if (!melhor) leitura = `Sem pares suficientes (mínimo 12 meses) para calcular — amplie o período ou escolha outro indicador.`;
    else {
      const ganho = Math.abs(melhor.r) - Math.abs(r0 ?? 0);
      const fraca = Math.abs(melhor.r) < 0.2;
      const ondeSegue = fraca
        ? `<b>nenhuma defasagem mostra associação relevante</b> (|r| < 0,20): neste recorte, ${nomeProd} não segue claramente o cenário de ${nomeInd} nem da época da compra nem da saída.`
        : melhor.L === 0 || ganho < 0.08
        ? `a associação mais forte está na <b>época da saída</b> (defasagem 0): ${nomeProd} acompanha o cenário do mês do embarque.`
        : `a associação é mais forte com o cenário de <b>${melhor.L} ${melhor.L === 1 ? "mês" : "meses"} antes</b> (época da compra/contratação), não com o do mês da saída (r = ${nf(r0 ?? 0, 2)}).`;
      leitura = `<p>Maior associação absoluta: defasagem <b>${melhor.L}</b> (r = <b>${nf(melhor.r, 2)}</b>, ${melhor.n} meses). Neste recorte, ${ondeSegue}</p>
        <p>Defasagem selecionada (${lag}): r = <b>${rl && rl.r != null ? nf(rl.r, 2) : "—"}</b>${rl ? ` com ${rl.n} meses` : ""}. Sinal positivo: ${nomeInd} mais ${estado.ind === "selic" ? "alta" : "alto"} naquela época ↔ ${st.medida === "valor" ? "valor" : "volume"} maior no embarque.</p>`;
    }
    $("#a-txt").innerHTML = `${leitura}
      <p class="aviso">Correlação entre séries temporais, com poucos meses, sofre de tendência e autocorrelação, e o indicador (${nomeInd}) muda por regimes (poucos movimentos independentes). Use para levantar hipóteses; o teste de causalidade pediria modelos próprios (ex.: VAR, Granger).${st.dessaz ? "" : " Sem remover a sazonalidade, a safra (pico de embarques de soja entre mar. e jun.) domina o resultado."}${st.tend ? "" : " Sem remover a tendência, o crescimento de 2018 a 2025 infla a correlação com qualquer série que também suba ou desça de forma gradual."}</p>`;
  }
  function zscore(arr) {
    const v = arr.filter((x) => x != null);
    if (v.length < 2) return arr.map(() => null);
    const m = mean(v), s = sd(v) || 1;
    return arr.map((x) => (x == null ? null : (x - m) / s));
  }

  function radio(sel, obj, chave, fn) {
    const g = $(sel), marca = () => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === obj[chave]));
    g.querySelectorAll("button").forEach((b) => (b.onclick = () => { obj[chave] = b.dataset.v; if (chave !== "lag") marca(); fn(); }));
    marca();
  }
  radio("#s-metrica", st, "metrica", () => { renderAmostragem(); renderRegimes(); });
  radio("#a-fluxo", st, "fluxo", () => { st.lag = null; renderAntecedencia(); });
  radio("#a-medida", st, "medida", () => { st.lag = null; renderAntecedencia(); });
  $("#n-in").oninput = (e) => { st.n = +e.target.value; renderAmostragem(); };
  $("#sorteia").onclick = () => { st.seed++; renderAmostragem(); };
  PRODUTOS.forEach((p) => $("#a-prod").append(el("option", { value: p }, D.commodities[p].nome)));
  $("#a-prod").value = st.prod;
  $("#a-prod").onchange = (e) => { st.prod = e.target.value; st.lag = null; renderAntecedencia(); };
  $("#a-dessaz").checked = st.dessaz;
  $("#a-tend").checked = st.tend;
  $("#a-tend").onchange = (e) => { st.tend = e.target.checked; st.lag = null; renderAntecedencia(); };
  $("#a-dessaz").onchange = (e) => { st.dessaz = e.target.checked; st.lag = null; renderAntecedencia(); };
  $("#a-lag").oninput = (e) => { st.lag = +e.target.value; renderAntecedencia(); };
  $("#a-auto").onclick = () => { st.lag = null; renderAntecedencia(); };

  const tudo = () => { renderAmostragem(); renderRegimes(); renderAntecedencia(); };
  window.DASH.onRender.push(tudo);
  tudo();
})();
