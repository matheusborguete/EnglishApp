# Atribuição de Matrículas a Canais e Campanhas

Aplicação web local (MVP) para **reconstruir a jornada de cada lead até a
matrícula** e **distribuir 100% do crédito** entre os pontos de contato
(touchpoints), consolidando os resultados por canal, plataforma, campanha,
tipo de campanha, curso e período.

> ⚠️ Os pesos iniciais **não são verdade estatística**. São parâmetros
> experimentais e configuráveis. O objetivo do MVP é permitir **testar
> modelos de atribuição**, **auditar cada matrícula** e **comparar a
> eficiência relativa** dos canais e tipos de campanha.

---

## 1. Como executar

```bash
cd attribution_app
python3 -m venv .venv && source .venv/bin/activate      # opcional
pip install -r requirements.txt

# (opcional) gerar/atualizar os arquivos de exemplo
python -m core.sample_data

# rodar a aplicação
streamlit run app.py
```

A aplicação abre no navegador (por padrão em `http://localhost:8501`).
Na **Tela 1** há o botão **"⚡ Carregar dados de exemplo"** para começar
imediatamente sem upload.

### Rodar os testes

```bash
cd attribution_app
python -m pytest -q
```

---

## 2. Arquitetura

```
attribution_app/
├── app.py                 # UI Streamlit (apenas apresentação/navegação)
├── core/                  # lógica de negócio, independente da UI
│   ├── config.py          # parâmetros, modelos, colunas esperadas
│   ├── data_loader.py     # leitura/normalização de CSV e XLSX
│   ├── validation.py      # validação de esquema e qualidade
│   ├── attribution.py     # motor de atribuição (score, normalização)
│   ├── aggregation.py     # consolidações por dimensão + métricas
│   ├── database.py        # persistência em SQLite (opcional)
│   ├── exports.py         # exportação CSV/XLSX
│   └── sample_data.py     # gerador de dados fictícios
├── tests/                 # testes automatizados (pytest)
├── sample_data/           # CSVs de exemplo gerados
├── requirements.txt
└── README.md
```

**Decisão central:** a lógica vive em `core/` (funções puras que recebem e
devolvem `DataFrame`s), e a UI em `app.py`. Isso permite reaproveitar o mesmo
núcleo em uma futura **API** (FastAPI/Flask) e trocar o SQLite por um banco de
produção (Postgres) sem reescrever regras de negócio.

---

## 3. Estrutura dos arquivos de entrada

Aceita **CSV** ou **XLSX**. Nomes de coluna são normalizados
(minúsculas, espaços → `_`).

### Interações (`interactions`)
| coluna | descrição |
|---|---|
| `lead_id` | identificador do lead *(obrigatório)* |
| `interaction_id` | identificador da interação *(obrigatório)* |
| `interaction_datetime` | data/hora da interação *(obrigatório)* |
| `channel` | canal (Google Ads, Meta Ads, …) *(obrigatório)* |
| `platform` | plataforma |
| `campaign_name` | nome da campanha |
| `campaign_type` | institucional / especifica / performance / remarketing |
| `course` | curso associado |
| `click_id` | GCLID, FBCLID ou outro ID de clique |
| `cost` | custo do clique/interação |

### Matrículas (`enrollments`)
| coluna | descrição |
|---|---|
| `lead_id` | *(obrigatório)* |
| `enrollment_id` | *(obrigatório)* |
| `enrollment_datetime` | *(obrigatório)* |
| `course` | curso |
| `enrollment_value` | valor da matrícula *(obrigatório)* |

### Investimentos (`investments`)
| coluna | descrição |
|---|---|
| `period` | período mensal `YYYY-MM` |
| `channel` | *(obrigatório)* |
| `platform` | plataforma |
| `campaign_name` | campanha |
| `campaign_type` | tipo de campanha |
| `investment` | investimento no período *(obrigatório)* |

---

## 4. Regras de preparação

Para **cada matrícula**:

1. localiza todas as interações do mesmo lead;
2. considera apenas interações **anteriores** à matrícula;
3. aplica a **janela de atribuição** (padrão **180 dias**);
4. ordena cronologicamente;
5. identifica **primeiro**, **intermediários** e **último** contato;
6. conta repetições por canal e/ou campanha;
7. calcula a distância em dias até a matrícula.

Leads com **mais de uma matrícula**: cada matrícula usa apenas os touchpoints
**posteriores à matrícula anterior** e **anteriores à própria matrícula**.

---

## 5. Explicação das fórmulas

Para cada interação *i*, score bruto:

```
S_i = P_i × T_i × R_i
```

- **Peso de posição** `P_i` (configurável): primeiro `1,3`, intermediário
  `1,0`, último `1,3`; quando há uma única interação → `1,0`.
- **Peso temporal** `T_i = 0,5 ^ (d_i / h)`, com meia-vida `h` (padrão 30
  dias) e `d_i` = dias entre a interação e a matrícula.
- **Peso de repetição** `R_i = 1 / √n_i`, com `n_i` = ordem da interação
  repetida dentro do agrupamento (canal / campanha / canal+campanha).

**Normalização** (garante 100% por matrícula):

```
credito_i = S_i / Σ S
receita_atribuida_i = credito_i × valor_da_matrícula
matrícula_equivalente_i = credito_i
```

### Modelos disponíveis (comparação de cenários)
- **Linear:** todas as interações recebem o mesmo peso (`1/n`).
- **Primeiro clique / Último clique:** 100% ao primeiro/último touchpoint.
- **Posição (U):** apenas `P_i`.
- **Decaimento temporal:** apenas `T_i`.
- **Completo proposto:** `P_i × T_i × R_i`.

### Consolidação — métricas por agrupamento
- investimento, touchpoints, leads impactados, matrículas em que participou,
  matrículas equivalentes atribuídas, receita atribuída;
- **CPA atribuído** = `investimento / matrículas equivalentes`;
- **ROAS atribuído** = `receita atribuída / investimento`;
- **% das jornadas** em que o grupo iniciou / apareceu no meio / finalizou.

Divisões por zero são tratadas como valor indefinido (não geram infinito).

---

## 6. Validações automatizadas

Os testes em `tests/` garantem que:

1. cada matrícula distribui **exatamente 100%** do crédito;
2. **nenhuma** interação posterior à matrícula é usada;
3. **nenhuma** interação fora da janela é usada;
4. matrículas **sem touchpoints** são identificadas;
5. investimentos **sem correspondência** são sinalizados;
6. o modelo **não duplica** matrículas nem receita;
7. a receita atribuída total **iguala** a receita das matrículas com
   touchpoints;
8. filtros e agregações **não alteram** os totais.

---

## 7. Telas da aplicação

1. **Importação** — upload, validação de colunas, erros, prévia, resumo.
2. **Configuração** — parâmetros editáveis + explicação + processar.
3. **Jornada individual** — busca por `lead_id`/`enrollment_id`, linha do
   tempo com pesos e crédito (mostra soma = 100%).
4. **Resultado por canal** — tabela e gráficos.
5. **Resultado por campanha** — por campanha, tipo, curso e mês.
6. **Comparação de modelos** — linear × último clique × completo, etc.
7. **Exportação** — CSV individual e XLSX consolidado (todas as abas).

---

## 8. Limitações do modelo (MVP)

- Os pesos são **heurísticos e experimentais**, não calibrados
  estatisticamente. Não substituem modelos causais (ex.: testes
  incrementais / geo-experimentos / Shapley / Markov).
- Depende da **qualidade da identificação do lead** (mesmo `lead_id` entre
  interações e matrículas). Cross-device e perda de `click_id` não são
  tratados.
- O casamento de **investimento** é por chave textual
  (`channel/platform/campaign_name/campaign_type/period`); divergências de
  nomenclatura entre plataformas exigem padronização prévia.
- Investimento por **curso** não existe na entrada, portanto CPA/ROAS por
  curso ficam indisponíveis (só receita/atribuição).
- Matrículas **sem touchpoint** na janela recebem 0% distribuído (ficam
  listadas à parte) — não há crédito "direto/desconhecido" modelado.
- SQLite e execução local: adequado a volumes moderados; produção exige
  banco/serviço dedicados.
```
