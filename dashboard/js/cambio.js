/* Câmbio: o dólar mexe com o comércio exterior?  (linguagem simples na tela; cálculo por baixo)
 *  - Compara a VARIAÇÃO EM 12 MESES do dólar com a variação em 12 meses de cada produto
 *    (valor, quantidade ou preço por kg). Variação em 12 meses tira a sazonalidade e o crescimento
 *    de longo prazo, que inflavam as correlações em níveis.
 *  - Testa o dólar de 0 a 12 meses antes. Fica com a defasagem de maior relação.
 *  - Significância: gira a série do dólar pela linha do tempo (todas as posições) e vê quantas vezes
 *    uma "relação ao acaso" chega tão alto quanto a real (respeita meses vizinhos parecidos e já
 *    considera que testamos 13 defasagens).
 * Fonte dos dados: os mesmos de app.js (dados.js).
 */
(() => {
  "use strict";
  const { estado, usd, nf, el, sv, CORES, D, PRODUTOS } = window.DASH;
  const raiz = document.getElementById("cambio");
  if (!raiz) return;

  const st = { medida: "valor", sel: { p: "minerio_de_ferro", fl: "exp" } };
  const MAX_LAG = 12, MIN_PARES = 24, LIMITE = 0.3;
  const MEDIDAS = {
    valor: { rot: "Valor (US$)", nome: "o valor", sing: "valor" },
    kg: { rot: "Quantidade (kg)", nome: "a quantidade", sing: "quantidade" },
    preco: { rot: "Preço por kg", nome: "o preço por kg", sing: "preço por kg" },
  };
  const FLUXO = { exp: "Exportação", imp: "Importação" };
  const forca = (r) => { const a = Math.abs(r); return a < LIMITE ? "sem relação clara" : a < 0.5 ? "fraca" : a < 0.7 ? "média" : "forte"; };
  const meses = (n) => `${n} ${n === 1 ? "mês" : "meses"}`;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const nomeCurto = (p) => D.commodities[p].nome.replace(/ \(.*\)/, "");

  const shift = (k, d) => { const [a, m] = k.split("-").map(Number); const i = a * 12 + (m - 1) + d; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
  const KS = [];
  for (let a = 2018; a <= 2025; a++) for (let m = 1; m <= 12; m++) KS.push(`${a}-${String(m).padStart(2, "0")}`);
  const N = KS.length;

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < MIN_PARES) return null;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }

  /* variação em 12 meses, na linha do tempo completa (índices de KS) */
  const yoy = (f) => KS.map((k) => { const p = f(shift(k, -12)), c = f(k); return p > 0 && c > 0 ? c / p - 1 : null; });
  const dolarYoy = yoy((k) => D.dolar[k]);

  function serieProduto(p, fl, medida) {
    const S = D.commodities[p].serie;
    const f = medida === "valor" ? (k) => S[k]?.[fl]
      : medida === "kg" ? (k) => S[k]?.[fl + "Kg"]
      : (k) => (S[k] && S[k][fl + "Kg"] > 0 ? S[k][fl] / S[k][fl + "Kg"] : undefined);
    return yoy(f);
  }

  /* correlação por defasagem; só entram os meses do período escolhido */
  function porDefasagem(ya, da, dentro) {
    const rs = [];
    for (let L = 0; L <= MAX_LAG; L++) {
      const xs = [], ys = [];
      for (let i = 0; i < N; i++) {
        const j = i - L;
        if (j < 0 || !dentro[i] || ya[i] == null || da[j] == null) continue;
        xs.push(da[j]); ys.push(ya[i]);
      }
      rs.push({ L, n: xs.length, r: pearson(xs, ys) });
    }
    return rs;
  }
  const melhorDe = (rs) => { const v = rs.filter((o) => o.r != null); return v.length ? v.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : null; };

  const cache = new Map();
  function analisa(p, fl, medida) {
    const dentro = KS.map((k) => +k.slice(0, 4) >= estado.de && +k.slice(0, 4) <= estado.ate);
    const chave = `${p}|${fl}|${medida}|${estado.de}|${estado.ate}`;
    if (cache.has(chave)) return cache.get(chave);
    const ya = serieProduto(p, fl, medida);
    const rs = porDefasagem(ya, dolarYoy, dentro), melhor = melhorDe(rs);
    let pval = null;
    if (melhor) {
      let ext = 0, tot = 0;
      for (let s = 12; s <= N - 12; s++) {
        const rot = dolarYoy.map((_, i) => dolarYoy[(i + s) % N]);
        const b = melhorDe(porDefasagem(ya, rot, dentro));
        tot++; if (b && Math.abs(b.r) >= Math.abs(melhor.r) - 1e-9) ext++;
      }
      pval = ext / tot;
    }
    const out = { rs, melhor, pval };
    cache.set(chave, out);
    return out;
  }
  const veredito = (a) => {
    if (!a.melhor || Math.abs(a.melhor.r) < LIMITE) return "nada";
    return a.pval < 0.05 ? "firme" : "talvez";
  };

  /* ---------- Esqueleto ---------- */
  raiz.innerHTML = `
    <h2 class="secao">E o câmbio? O dólar mexe com o comércio?
      <small>Comparamos quanto o dólar subiu ou caiu em 12 meses com quanto cada produto subiu ou caiu em 12 meses. Assim o crescimento ao longo dos anos e a safra não enganam.</small></h2>
    <section class="painel grande">
      <div class="tiles" id="c-tiles"></div>
    </section>
    <section class="painel grande" style="margin-top:16px">
      <div class="painel-topo"><h2>Onde o dólar faz diferença?</h2></div>
      <div class="mini">
        <span class="rotulo">O que olhar:</span>
        <div class="seg" id="c-medida" role="radiogroup" aria-label="O que olhar"></div>
      </div>
      <div class="mapa" id="c-mapa"></div>
      <div class="legenda" id="c-leg"></div>
      <hr class="sep">
      <p class="manchete" id="c-manchete"></p>
      <div class="grafico" id="c-barras"></div>
      <p class="nota" id="c-nota"></p>
    </section>`;
  const $ = (s) => raiz.querySelector(s);
  Object.entries(MEDIDAS).forEach(([k, v]) => $("#c-medida").append(el("button", { role: "radio", "data-v": k }, v.rot)));
  $("#c-medida").querySelectorAll("button").forEach((b) => (b.onclick = () => { st.medida = b.dataset.v; tudo(); }));

  /* ---------- Resumo do dólar no período ---------- */
  function renderTiles() {
    const ms = KS.filter((k) => +k.slice(0, 4) >= estado.de && +k.slice(0, 4) <= estado.ate && D.dolar[k] != null);
    if (ms.length < 2) { $("#c-tiles").innerHTML = `<p class="nota">Sem dados de dólar neste período.</p>`; return; }
    const v = ms.map((k) => D.dolar[k]);
    const iMin = v.indexOf(Math.min(...v)), iMax = v.indexOf(Math.max(...v));
    const rot = (k) => `${k.slice(5)}/${k.slice(0, 4)}`, brl = (x) => `R$ ${nf(x, 2)}`;
    const var0 = (v[v.length - 1] / v[0] - 1) * 100;
    $("#c-tiles").innerHTML = `
      <div class="tile"><small>Dólar médio no período</small><strong>${brl(mean(v))}</strong></div>
      <div class="tile"><small>Mais barato (${rot(ms[iMin])})</small><strong>${brl(v[iMin])}</strong></div>
      <div class="tile"><small>Mais caro (${rot(ms[iMax])})</small><strong>${brl(v[iMax])}</strong></div>
      <div class="tile"><small>De ${rot(ms[0])} a ${rot(ms[ms.length - 1])}</small><strong>${var0 >= 0 ? "+" : "−"}${nf(Math.abs(var0), 0)}%</strong><em>${var0 >= 0 ? "real mais fraco" : "real mais forte"}</em></div>`;
  }

  /* ---------- Mapa produto x fluxo ---------- */
  function renderMapa() {
    $("#c-medida").querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === st.medida));
    const box = $("#c-mapa");
    box.innerHTML = "";
    box.append(el("span", {}, ""), el("b", { class: "mp-cab" }, "Exportação"), el("b", { class: "mp-cab" }, "Importação"));
    PRODUTOS.forEach((p) => {
      box.append(el("span", { class: "mp-prod", style: `color:${CORES[p]}` }, nomeCurto(p)));
      ["exp", "imp"].forEach((fl) => {
        const a = analisa(p, fl, st.medida), v = veredito(a);
        const sel = st.sel.p === p && st.sel.fl === fl;
        let txt, cls;
        if (!a.melhor) { txt = "poucos meses"; cls = "nada"; }
        else if (v === "nada") { txt = "sem relação clara"; cls = "nada"; }
        else {
          const dir = a.melhor.r > 0 ? "↑ sobe junto" : "↓ cai quando o dólar sobe";
          txt = `${dir}<small>${a.melhor.L === 0 ? "no mesmo mês" : "cerca de " + meses(a.melhor.L) + " depois"} · ${forca(a.melhor.r)}<br>${v === "firme" ? "✓ consistente" : "? pode ser coincidência"}</small>`;
          cls = (a.melhor.r > 0 ? "pos " : "neg ") + v;
        }
        const b = el("button", { class: `cel ${cls}${sel ? " sel" : ""}`, "aria-pressed": sel }, txt);
        b.onclick = () => { st.sel = { p, fl }; renderMapa(); renderDetalhe(); };
        box.append(b);
      });
    });
    $("#c-leg").innerHTML = `
      <span><i class="barra" style="--c:var(--exp)"></i>sobe junto com o dólar</span>
      <span><i class="barra" style="--c:var(--neg)"></i>cai quando o dólar sobe</span>
      <span><i class="barra" style="--c:var(--neutro);opacity:.25"></i>sem relação clara</span>
      <span>cor apagada = pode ser coincidência</span>`;
  }

  /* ---------- Detalhe: barras por defasagem ---------- */
  function renderDetalhe() {
    const { p, fl } = st.sel, M = MEDIDAS[st.medida];
    const a = analisa(p, fl, st.medida), v = veredito(a), nome = nomeCurto(p), fluxo = fl === "exp" ? "exportação" : "importação";
    let manchete;
    if (!a.melhor) manchete = `Poucos meses com dado para calcular. Amplie o período.`;
    else if (v === "nada") manchete = `Para ${nome} (${fluxo}), o dólar não mostra relação clara com ${M.nome}. A relação mais forte explica só ${nf(a.melhor.r ** 2 * 100, 0)}% das oscilações.`;
    else {
      const quando = a.melhor.L === 0 ? "no mesmo mês" : `cerca de <b>${meses(a.melhor.L)} depois</b>`;
      const sentido = a.melhor.r > 0 ? `tende a <b>subir</b>` : `tende a <b>cair</b>`;
      manchete = `Quando o dólar sobe, ${M.nome} de ${nome} (${fluxo}) ${sentido} ${quando} (relação ${forca(a.melhor.r)}). ${v === "firme" ? "É maior do que o acaso costuma produzir." : "Mas pode ser coincidência: não passou no teste."}`;
    }
    $("#c-manchete").innerHTML = manchete;

    const hb = $("#c-barras"); hb.innerHTML = "";
    const W = Math.max(280, hb.clientWidth || 600), pq = W < 520, H = pq ? 220 : 240, m = { l: 8, r: 8, t: 22, b: 50 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / (MAX_LAG + 1);
    const rmax = 0.9;
    const y = (x) => m.t + ih / 2 - (x / rmax) * (ih / 2);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Relação entre o dólar e ${M.nome} de ${nome}, por meses de defasagem` });
    svg.append(sv("line", { class: "zero", x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    [LIMITE, -LIMITE].forEach((x) => svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: y(x), y2: y(x), stroke: "var(--ind)", "stroke-dasharray": "3 5", opacity: 0.45 })));
    const lt = sv("text", { x: W - m.r, y: y(LIMITE) - 4, "text-anchor": "end" }); lt.style.fill = "var(--ind)"; lt.textContent = "só conta quando passa daqui"; svg.append(lt);
    const t1 = sv("text", { x: m.l, y: 11 }); t1.textContent = "↑ sobe junto com o dólar"; svg.append(t1);
    const t2 = sv("text", { x: m.l, y: m.t + ih + 12 }); t2.textContent = "↓ cai quando o dólar sobe"; svg.append(t2);
    a.rs.forEach((o) => {
      const cx = m.l + bw * (o.L + 0.5);
      if (o.r != null) {
        const fraca = Math.abs(o.r) < LIMITE, best = a.melhor && o.L === a.melhor.L && !fraca;
        const r = sv("rect", { x: cx - bw * 0.34, y: Math.min(y(0), y(o.r)), width: bw * 0.68, height: Math.max(2, Math.abs(y(o.r) - y(0))), rx: 3,
          fill: fraca ? "var(--neutro)" : o.r >= 0 ? "var(--exp)" : "var(--neg)", opacity: fraca ? 0.22 : best ? 1 : 0.6, stroke: best ? "var(--ind)" : "none", "stroke-width": 2.5 });
        const tt = sv("title"); tt.textContent = `${o.L === 0 ? "Mesmo mês" : "Dólar de " + meses(o.L) + " antes"}: ${fraca ? "sem relação clara" : "relação " + forca(o.r)}`;
        r.append(tt); svg.append(r);
      }
      const t = sv("text", { x: cx, y: H - 24, "text-anchor": "middle" }); t.textContent = o.L; svg.append(t);
    });
    const e1 = sv("text", { x: m.l, y: H - 5 }); e1.textContent = "← mesmo mês"; svg.append(e1);
    const e2 = sv("text", { x: W - m.r, y: H - 5, "text-anchor": "end" }); e2.textContent = "meses depois da mudança do dólar →"; svg.append(e2);
    hb.append(svg);
    $("#c-nota").textContent = `Isto compara variações em 12 meses (${a.melhor ? a.melhor.n + " meses na melhor defasagem" : ""}). Foram testadas 24 combinações (produto × fluxo × 3 medidas) só nesta tela: algum "consistente" pode aparecer por acaso. O preço por kg mistura mercadorias diferentes, e o dólar costuma andar junto com o ciclo mundial de preços; andar junto não prova que o câmbio causa a mudança.`;
  }

  const tudo = () => { renderTiles(); renderMapa(); renderDetalhe(); };
  window.DASH.onRender.push(tudo);
  tudo();
})();
