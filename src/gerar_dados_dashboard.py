"""Agrega os JSONs de data/processed em um único dashboard/dados.js leve.

Entrada : data/processed/*.json (comércio MDIC, Selic e dólar BCB)
Saída   : dashboard/dados.js  ->  window.DADOS = {...}

Estrutura da saída (valores FOB em US$, peso em kg):
  commodities[chave].serie  -> {"2018-01": {"exp": 0, "imp": 0, "expKg": 0, "impKg": 0}, ...}
  selic / dolar             -> {"2018-01": valor}  (meses sem dado ficam de fora)
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PROC = RAIZ / "data" / "processed"
SAIDA = RAIZ / "dashboard" / "dados.js"

COMMODITIES = {
    "minerio_de_ferro": ("Minério de ferro", ["minerio_de_ferro.json"]),
    "soja": ("Soja e oleaginosas (NCM 12)", ["soja.json"]),
    "petroleo": ("Petróleo e combustíveis (NCM 27)", ["petroleo.json"]),
    "maquinas": ("Máquinas (NCM 84)", [f"maquinas_{a}.json" for a in range(2018, 2026)]),
}


def chave(ano: int, mes: int) -> str:
    return f"{ano}-{mes:02d}"


def agregar(arquivos: list[str]) -> dict:
    serie = defaultdict(lambda: {"exp": 0, "imp": 0, "expKg": 0, "impKg": 0})
    for nome in arquivos:
        for r in json.loads((PROC / nome).read_text(encoding="utf-8"))["serie"]:
            alvo = serie[chave(r["ano"], r["mes"])]
            sufixo = "exp" if r["tipo_operacao"] == "EXPORTACAO" else "imp"
            alvo[sufixo] += r["valor_fob"] or 0
            alvo[sufixo + "Kg"] += r["kg_liquido"] or 0
    return dict(sorted(serie.items()))


def indicador(nome: str, campo: str) -> dict:
    dados = json.loads((PROC / nome).read_text(encoding="utf-8"))["serie"]
    return {chave(r["ano"], r["mes"]): round(r[campo], 4) for r in dados if r.get(campo) is not None}


def main() -> None:
    dados = {
        "commodities": {
            k: {"nome": nome, "serie": agregar(arqs)} for k, (nome, arqs) in COMMODITIES.items()
        },
        "selic": indicador("selic_mensal.json", "valor"),
        "dolar": indicador("dolar_mensal.json", "cotacao_venda"),
        "fontes": {
            "comercio": "MDIC - Estatísticas de Comércio Exterior (valores FOB em US$)",
            "selic": "Banco Central do Brasil - Taxa Selic (% a.a., média mensal)",
            "dolar": "Banco Central do Brasil - PTAX venda (R$/US$, média mensal)",
        },
    }
    SAIDA.parent.mkdir(exist_ok=True)
    SAIDA.write_text("window.DADOS = " + json.dumps(dados, ensure_ascii=False, separators=(",", ":")) + ";\n",
                     encoding="utf-8")
    print(f"Gerado: {SAIDA.relative_to(RAIZ)} ({SAIDA.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
