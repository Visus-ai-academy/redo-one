# Fase 5 (faturamento): próxima fatia fora das dúvidas em aberto

Data: 24/11/2026. Pesquisa só de leitura: código do dashboards-one, banco do dashboards-one (`LEGADO_DATABASE_URL`, `begin read only`) e o banco local do redo-one (para comparar). Nada foi editado.

Dúvidas em aberto que a fatia **não** pode depender delas:
1. franquia × excedente;
2. preço novo vale na competência atual ou na próxima (vigência);
3. laudo de médico sem cadastro segura o faturamento?;
4. tomografia NEURO × MEDICINA INTERNA;
5. que preço o pré-pago consome.

Já feito no redo-one (faturamento): `competencias`, `cortes_competencia`, `clientes_dados_fiscais`, telas de Competências, corte e Dados de faturamento. Os laudos já chegam com `cliente_id` (o **principal**), `modalidade_id`, `especialidade_id` (a do exame do catálogo), `categoria_id`, `prioridade_id` e `medico_id` resolvidos.

---

## Recomendação

**Fazer a tipificação (A).** Ela não depende de nenhuma das 5 dúvidas (conferido com os dados, ver A.6), é pré-requisito do demonstrativo (diz se o laudo fatura) e do filtro CO/NC/NC1 da Volumetria, tem pouca configuração para migrar (3 regras, 6 sub-regras, 213 empresas, 31 com sub-regras, 5 com ordem personalizada, 2 grupos) e dá para conferir **laudo a laudo**: o dashboards-one grava a tipificação em cada laudo (`laudos.tipificacaoRegra`/`tipificacaoSubregra`), então um teste de paridade compara os ~40 mil laudos de outubro pela chave natural.

Preços (B) vêm logo depois: o modelo e a busca do preço não dependem da vigência, mas a tela de edição depende, e os dados pedem uma limpeza maior (26,6 mil linhas, 115 arranjos com dois valores diferentes). Contratos (C) ficam por último: valem pouco agora (ClickSign usada 4 vezes pelo dashboards-one), dependem da franquia (carência) e de uma decisão sobre o painelgestao.

---

## A. Tipificação

### A.1 Como o dashboards-one faz

Arquivos: `src/lib/services/classificacao.ts` (motor), `src/lib/services/laudosFaturaveis.ts` (uso no cálculo), `src/components/configuracoes/regras/*` (tela "Tabela de regras"), `prisma/schema.prisma` (models `RegraCategoria`, `SubRegra`, `ClienteRegra`, `ClienteSubRegra`, `ClienteRegraOrdem`, `GrupoMedico`).

- **Materializada no laudo.** O motor grava `tipificacaoRegra`/`tipificacaoSubregra` em `laudos` com um `UPDATE ... CASE` por empresa. Roda depois de cada importação (`classificarEmpresas`), ao salvar as regras de um cliente (`reclassificarEmpresa`), numa "autocura" (`garantirClassificacao`) e com trava de processo para não rodar em paralelo.
- **Chave por texto.** Tudo é por `empresa` (o nome cru do laudo), não pelo id do cliente.
- **Cliente sem configuração = CO** (constante `REGRA_PADRAO`).
- **Dois modos de precedência:**
  - *Fixa* (padrão): Plantão (prioridade) › especialidade com médico específico (apenas/exceto) › especialidade (todos) › modalidade com médico › modalidade (todos) › "todos os demais" (catch-all) › regra principal sem sub-regra. A primeira que casa vence.
  - *Personalizada* (`ClienteRegraOrdem.personalizada`): lista de linhas `{tipo, valores, filtro{modo, medicos, grupos}, subRegraId}` avaliadas na ordem salva, como o Excel do painelgestao.
- **Critérios contra o dado cru do laudo:** `especialidade` (com o agrupamento `ESPECIALIDADE_AGRUPAMENTO`: ONCO MEDICINA INTERNA → MEDICINA INTERNA, CARDIO COM SCORE → CARDIO etc.), `modalidade` (RX → DX, CR), `prioridade` como chega ("Plantão") e `medico` pelo nome normalizado (+ apelidos; grupos expandem para os membros e os apelidos deles). Modo `exceto` casa também com laudo sem médico.
- **Fatura ou não.** `laudosFaturaveis.ts:403`: com sub-regra vale `SubRegra.fatura`; sem sub-regra, só NC não fatura. No banco **só NC-NF tem `fatura = false`**. `repassa` não é lido em lugar nenhum (morto). `categorias` não é usado (o laudo do legado não tem categoria).
- Médico sem cadastro **não** segura a cobrança (comentário em `laudosFaturaveis.ts:476`).

### A.2 Significado (o que o código, os comentários e a decisão do cortex dizem)

- Decisão de 16/11 (cortex `01a1e521`): CO = clínica consolidada; NC = não consolidada; NC1 = não consolidada dos sócios (Jhon/Sandra). Em aberto: o que significam FT/NF e se ALIS-MED, CLINICA_ANALISE e TOMOVALE `_DIAGNOSTICA` são mesmo dos sócios.
- O código sugere que FT = fatura e NF = não fatura, **mas os dados não batem**: CO-NF e NC1-NF têm `fatura = true` (allowlist herdada do painelgestao, comentário "CO-FT/NC1-NF do antigo — ambos na allowlist"). Só o NC-NF deixa de faturar.
- `Contrato.tipoFaturamento` repete a tipificação em texto (191 CO-FT, 20 NC-FT, 7 NC-NF, 5 NC1-FT, 1 NC1-NF, 1 CO-NF), mas o motor não lê esse campo.

### A.3 Números (dashboards-one, hoje)

| Item | Quantidade |
| --- | --- |
| Regras | 3 (NC, CO, NC1), sem descrição |
| Sub-regras | 6: CO-FT, CO-NF, NC-FT, NC-NF, NC1-FT, NC1-NF (sem critério padrão) |
| Empresas com regra principal | 213 (182 CO, 20 NC, 11 NC1); 20 NC têm também CO como regra secundária (sem efeito no motor) |
| Empresas com sub-regras | 31 (58 linhas; 31 catch-all) |
| Ordem personalizada | 5 ativas (CEDI_RJ, CEDI_RO, CEDI_UNIMED, RADI_IMAGEM, RADMED) + 11 `_DIAGNOSTICA` desligadas e vazias |
| Grupos de médicos | 2: "Equipe 2" (28) e "Neurologistas" (45). Só **uma** linha usa grupo (RADI_IMAGEM: MSK/COLUNAS "apenas Equipe 2" → NC-FT) |
| Filtros por médico | 16 sub-regras e 5 ordens; quase sempre "Rodrigo Vaz de Lima" (MEDICINA INTERNA apenas ele → NC-NF; exceto ele → CO-FT). 967 laudos dele em outubro |
| Outubro/2026 | CO sem sub 29.876 laudos; CO-FT 876; NC-FT 4.458; NC-NF 4.946 (5.740 de volume, não fatura); NC1-FT 9; NC1-NF 209; sem tipificação 0 |

Padrão que se repete em ~20 clientes NC: Plantão + RX/MG/OT + CARDIO (+ MEDICINA INTERNA exceto Rodrigo) → CO-FT; o resto → NC-FT ou NC-NF (catch-all).

### A.4 Casos de borda achados

1. **Unidade com tipificação diferente do principal.** No redo-one `laudos.cliente_id` é o principal. CEDI_RJ, CEDI_RO e CEDI_UNIMED são unidades do CEDIDIAG e têm NC com sub-regras e ordem; o CEDIDIAG é CO (padrão). Das 42 unidades, 24 têm configuração diferente da do principal (as outras 21 são PRN TELE_* com "CO" explícito, igual ao padrão). Então a tipificação precisa ser **por unidade** (resolver `empresa_origem` pela unidade, `montarResolvedorUnidadeCliente`), não por `laudos.cliente_id`.
2. **Critério cru × critério resolvido.** O legado casa a especialidade crua; o redo-one guarda a do catálogo. Nos clientes com sub-regras, em outubro, 2.569 de 10.210 laudos divergem: COLUNAS → MUSCULO ESQUELETICO (2.290), MAMO → MAMA (134), ONCO MEDICINA INTERNA → MEDICINA INTERNA (113) e CARDIO COM SCORE → CARDIO (32). Os dois últimos o legado já agrupa. COLUNAS e MAMO não: na RADI_IMAGEM COLUNAS hoje sai NC-FT 31 e NC-NF 17. Com a especialidade resolvida as regras que citam MSK e COLUNAS continuam cobrindo esses laudos, mas **só o teste de paridade garante**. Prioridade: o legado compara "Plantão" cru e o redo-one tem `prioridade_id` pelo de-para.
3. **Médico por nome × por id.** O legado casa nome normalizado + apelidos; o redo-one tem `medico_id` (conta MobileMed e apelidos). Laudo sem médico resolvido: "apenas" nunca casa e "exceto" sempre casa, como no legado.
4. **Duas grafias do mesmo cliente com configurações diferentes:** RADI_IMAGEM (com ordem e grupo) × RADI-IMAGEM (sem ordem e sem COLUNAS). Em set/out só a primeira teve laudos, mas a migração tem que escolher uma.
5. A regra principal secundária (CO nas 20 NC) e as 11 ordens `_DIAGNOSTICA` vazias não fazem nada: não migram.
6. Uma **mudança de regra reclassifica tudo**, inclusive competências fechadas (`reclassificarEmpresa` não olha o fechamento). O `laudosFaturaveis` protege o demonstrativo fechado, mas a Volumetria muda.

### A.5 O que o redo-one precisaria

**Tabelas** (`faturamento`, alinhadas ao `redesenho-banco.md` §2.7, simplificadas):
- `regras_tipificacao` (nome, descrição, cor, ordem, ativo).
- `subregras_tipificacao` (regra_id, nome, descrição, **fatura**, ordem, ativo). `repassa` e `categorias` saem.
- `grupos_medicos` + `grupos_medicos_membros` (FK `medicos`). Decisão de 14/11: entram com o faturamento.
- `clientes_tipificacao` (cliente_id **da unidade ou do cliente**, regra principal).
- `clientes_tipificacao_linhas` (cliente_id, ordem, tipo `modalidade|especialidade|prioridade|demais`, subregra_id, modo de médico `todos|apenas|exceto`) + filhas com FK: modalidades, especialidades, prioridades, médicos, grupos. **Um modo só** (lista ordenada): a precedência fixa do legado vira linhas na mesma ordem na migração, e a tela tem um único jeito de ler a regra.
- `classificacoes_laudo` (laudo_id, regra_id, subregra_id, fatura, calculado_em), ou colunas no laudo. O mapa de migração já previa "reclassificar, não copiar".
- Auditoria em todas as mudanças de configuração.

**Mecanismo:** função pura `classificar(laudo, configDoCliente)` (domínio, TDD com os casos acima); classificação na importação (mesma transação) e reclassificação das competências **abertas** por job (graphile-worker) quando a configuração muda; competência fechada não muda (como no corte). Carga pelo `migrar:legado` resolvendo empresa → cliente (as 213 casam com clientes do redo-one) e nomes de médico → `medicos`. Teste de paridade com set/out: cada laudo do redo-one × `tipificacaoSubregra` do legado pela chave natural, com a lista das divergências.

**Telas que o usuário veria:**
1. **Configurações › Faturamento › Tipificação.** Lista das regras (CO, NC, NC1 com cor e descrição) e das sub-regras de cada uma, com a chave "Fatura" (hoje só NC-NF desligada) e o número de clientes que usam.
2. **Configurações › Catálogo › Grupos de médicos.** Nome, descrição e membros (como Equipes médicas). Hoje são 2.
3. **Painel do cliente › aba Faturamento › seção Tipificação.** Regra principal (select CO/NC/NC1; sem nada = CO) e a lista ordenada de linhas: "Se *especialidade* for *MEDICINA INTERNA* e o médico for *apenas Rodrigo Vaz de Lima* → *NC-NF*", com arrastar para reordenar, "Todos os demais → NC-FT" fixo no fim e o aviso "vale a primeira linha que casar". Na unidade aparece a configuração dela (CEDI_RJ), não a do principal.
4. **Prévia** na mesma seção: laudos e volume da competência aberta em cada sub-regra, e quantos deixam de faturar, antes e depois de salvar.
5. A competência (Faturamento › Competências) pode mostrar o volume que fatura e o que não fatura (NC-NF).

### A.6 Por que não depende das dúvidas

- Vigência, franquia e pré-pago: a tipificação não lê preço, franquia nem saldo.
- Médico sem cadastro: o "segura ou não" é regra do demonstrativo. Na tipificação, laudo sem médico já tem comportamento definido (exceto casa, apenas não casa).
- Tomografia NEURO × MEDICINA INTERNA: de ago a out os laudos com especialidade TOMOGRAFIA (68 + 50 + 17) são só de unidades DIAGNOSTICA PLANTAO_*, que são CO sem sub-regra. Qualquer resposta mantém a tipificação deles.

### A.7 Riscos e tamanho

- Risco principal: divergência por critério cru × resolvido (A.4.2) e por médico por nome × por id. O teste de paridade mitiga.
- Tamanho: **médio**, em 3 passos com commit:
  1. tabelas, carga do legado e grupos de médicos;
  2. motor puro, classificação na importação, job de reclassificação e paridade;
  3. telas (regras e sub-regras, grupos, aba do cliente com prévia).

### A.8 Perguntas só para o usuário ou o financeiro

1. **NC1-NF fatura?** No legado sim (209 laudos em outubro: CLINICA_TUPA 170, IRAD 36, SANTA_CASA_TUPA_CENTRO 3). O nome sugere "não fatura". E CO-NF (fatura = true, 0 laudos, 1 contrato) pode sair?
2. **Mudança de regra muda competência fechada?** Recomendação: não. Só as abertas são reclassificadas, como no corte.
3. **Configuração por unidade:** CEDI_RJ/RO/UNIMED (NC) são unidades do CEDIDIAG (CO). Manter por unidade? Recomendação: sim.
4. RADI_IMAGEM × RADI-IMAGEM: qual configuração vale? Recomendação: a da RADI_IMAGEM, que tem laudos.
5. Ainda em aberto, mas não bloqueia (é dado editável): o significado de FT/NF e se os `_DIAGNOSTICA` são dos sócios.
6. Grupos de médicos × Equipes: a decisão de 14/11 deixa separados. "Neurologistas" (45) repete a marca de neurologista do médico. Manter o grupo?

---

## B. Preços do cliente

### B.1 Como o dashboards-one faz

Arquivos: `src/lib/services/faturamento.ts` (`buscarPreco`, `criarPrecificador`/`resolverRpc`, linhas 107–556), `src/lib/services/precos.ts` (tela e versionamento), `components/clientes/PrecosClienteDialog.tsx`, `components/precos/TabelaPrecosManager.tsx`.

- **Arranjo de preço** = modalidade de preço (RX/DO/MG/CT/MR) + especialidade + categoria (padrão SC) + prioridade (padrão ROTINA) + faixa de volume (`volumeInicial..volumeFinal`) e `condVolume` (MOD, MOD/ESP, MOD/ESP/CAT, TOTAL: em que dimensão o volume é somado). O volume da faixa soma **sem filtrar a tipificação**, por cliente (membro do grupo), com mínimo 1.
- **Busca em cascata:**
  1. preços pelo id do dono;
  2. pelo nome fantasia;
  3. pelo nome fantasia do parâmetro;
  4. pelo nome limpo do grupo;
  5. pelos "donos" declarados pelos parâmetros.

  Depois vêm o fallback de prioridade PLANTÃO ↔ URGÊNCIA, o "último recurso" (qualquer faixa > 0 do arranjo, a menor faixa primeiro) e, por fim, a **tabela padrão do contratado** (F062). Sem preço o laudo sai a R$ 0 e entra em "preços não cadastrados". O ajuste manual (`valorUnitarioFaturamento`) vence tudo.
- **Vigência** por competência "YYYY-MM" (`vigenciaDesde`/`vigenciaAte`, null = aberta). O comentário do schema diz "alteração só vale na próxima", mas o código (`salvarPrecosCliente`, regra de 14/08/2026) aplica o valor novo na **competência atual inteira**. É a dúvida 2.
- Antes do preço vêm as transformações de especialidade (MG → MAMO, arranjo anatômico, COLUNAS × neurologista, normalização da RPC). Uma parte depende da dúvida 4 (TOMOGRAFIA → NEURO em `ESPECIALIDADE_AGRUPAMENTO`).

### B.2 Números

| Item | Quantidade |
| --- | --- |
| `precos_servicos` | 26.645 linhas (25.728 ativas), 218 clientes, todas com `clienteId` |
| Com vigência preenchida | só 8 (4 fechadas em 2026-10, 4 desde 2026-11): na prática **não há histórico** |
| Faixas | todas as linhas têm faixa, mas quase todas são sentinelas (1–2147483647, 1–999999, 1–9999999, 1–99999999, 0–999999). Faixa real em 33 clientes; 428 linhas 0–0 (só casam no último recurso) |
| `condVolume` (ativas) | MOD/ESP/CAT 13.519, nulo 9.988, TOTAL 1.813, MOD 312, MOD/ESP 96 |
| Prioridade (ativas) | ROTINA 8.867, URGÊNCIA 8.707, PLANTÃO 8.112, CONVÊNIO 42 |
| Duplicadas | 1.629 grupos de arranjo + faixa repetidos; **115 com valores diferentes** (ex.: IMEDIATA_SAUDE_SUS_TELE CT CARDIO SC URGÊNCIA 336 × 120). O legado pega um deles sem critério |
| Sujeira | categorias minúsculas ('oit', 'sc'); 7 clientes com `clienteNome` diferente do cadastro |
| Campos sem efeito no cálculo | `tipoPreco` (padrao 15.891 / especial 10.422), `aplicarIncremental`/`aplicarLegado` (quase tudo true), `linhaArquivo`, `consideraPrioridadePlantao`; `origemReferencialId` em 1.761 |
| Tabela padrão | 252 linhas, 2 contratados, sem faixa |
| Clientes ativos sem preço | 85 de 298 |

### B.3 O que o redo-one precisaria

- `precos_cliente` (cliente_id, FKs de modalidade/especialidade/categoria/prioridade, valor, faixa opcional sem sentinela, `cond_volume` enum, `vigencia_desde`/`vigencia_ate` como competência, incluir no PDF?) e `precos_padrao_contratado`.
- Busca: cliente → (unidade ou principal?) → fallback de prioridade → menor faixa → tabela padrão do contratado. A cascata por nome sai, porque tudo vira FK.
- Telas: aba **Preços** no painel do cliente (tabela por arranjo com busca, incluir/editar/excluir, importar/exportar planilha, aviso de duplicado) e **Configurações › Tabela padrão** por contratado.

### B.4 O que a dúvida bloqueia e o que não

- **Não bloqueia:** o modelo com vigência por competência, a carga (só as linhas vigentes, já que quase não há histórico), a busca, a tabela padrão, uma tela de **consulta** e a limpeza dos 115 conflitos.
- **Bloqueia:** o "salvar" da tela, porque a versão nova nasce na competência atual ou na próxima (dúvida 2). Também o arranjo dos laudos TOMOGRAFIA (dúvida 4, só nos DIAGNOSTICA PLANTAO_*) e o preço que o pré-pago consome (dúvida 5, só no `credito-pre-pago`).
- Tamanho: **médio-grande**. Risco: diferença de centavos com o legado por causa da cascata por nome e das duplicadas.
- Perguntas próprias: a unidade usa a tabela dela ou a do principal (no CEDIM o legado cobra por membro)? Qual dos valores duplicados vale (115 casos)? O que é preço "padrao" × "especial"?

---

## C. Contratos

### C.1 Como o dashboards-one faz

Arquivos: `src/lib/services/contratos.ts`, `documentosContrato.ts`, `avisoContratoAssinado.ts`, `src/lib/integrations/clicksign.ts`, `src/app/api/clicksign/webhook/route.ts`.

Fluxo:
1. Criar o contrato (copia os preços com `incluiNoPdf` para `servicosContratados` em JSON).
2. Gerar o .docx de um modelo com placeholders.
3. Aprovar ou rejeitar o PDF.
4. Enviar à ClickSign (valida nome e sobrenome e o e-mail dos signatários; o prazo é de 30 dias).
5. O webhook com HMAC atualiza os signatários, busca o documento assinado e manda o e-mail de aviso.

### C.2 Números

- 225 contratos, um por cliente, todos com `clienteId`. 215 importados do painelgestao em ago/2026 e só 10 criados depois.
- Situação bagunçada: `status` A/Ativo/ativo/I/C; `statusAssinatura` assinado 151, pendente_assinatura 57, pendente 13, em_elaboracao 3, "Assinado" 2.
- ClickSign pouco usada: `clicksignDocumentKey` em 4, `urlDocumentoAssinado` em 5, `enviadoAssinaturaEm` em 35 (a maior parte importada).
- JSON em texto: `configuracoesFranquia` e `tabelaPrecos` em 221 (cópia dos preços da criação), `faixasVolume` em 9, `servicosContratados` em 13. `descontoPercentual`/`percentualIss` em 221, mas sem efeito (só vale o parâmetro de faturamento).
- Sem uso: `franquiaCarenciaDias` (0 preenchidos), `volumeEstimado` (0), `dataCancelamento` (0). `tipoFaturamento` repete a tipificação.
- 16 modelos de documento (.docx).

### C.3 O que o redo-one precisaria, dependências e bloqueios

- Tabelas `contratos`, `contratos_signatarios`, `contratos_documentos`, `contratos_partes` (representante e testemunha, LGPD), `modelos_documento` + cópia dos arquivos para o S3, credenciais e webhook da ClickSign, e e-mails.
- Telas: lista de contratos (vigência, assinatura), detalhe com o estado da ClickSign, gerar, aprovar e enviar, e modelos.
- **Bloqueios:**
  - a carência e a configuração da franquia ficam no contrato (dúvida 1);
  - a lista de serviços e preços do documento vem dos preços (B) e da vigência (dúvida 2);
  - falta decidir com o usuário o painelgestao × One (onde se cadastra e qual numeração vale; melhorias §11).
- Tamanho: **grande**, com integração externa. Valor imediato baixo.

---

## Resumo da escolha

| | A Tipificação | B Preços | C Contratos |
| --- | --- | --- | --- |
| Depende das 5 dúvidas | Não | Em parte (salvar; tomografia) | Sim (franquia, preços) |
| Pré-requisito do demonstrativo | Sim (fatura ou não) | Sim (valor) | Não |
| Dados a migrar | Poucos e limpos | 26 mil linhas com conflitos | 225 com situação bagunçada + arquivos |
| Conferência com o legado | Laudo a laudo (materializado) | Por demonstrativo | — |
| Tamanho | Médio | Médio-grande | Grande |

**Próxima fatia: tipificação.** Perguntas para o usuário ou o financeiro: A.8, itens 1 a 4 (o 5 e o 6 não bloqueiam).
