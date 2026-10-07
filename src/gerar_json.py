"""Gera JSONs públicos do período de 2018 a 2025 sem usar MySQL.

Entradas: data/raw/IMP_2018.csv ... EXP_2025.csv, selic.csv e o JSON do dólar.
Saídas: data/processed/. Máquinas é dividido por ano para caber no GitHub.
O script não altera o banco de dados.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

ANO_INICIAL, ANO_FINAL = 2018, 2025
RAIZ = Path(__file__).resolve().parents[1]
RAW, PROCESSADOS = RAIZ / "data" / "raw", RAIZ / "data" / "processed"
COMMODITIES = {
    "minerio_de_ferro": ("Minério de ferro", "2601"),
    "soja": ("Soja", "12"),
    "petroleo": ("Petróleo", "27"),
    "maquinas": ("Máquinas", "84"),
}


def origem(nome: str) -> Path:
    """Localiza os dados em data/raw ou na pasta indicada por DADOS_BRUTOS_DIR."""
    pasta_externa = os.getenv("DADOS_BRUTOS_DIR")
    candidatos = [RAW / nome, RAIZ / nome]
    if pasta_externa:
        candidatos.insert(0, Path(pasta_externa) / nome)
    for caminho in candidatos:
        if caminho.exists():
            return caminho
    destino_padrao = RAW if not pasta_externa else Path(pasta_externa)
    raise FileNotFoundError(
        f"Arquivo não encontrado: {destino_padrao / nome}. "
        "Coloque as bases em data/raw ou defina DADOS_BRUTOS_DIR."
    )


def valor_json(valor):
    if pd.isna(valor):
        return None
    return valor.item() if hasattr(valor, "item") else valor


def ler_comercio(arquivo: Path, tipo: str) -> pd.DataFrame:
    df = pd.read_csv(arquivo, sep=";", low_memory=False).rename(columns={
        "CO_ANO": "ano", "CO_MES": "mes", "CO_NCM": "ncm",
        "KG_LIQUIDO": "kg_liquido", "VL_FOB": "valor_fob",
    })
    esperadas = {"ano", "mes", "ncm", "kg_liquido", "valor_fob"}
    if faltantes := esperadas.difference(df.columns):
        raise ValueError(f"{arquivo.name}: colunas MDIC ausentes: {sorted(faltantes)}")
    df["ncm"] = df["ncm"].astype("string").str.zfill(8)
    df["ano"] = pd.to_numeric(df["ano"], errors="coerce")
    df["mes"] = pd.to_numeric(df["mes"], errors="coerce")
    prefixos = tuple(prefixo for _, prefixo in COMMODITIES.values())
    df = df[df["ano"].between(ANO_INICIAL, ANO_FINAL) & df["mes"].between(1, 12)]
    df = df[df["ncm"].str.startswith(prefixos)].copy()
    df["tipo_operacao"] = tipo
    return df[["ano", "mes", "tipo_operacao", "ncm", "valor_fob", "kg_liquido"]]


def salvar(destino: Path, conteudo: dict) -> None:
    destino.write_text(json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Gerado: {destino.relative_to(RAIZ)}")


def salvar_commodity(nome: str, produto: str, prefixo: str, dados: pd.DataFrame, periodo: str) -> None:
    """Salva uma parte de uma commodity sem agregar ou descartar registros."""
    serie = [{
        "ano": int(l.ano), "mes": int(l.mes), "tipo_operacao": l.tipo_operacao,
        "ncm": str(l.ncm), "valor_fob": valor_json(l.valor_fob),
        "kg_liquido": valor_json(l.kg_liquido),
    } for l in dados.itertuples(index=False)]
    salvar(PROCESSADOS / f"{nome}.json", {
        "produto": produto, "ncm_prefixo": prefixo, "periodo": periodo,
        "fonte": "MDIC - Estatísticas de Comércio Exterior (base de dados bruta)",
        "unidades": {"valor_fob": "US$", "kg_liquido": "kg"}, "serie": serie,
    })


def gerar_commodities(comercio: pd.DataFrame) -> None:
    """Gera os três JSONs que cabem em um único arquivo do GitHub."""
    for nome, (produto, prefixo) in COMMODITIES.items():
        if nome != "maquinas":
            salvar_commodity(nome, produto, prefixo, comercio[comercio["ncm"].str.startswith(prefixo)],
                             f"{ANO_INICIAL}-{ANO_FINAL}")


def gerar_dolar() -> None:
    dados = json.loads(origem("Cotação do Dólar por período.json").read_text(encoding="utf-8"))
    df = pd.DataFrame(dados.get("value", dados) if isinstance(dados, dict) else dados)
    df["data"] = pd.to_datetime(df["dataHoraCotacao"], errors="coerce")
    df = df.dropna(subset=["data"])
    df = df[df["data"].dt.year.between(ANO_INICIAL, ANO_FINAL)].rename(columns={
        "cotacaoCompra": "cotacao_compra", "cotacaoVenda": "cotacao_venda"})
    df[["cotacao_compra", "cotacao_venda"]] = df[["cotacao_compra", "cotacao_venda"]].apply(pd.to_numeric, errors="coerce")
    mensal = df.set_index("data")[["cotacao_compra", "cotacao_venda"]].resample("ME").mean().dropna(how="all").reset_index()
    salvar(PROCESSADOS / "dolar_mensal.json", {
        "indicador": "Cotação do dólar americano", "periodo": f"{ANO_INICIAL}-{ANO_FINAL}",
        "fonte": "Banco Central do Brasil - Dólar boletim diário", "unidade": "R$/US$",
        "agregacao": "média mensal das cotações diárias disponíveis", "serie": [
            {"ano": int(l.data.year), "mes": int(l.data.month),
             "cotacao_compra": valor_json(l.cotacao_compra), "cotacao_venda": valor_json(l.cotacao_venda)}
            for l in mensal.itertuples(index=False)],
    })


def gerar_selic() -> None:
    df = pd.read_csv(origem("selic.csv"), sep=";", decimal=",", encoding="latin1").iloc[:, :2]
    df.columns = ["data", "valor"]
    df["data"] = pd.to_datetime(df["data"], dayfirst=True, errors="coerce")
    df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
    df = df.dropna(subset=["data"])
    df = df[df["data"].dt.year.between(ANO_INICIAL, ANO_FINAL)]
    mensal = df.set_index("data")["valor"].resample("ME").mean().dropna().reset_index()
    salvar(PROCESSADOS / "selic_mensal.json", {
        "indicador": "Taxa Selic", "periodo": f"{ANO_INICIAL}-{ANO_FINAL}",
        "fonte": "Banco Central do Brasil - Taxa Selic", "unidade": "% ao ano",
        "agregacao": "média mensal dos registros disponíveis", "serie": [
            {"ano": int(l.data.year), "mes": int(l.data.month), "valor": valor_json(l.valor)}
            for l in mensal.itertuples(index=False)],
    })


def executar() -> None:
    PROCESSADOS.mkdir(parents=True, exist_ok=True)
    partes = []
    for ano in range(ANO_INICIAL, ANO_FINAL + 1):
        comercio_anual = pd.concat((
            ler_comercio(origem(f"IMP_{ano}.csv"), "IMPORTACAO"),
            ler_comercio(origem(f"EXP_{ano}.csv"), "EXPORTACAO"),
        ), ignore_index=True)
        produto, prefixo = COMMODITIES["maquinas"]
        salvar_commodity(f"maquinas_{ano}", produto, prefixo,
                         comercio_anual[comercio_anual["ncm"].str.startswith(prefixo)], str(ano))
        partes.append(comercio_anual[~comercio_anual["ncm"].str.startswith(prefixo)])
    gerar_commodities(pd.concat(partes, ignore_index=True))
    gerar_dolar()
    gerar_selic()
    print("\nPUBLICAÇÃO JSON FINALIZADA COM SUCESSO")


if __name__ == "__main__":
    executar()
