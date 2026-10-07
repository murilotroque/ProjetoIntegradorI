import pandas as pd
import json
import os
from sqlalchemy import create_engine

usuario = os.getenv("DB_USER")
senha = os.getenv("DB_PASS")
host = os.getenv("DB_HOST", "localhost")

engine = create_engine(f"mysql+mysqlconnector://{usuario}:{senha}@{host}/economia_db")

# FUNÇÃO COMÉRCIO EXTERIOR
def carregar_comercio(arquivo, tipo):

    df = pd.read_csv(arquivo, sep=";", low_memory=False)

    df["tipo_operacao"] = tipo

    df = df.rename(columns={
        "CO_ANO": "ano",
        "CO_MES": "mes",
        "CO_NCM": "id_ncm",
        "CO_PAIS": "id_pais",
        "CO_VIA": "id_via",
        "KG_LIQUIDO": "kg_liquido",
        "VL_FOB": "valor_fob"
    })

    # transformar NCM
    df["id_ncm"] = df["id_ncm"].astype(str)

    # FILTRO APENAS DOS PRODUTOS
    df = df[
        (df["id_ncm"].str.startswith("2601")) |  # menerio de ferro
        (df["id_ncm"].str.startswith("12")) |  # soja
        (df["id_ncm"].str.startswith("27")) |  # petróleo
        (df["id_ncm"].str.startswith("84"))    # máquinas
    ]

    df = df[[
        "ano",
        "mes",
        "id_ncm",
        "id_pais",
        "id_via",
        "kg_liquido",
        "valor_fob",
        "tipo_operacao"
    ]]

    df.to_sql("fato_comercio", engine, if_exists="append", index=False)

    print(f"{tipo} {arquivo} carregado!")


# IMPORTAÇÃO E EXPORTAÇÃO

carregar_comercio("IMP_2018.csv", "IMPORTACAO")
carregar_comercio("EXP_2018.csv", "EXPORTACAO")

carregar_comercio("IMP_2019.csv", "IMPORTACAO")
carregar_comercio("EXP_2019.csv", "EXPORTACAO")

carregar_comercio("IMP_2020.csv", "IMPORTACAO")
carregar_comercio("EXP_2020.csv", "EXPORTACAO")

carregar_comercio("IMP_2021.csv", "IMPORTACAO")
carregar_comercio("EXP_2021.csv", "EXPORTACAO")

carregar_comercio("IMP_2022.csv", "IMPORTACAO")
carregar_comercio("EXP_2022.csv", "EXPORTACAO")

carregar_comercio("IMP_2023.csv", "IMPORTACAO")
carregar_comercio("EXP_2023.csv", "EXPORTACAO")

carregar_comercio("IMP_2024.csv", "IMPORTACAO")
carregar_comercio("EXP_2024.csv", "EXPORTACAO")

carregar_comercio("IMP_2025.csv", "IMPORTACAO")
carregar_comercio("EXP_2025.csv", "EXPORTACAO")


# DÓLAR
with open("Cotação do Dólar por período.json", "r", encoding="utf-8") as f:
    dados = json.load(f)

if "value" in dados:
    df_dolar = pd.DataFrame(dados["value"])
else:
    df_dolar = pd.DataFrame(dados)

df_dolar["data_cotacao"] = pd.to_datetime(
    df_dolar.get("dataHoraCotacao"),
    errors="coerce"
)

df_dolar["ano"] = df_dolar["data_cotacao"].dt.year

df_dolar = df_dolar[(df_dolar["ano"] >= 2018) & (df_dolar["ano"] <= 2025)]

df_dolar = df_dolar.rename(columns={
    "cotacaoCompra": "cotacao_compra",
    "cotacaoVenda": "cotacao_venda"
})

df_dolar = df_dolar[[
    "data_cotacao",
    "cotacao_compra",
    "cotacao_venda"
]]

df_dolar.to_sql("fato_dolar", engine, if_exists="append", index=False)
print("Dólar carregado!")


# SELIC
df_selic = pd.read_csv(
    "selic.csv",
    sep=";",
    decimal=",",        # trata vírgula automaticamente
    encoding="latin1"
)

df_selic = df_selic.iloc[:, :2]
df_selic.columns = ["data", "valor"]

df_selic["data"] = pd.to_datetime(
    df_selic["data"],
    dayfirst=True,
    errors="coerce"
)

df_selic = df_selic.dropna(subset=["data"])

df_selic["ano"] = df_selic["data"].dt.year

df_selic = df_selic[
    (df_selic["ano"] >= 2018) &
    (df_selic["ano"] <= 2025)
]

df_selic = df_selic[["data", "valor"]]


df_selic["valor"] = df_selic["valor"].astype(float)

print(df_selic.head())
print(df_selic.dtypes)

df_selic.to_sql("fato_selic", engine, if_exists="append", index=False)

print("SELIC carregada!")


# IPCA (FORMATO HORIZONTAL)
import re

df_ipca = pd.read_excel("IPCA.xlsx", header=3)

linha_brasil = df_ipca.iloc[0]

meses = {
    "janeiro":1,"fevereiro":2,"março":3,"abril":4,"maio":5,
    "junho":6,"julho":7,"agosto":8,"setembro":9,
    "outubro":10,"novembro":11,"dezembro":12
}

registros = []

for coluna in df_ipca.columns:

    texto = str(coluna).lower()

    ano_match = re.search(r"(20\d{2})", texto)

    if ano_match:
        ano = int(ano_match.group(1))

        if 2018 <= ano <= 2022:

            for nome_mes, numero_mes in meses.items():
                if nome_mes in texto:

                    valor = linha_brasil[coluna]

                    if pd.notna(valor):
                        registros.append([ano, numero_mes, valor])

                    break

df_ipca_final = pd.DataFrame(registros, columns=["ano","mes","valor"])

df_ipca_final["valor"] = pd.to_numeric(df_ipca_final["valor"], errors="coerce")

df_ipca_final.to_sql("fato_ipca", engine, if_exists="append", index=False)

print("IPCA carregado!")


print("\nCARGA TOTAL FINALIZADA COM SUCESSO")
