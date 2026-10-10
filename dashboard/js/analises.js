/* Análises do dashboard, em linguagem simples (rodam sobre as séries mensais carregadas por app.js).
 *  1) "Se eu olhasse só alguns meses, erraria muito?"  -> amostra aleatória de meses x média real.
 *  2) "Selic alta x baixa: muda alguma coisa?"        -> compara meses de indicador alto e baixo.
 *  3) "A commodity segue o cenário da compra ou da saída?" -> relação com o indicador de N meses antes.
 * Por baixo continuam sendo cálculos estatísticos (amostragem sem reposição, bootstrap/permutação,
 * correlação com defasagem), mas a tela só mostra o resultado em palavras.
 * Os sorteios usam semente fixa: o mesmo recorte sempre dá o mesmo resultado.
 */
(() => {
  "use strict";
  const { estado, agregar, usd, nf, el, sv, CORES, IND, D, PRODUTOS } = window.DASH;
  const raiz = document.getElementById("analises");

  const st = { metrica: "exp", n: 12, seed: 7, prod: "soja", fluxo: "exp", medida: "valor", dessaz: true, tend: true };
  const NOME_METRICA = { exp: "as exportações", imp: "as importações", saldo: "o saldo" };
  const MAX_LAG = 12;

  /* ---------- Cálculo (fica escondido da tela) ---------- */
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const quant = (s, q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
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
  function sorteio(len, n, rnd) { // n posições distintas de 0..len-1
    const a = Array.from({ length: len }, (_, i) => i);
    for (let i = 0; i < n; i++) { const j = i + Math.floor(rnd() * (len - i)); [a[i], a[j]] = [a[j], a[i]]; }
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
  const meses = (n) => `${n} ${n === 1 ? "mês" : "meses"}`;
  const forca = (r) => { const a = Math.abs(r); return a < 0.15 ? "quase nenhuma" : a < 0.3 ? "fraca" : a < 0.5 ? "média" : "forte"; };

  /* ---------- Esqueleto ---------- */
  raiz.innerHTML = `
    <h2 class="secao">Olhando os números de outro jeito
      <small>Três perguntas simples, respondidas com os meses do recorte escolhido lá em cima.</small></h2>
    <div class="mini">
      <span class="rotulo">Olhar:</span>
      <div class="seg" id="s-metrica" role="radiogroup" aria-label="O que analisar">
        <button role="radio" data-v="exp">Exportações</button>
        <button role="radio" data-v="imp">Importações</button>
        <button role="radio" data-v="saldo">Saldo</button>
      </div>
    </div>
    <div class="duas">
      <section class="painel">
        <div class="painel-topo"><h2>Se eu olhasse só alguns meses, erraria muito?</h2></div>
        <p class="sub-graf">Cada barra é um mês. As coloridas foram sorteadas.</p>
        <div class="mini">
          <label>Meses sorteados: <b id="n-val"></b>
            <input type="range" id="n-in" min="5" max="48" step="1" aria-label="Quantidade de meses sorteados"></label>
          <button id="sorteia">Sortear de novo</button>
        </div>
        <div class="grafico" id="s1"></div>
        <div class="legenda" id="s1-leg"></div>
        <div class="tiles" id="s1-tiles"></div>
        <p class="manchete" id="s1-txt"></p>
      </section>
      <section class="painel">
        <div class="painel-topo"><h2 id="s2-tit">Indicador alto × baixo: muda alguma coisa?</h2></div>
        <div id="s2"></div>
      </section>
    </div>

    <h2 class="secao">A commodity segue o cenário da compra ou o da saída?
      <small>Contratos costumam ser fechados meses antes do embarque. Cada barra compara o embarque com o indicador de alguns meses antes.</small></h2>
    <section class="painel grande">
      <div class="mini">
        <label>Produto <select id="a-prod"></select></label>
        <div class="seg" id="a-fluxo" role="radiogroup" aria-label="Fluxo">
          <button role="radio" data-v="exp">Exportação</button><button role="radio" data-v="imp">Importação</button>
        </div>
      </div>
      <p class="manchete" id="a-manchete"></p>
      <div class="grafico" id="a-barras"></div>
      <div class="legenda" id="a-leg"></div>
      <p class="nota" id="a-txt"></p>
      <details class="avancado">
        <summary>Ajustes (opcional)</summary>
        <div class="mini">
          <div class="seg" id="a-medida" role="radiogroup" aria-label="Medida">
            <button role="radio" data-v="valor">Valor (US$)</button><button role="radio" data-v="kg">Quantidade (kg)</button>
          </div>
          <label class="chk"><input type="checkbox" id="a-dessaz"> Ignorar o efeito da safra</label>
          <label class="chk"><input type="checkbox" id="a-tend"> Ignorar o crescimento de longo prazo</label>
        </div>
        <p class="nota">Sem esses descontos, a relação pode aparecer só porque tudo cresceu ou porque a safra tem época certa, e não por causa do indicador.</p>
      </details>
    </section>`;

  const $ = (s) => raiz.querySelector(s);
  const mensal = (produtos = estado.sel) => agregar(produtos, "mes").rows;

  /* ---------- 1) Poucos meses erram muito? ---------- */
  function renderAmostragem() {
    const rows = mensal(), pop = rows.map((r) => r[st.metrica]), N = pop.length;
    const nMax = Math.max(5, Math.floor(N / 2));
    st.n = Math.min(Math.max(5, st.n), nMax);
    $("#n-in").max = nMax; $("#n-in").value = st.n; $("#n-val").textContent = st.n;
    const n = st.n, mu = mean(pop);

    // 2000 sorteios: o "erro típico" de olhar só n meses
    const rnd = rng(12345), erros = [];
    for (let b = 0; b < 2000; b++) erros.push(Math.abs(mean(sorteio(N, n, rnd).map((i) => pop[i])) - mu));
    const erro95 = quant(sorted(erros), 0.95);

    const idx = new Set(sorteio(N, n, rng(st.seed * 7919 + 13)));
    const xb = mean([...idx].map((i) => pop[i])), dif = xb - mu;

    const host = $("#s1");
    host.innerHTML = "";
    const W = Math.max(280, host.clientWidth || 560), H = 230, m = { l: 8, r: 8, t: 10, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vmin = Math.min(0, ...pop), vmax = Math.max(0, ...pop);
    const y = (v) => m.t + ih - ((v - vmin) / (vmax - vmin || 1)) * ih;
    const bw = iw / N;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Barras mensais com os meses sorteados em destaque" });
    rows.forEach((r, i) => {
      const v = pop[i], top = Math.min(y(v), y(0)), alt = Math.max(1, Math.abs(y(v) - y(0)));
      const on = idx.has(i);
      const b = sv("rect", { x: m.l + i * bw + bw * 0.1, y: top, width: Math.max(1, bw * 0.8), height: alt, rx: 1.5, fill: on ? "var(--exp)" : "#ffffff", opacity: on ? 1 : 0.13 });
      const t = sv("title"); t.textContent = `${r.k.slice(5)}/${r.k.slice(0, 4)}: ${usd(v)}${on ? " (sorteado)" : ""}`; b.append(t);
      svg.append(b);
      if (r.k.endsWith("-01")) { const t2 = sv("text", { x: m.l + i * bw, y: H - 7 }); t2.textContent = r.k.slice(0, 4); svg.append(t2); }
    });
    svg.append(sv("line", { class: "zero", x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: y(mu), y2: y(mu), stroke: "#fff", "stroke-width": 1.6, "stroke-dasharray": "5 4" }));
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: y(xb), y2: y(xb), stroke: "var(--ind)", "stroke-width": 2.4 }));
    host.append(svg);
    $("#s1-leg").innerHTML = `
      <span><i class="barra" style="--c:var(--exp)"></i>mês sorteado</span>
      <span><i class="trac" style="--c:#fff"></i>média de todos os meses</span>
      <span><i style="--c:var(--ind)"></i>média dos sorteados</span>`;

    const pct = Math.abs(mu) > 0 && mu > 0 ? ` (${nf((erro95 / mu) * 100, 0)}% da média)` : "";
    const difPct = mu > 0 ? ` (${nf((Math.abs(dif) / mu) * 100, 1)}%)` : "";
    $("#s1-tiles").innerHTML = `
      <div class="tile"><small>Média real (${N} meses)</small><strong>${usd(mu)}</strong></div>
      <div class="tile"><small>Média dos ${n} sorteados</small><strong style="color:var(--ind)">${usd(xb)}</strong></div>
      <div class="tile"><small>Diferença</small><strong>${usd(dif, true)}</strong><em>${difPct.replace(/[()]/g, "")}</em></div>`;
    $("#s1-txt").innerHTML = `Sorteando <b>${n} meses</b>, a média quase sempre fica perto da real: em 95 de 100 sorteios o erro é menor que <b>${usd(erro95)}</b>${pct}. ${n < nMax ? "Quanto mais meses, menor o erro." : ""}`;
  }

  /* ---------- 2) Indicador alto x baixo ---------- */
  function renderRegimes() {
    const rows = mensal().filter((r) => r.ind != null);
    const info = IND[estado.ind], nomeInd = info.curto;
    $("#s2-tit").textContent = `${nomeInd} alta × baixa: muda alguma coisa?`;
    const host = $("#s2");
    const ordenado = sorted(rows.map((r) => r.ind)), med = quant(ordenado, 0.5);
    const baixa = rows.filter((r) => r.ind <= med).map((r) => r[st.metrica]);
    const alta = rows.filter((r) => r.ind > med).map((r) => r[st.metrica]);
    if (baixa.length < 6 || alta.length < 6) { host.innerHTML = `<p class="nota">Poucos meses com dado de ${nomeInd} neste período para comparar. Amplie o período.</p>`; return; }

    const rnd = rng(2024), P = 5000, todos = baixa.concat(alta), nA = alta.length;
    const obs = mean(alta) - mean(baixa);
    let extremos = 0;
    for (let p = 0; p < P; p++) {
      for (let i = todos.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [todos[i], todos[j]] = [todos[j], todos[i]]; }
      if (Math.abs(mean(todos.slice(0, nA)) - mean(todos.slice(nA))) >= Math.abs(obs)) extremos++;
    }
    const consistente = (extremos + 1) / (P + 1) < 0.05;

    const mA = mean(alta), mB = mean(baixa), max = Math.max(Math.abs(mA), Math.abs(mB)) || 1;
    const linha = (rot, v, qtd, cor) => `
      <div class="gb">
        <div class="gb-topo"><span>${rot}</span><b>${usd(v)}</b></div>
        <div class="gb-trilho"><div class="gb-barra" style="width:${(Math.abs(v) / max) * 100}%;background:${v < 0 ? "var(--neg)" : cor}"></div></div>
        <small>média mensal de ${qtd} meses</small>
      </div>`;
    let manchete;
    if (mB > 0 && mA > 0 && st.metrica !== "saldo") {
      const p = ((mA - mB) / mB) * 100;
      manchete = `Nos meses de ${nomeInd} alta, ${NOME_METRICA[st.metrica]} foram <b>${nf(Math.abs(p), 0)}% ${p >= 0 ? "maiores" : "menores"}</b>.`;
    } else manchete = `Nos meses de ${nomeInd} alta, ${NOME_METRICA[st.metrica]} ficaram <b>${usd(Math.abs(obs))} ${obs >= 0 ? "acima" : "abaixo"}</b> da média dos meses de ${nomeInd} baixa.`;

    host.innerHTML = `
      <p class="manchete">${manchete}</p>
      ${linha(`${nomeInd} baixa (até ${info.fmt(med)})`, mB, baixa.length, "var(--imp)")}
      ${linha(`${nomeInd} alta (acima de ${info.fmt(med)})`, mA, alta.length, "var(--exp)")}
      <p class="selo ${consistente ? "ok" : "talvez"}">${consistente ? "✓ Diferença consistente: dificilmente é só acaso." : "? Pode ser coincidência: a diferença é pequena perto da variação normal dos meses."}</p>
      <p class="nota">Meses são divididos ao meio: metade com ${nomeInd} mais baixa, metade com mais alta. Isso mostra que andam juntos, não que um causa o outro (pandemia, safras e preços também mudaram nesses anos).</p>`;
  }

  /* ---------- 3) Compra x saída ---------- */
  function serieAntecedencia() {
    const rows = mensal(new Set([st.prod]));
    const f = (r) => (st.fluxo === "exp" ? (st.medida === "valor" ? r.exp : r.expKg) : st.medida === "valor" ? r.imp : r.impKg);
    let vals = rows.map(f);
    if (st.tend) { // razão à média móvel centrada de ~12 meses
      const orig = vals.slice();
      vals = orig.map((v, i) => {
        const jan = orig.slice(Math.max(0, i - 6), Math.min(orig.length, i + 7));
        if (jan.length < 7) return null;
        const mm = mean(jan);
        return mm > 0 ? v / mm : null;
      });
    }
    if (st.dessaz) { // valor / média do mesmo mês do ano
      const soma = Array(12).fill(0), cnt = Array(12).fill(0);
      rows.forEach((r, i) => { if (vals[i] == null) return; const mm = +r.k.slice(5) - 1; soma[mm] += vals[i]; cnt[mm]++; });
      vals = rows.map((r, i) => { const mm = +r.k.slice(5) - 1; const mu = cnt[mm] ? soma[mm] / cnt[mm] : 0; return vals[i] != null && mu > 0 ? vals[i] / mu : null; });
    }
    return rows.map((r, i) => ({ k: r.k, v: vals[i] }));
  }
  const indEm = (k, L) => D[estado.ind][shift(k, -L)];

  function renderAntecedencia() {
    const serie = serieAntecedencia();
    const info = IND[estado.ind], nomeInd = info.curto, nomeProd = D.commodities[st.prod].nome.replace(/ \(.*\)/, "");
    const fl = st.fluxo === "exp" ? "exportação" : "importação";
    const rs = [];
    for (let L = 0; L <= MAX_LAG; L++) {
      const pares = serie.filter((p) => p.v != null && indEm(p.k, L) != null);
      rs.push({ L, n: pares.length, r: pearson(pares.map((p) => indEm(p.k, L)), pares.map((p) => p.v)) });
    }
    const validos = rs.filter((o) => o.r != null);
    const melhor = validos.length ? validos.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : null;

    /* gráfico */
    const hb = $("#a-barras"); hb.innerHTML = "";
    const W = Math.max(280, hb.clientWidth || 600), pq = W < 520, H = pq ? 230 : 250, m = { l: 8, r: 8, t: 22, b: 50 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / (MAX_LAG + 1);
    const rmax = Math.max(0.3, Math.ceil(Math.max(...validos.map((o) => Math.abs(o.r)), 0.1) * 10) / 10);
    const y = (v) => m.t + ih / 2 - (v / rmax) * (ih / 2);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Relação entre ${nomeProd} e ${nomeInd} de meses anteriores` });
    svg.append(sv("line", { class: "zero", x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    const topo = sv("text", { x: m.l, y: 11 }); topo.textContent = "↑ sobem juntos"; svg.append(topo);
    const base = sv("text", { x: m.l, y: m.t + ih + 12 }); base.textContent = "↓ um sobe, o outro cai"; svg.append(base);
    const destaque = melhor && Math.abs(melhor.r) >= 0.15 ? (melhor.L === 0 || Math.abs(melhor.r) - Math.abs(rs[0].r ?? 0) < 0.08 ? 0 : melhor.L) : -1;
    rs.forEach((o) => {
      const cx = m.l + bw * (o.L + 0.5);
      if (o.r != null) {
        const fraca = Math.abs(o.r) < 0.15, best = o.L === destaque && !fraca;
        const r = sv("rect", { x: cx - bw * 0.34, y: Math.min(y(0), y(o.r)), width: bw * 0.68, height: Math.max(2, Math.abs(y(o.r) - y(0))), rx: 3,
          fill: fraca ? "#ffffff" : o.r >= 0 ? "var(--exp)" : "var(--neg)", opacity: fraca ? 0.22 : best ? 1 : 0.6, stroke: best ? "var(--ind)" : "none", "stroke-width": 2.5 });
        const tt = sv("title"); tt.textContent = `${o.L === 0 ? "No mês da saída" : "Indicador de " + meses(o.L) + " antes"}: relação ${forca(o.r)}${fraca ? "" : o.r > 0 ? " (sobem juntos)" : " (um sobe, o outro cai)"}`;
        r.append(tt); svg.append(r);
      }
      const t = sv("text", { x: cx, y: H - 24, "text-anchor": "middle" }); t.textContent = o.L; svg.append(t);
    });
    const e1 = sv("text", { x: m.l, y: H - 5 }); e1.textContent = "← mês da saída"; svg.append(e1);
    const e2 = sv("text", { x: W - m.r, y: H - 5, "text-anchor": "end" }); e2.textContent = "meses antes (compra) →"; svg.append(e2);
    hb.append(svg);
    $("#a-leg").innerHTML = `
      <span><i class="barra" style="--c:var(--exp)"></i>sobem juntos</span>
      <span><i class="barra" style="--c:var(--neg)"></i>um sobe, o outro cai</span>
      <span><i class="barra" style="--c:#fff;opacity:.25"></i>quase nenhuma relação</span>
      <span><i class="barra" style="--c:transparent;outline:2px solid var(--ind)"></i>época com a relação mais clara</span>`;

    /* frase principal */
    let manchete, nota = "";
    if (!melhor) manchete = `Poucos meses com dado para calcular. Amplie o período ou troque o indicador.`;
    else if (Math.abs(melhor.r) < 0.15) {
      manchete = `Nenhuma época mostra relação clara: ${nomeProd} (${fl}) não parece seguir o cenário de ${nomeInd}, nem o da compra nem o da saída.`;
    } else {
      const r0 = rs[0].r, quando = melhor.L === 0 || Math.abs(melhor.r) - Math.abs(r0 ?? 0) < 0.08;
      const sentido = melhor.r > 0
        ? `quando ${nomeInd} está ${estado.ind === "selic" ? "mais alta" : "mais alto"}, ${nomeProd} tende a ${st.fluxo === "exp" ? "embarcar" : "entrar"} ${st.medida === "valor" ? "mais valor" : "mais volume"}`
        : `quando ${nomeInd} está ${estado.ind === "selic" ? "mais alta" : "mais alto"}, ${nomeProd} tende a ${st.fluxo === "exp" ? "embarcar" : "entrar"} ${st.medida === "valor" ? "menos valor" : "menos volume"}`;
      manchete = quando
        ? `${nomeProd} (${fl}) acompanha mais o cenário da <b>época da saída</b> (relação ${forca(melhor.r)}).`
        : `${nomeProd} (${fl}) acompanha mais o cenário de <b>${meses(melhor.L)} antes</b>, a época da compra (relação ${forca(melhor.r)}).`;
      nota = `Na prática: ${sentido}. `;
    }
    $("#a-manchete").innerHTML = manchete;
    $("#a-txt").textContent = `${nota}Andar junto não prova que um causa o outro.${melhor && melhor.n ? ` Base: ${melhor.n} meses.` : ""}`;
  }

  /* ---------- Controles ---------- */
  function radio(sel, obj, chave, fn) {
    const g = $(sel), marca = () => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === obj[chave]));
    g.querySelectorAll("button").forEach((b) => (b.onclick = () => { obj[chave] = b.dataset.v; marca(); fn(); }));
    marca();
  }
  radio("#s-metrica", st, "metrica", () => { renderAmostragem(); renderRegimes(); });
  radio("#a-fluxo", st, "fluxo", renderAntecedencia);
  radio("#a-medida", st, "medida", renderAntecedencia);
  $("#n-in").oninput = (e) => { st.n = +e.target.value; renderAmostragem(); };
  $("#sorteia").onclick = () => { st.seed++; renderAmostragem(); };
  PRODUTOS.forEach((p) => $("#a-prod").append(el("option", { value: p }, D.commodities[p].nome)));
  $("#a-prod").value = st.prod;
  $("#a-prod").onchange = (e) => { st.prod = e.target.value; renderAntecedencia(); };
  $("#a-dessaz").checked = st.dessaz;
  $("#a-tend").checked = st.tend;
  $("#a-tend").onchange = (e) => { st.tend = e.target.checked; renderAntecedencia(); };
  $("#a-dessaz").onchange = (e) => { st.dessaz = e.target.checked; renderAntecedencia(); };

  const tudo = () => { renderAmostragem(); renderRegimes(); renderAntecedencia(); };
  window.DASH.onRender.push(tudo);
  tudo();
})();
