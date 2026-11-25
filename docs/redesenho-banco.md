# Mapa de redesenho do banco: dashboards-one (Prisma) → redo-one (Drizzle)

> Análise só de leitura. Fontes: `dashboards-one/prisma/schema.prisma` (94 models, 3.450 linhas), `prisma/optimizations/*.sql`, `scripts/radshield-schema*.sql`, `docs/regras-de-negocio.md`, `docs/clientes-pre-pagos.md`, `docs/migracao-cadastros.md`, `refactore/revisao-telas.md` e grep em `src/` (sem `src/generated`). Referências `schema:N` = linha do `schema.prisma`; `RN:N` = linha de `docs/regras-de-negocio.md`.
> Nomes novos são **propostas** (snake_case pt-BR sem acento). Isto não é código Drizzle.

---

## 1. Resumo

| Métrica | Valor |
|---|---|
| Models legados (schema `public`) | 94 |
| + tabelas fora do Prisma (schema `radshield`) | 12 (`scripts/radshield-schema.sql`) |
| Models mantidos/renomeados/redesenhados/divididos/unificados | 85 |
| Models descartados | 9 |
| Tabelas novas propostas (destino dos 85 + tabelas novas da seção 3) | ~95 (≈ 80 de domínio + ~15 técnicas/infra; a fila de jobs e as tabelas de RadShield à parte) |

**Principais mudanças estruturais**

1. **`laudos` enxuto e por identidade natural.** Upsert pela chave `cliente_id + accession_number + dia_realizacao + estudo` (RN:82-89), sem `deleteMany` + reinserção nem diff por `hashLinha`. A linha crua (`dadosBrutos`) vai para `laudos_linhas_brutas` (ingestão, com retenção). A marca de "compartilhamento" (CRD_APOIO), que hoje é lida de dentro do JSON (`importacoes.ts:250`), vira a coluna `origem`.
2. **FKs no lugar de texto.** `empresa`, `medico`, `especialidade`, `modalidade` e `prioridade` (em `laudos`, `fila_exames`, `precos_*`, `designacoes`, `laudos_manuais`, `regras_*`) viram `*_id` dos cadastros. O texto original fica só na linha bruta, e a resolução por alias/de-para acontece na ingestão.
3. **Fim dos campos pré-calculados em `laudos`.** `semanaIso`, `anoLaudo` e `diaLaudo` saem (o bug do fuso em `optimizations/2026-09-normaliza-dia-laudo.sql` vem deles). `tatMinutos`, `atrasoMinutos` e `atrasado` passam a ser só insumo das **tabelas de totais**. A tipificação sai da tabela de laudos e vai para `classificacoes_laudo` (faturamento).
4. **Tabelas de totais pré-somados** (dia × cliente × modalidade × especialidade × prioridade [+ tipificação]), mantidas pela ingestão. Elas substituem os 16 índices de `laudos` e os `DISTINCT`/`ILIKE` dos dashboards.
5. **Snapshot da fila (`exames_pipeline`)** deixa de ser apagado e recriado a cada importação: vira `fila_exames`, com upsert pela chave do exame e `visto_no_retrato_id`. Os buckets saem da tabela e são calculados na leitura. O paciente é minimizado.
6. **Demonstrativos sem `Json` e sem `deleteMany` + `createMany`.** Ficam cabeçalho + `*_itens` (arranjo × dia) com versão por geração. O estado pós-fechamento já é separado e continua assim. O ajuste manual passa a apontar para a **chave natural do laudo**, não para `laudo.id`, e por isso sobrevive à reimportação.
7. **Um lugar para cada preço/parâmetro.** O preço de repasse do médico vive hoje em 4 lugares (`MedicoValorRepasse`, `TabelaPrecoRepasse`, `RegraApuracao.tarifa_laudo`, `Configuracao.tarifa*`, mais `Medico.adicionalValorSemDigitador`). No novo sistema, preço vigente fica em `precos_repasse` (com vigência) e referência em `tabela_referencia_repasse`. Os adicionais do médico concentram-se em `adicionais_repasse`. A ficha contratual do `Cliente` (franquia, portal, dia de faturamento etc., schema:2014-2034) é descartada: vale só `parametros_faturamento`.
8. **Aliases unificados.** `ClienteNomeAlias` + `ClienteApelido` (exato/prefixo/sufixo) viram `clientes_aliases`. `ClienteOculto` vira a coluna booleana indexada `clientes.oculto_dashboards`, e o médico oculto (hoje "Dr. Rodrigo" fixo no código, RN:162) vira `medicos.oculto_dashboards`.
9. **Identidade.** `Papel.telas` sai e `permissoes String[]` vira `papeis_permissoes` (`tela.acao`). As tabelas do next-auth (Account/Session/VerificationToken, sem uso com `strategy: "jwt"`, `src/lib/auth.ts:24`) dão lugar a `sessoes`, `convites_tokens` e `chaves_api_robo`. O escopo da gestora (arrays em `users`) vira tabela.
10. **Auditoria única.** `LogAlteracaoEscala` e os campos soltos `criadoPor`/`motivo`/`decididoPor` alimentam `eventos_auditoria`, uma tabela só para as entidades críticas.
11. **LGPD.** O paciente fica em `fila_exames`/`designacoes` (distribuição) e qualidade; em `laudos` como `paciente_chave` (HMAC, padrão já usado no RadShield) e, desde 23/11/2026 (decisão do usuário), o nome e o código em `laudos_pacientes` (1:1, à parte, leitura com `importacao.paciente.ver` e auditada), porque faturamento, pré-pago, qualidade e pendências mostram o nome. A distribuição continua sem gravar o nome. Saem sexo, solicitante e CRM do solicitante. A data de nascimento vira `paciente_idoso` (único uso: peso `evitarIdosos`, `motor.ts:780`). CPF, data de nascimento e e-mail de representantes/testemunhas vão para uma tabela própria de contratos.
12. **Arquivos em S3.** `storagePath`, `relatorioPath`, `urlDocumento*` e `boletoUrl` viram `arquivos` (chave + metadados) referenciados por id.

---

## 2. Mapeamento por contexto

Legenda de Ação: manter / renomear / unificar / dividir / redesenhar / descartar / contexto a definir.

### 2.1 identidade

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `User` | `usuarios` + `usuarios_escopos_escala` (escala) | dividir | Remove `emailVerified`, `image` e `precisaTrocarSenha` (o primeiro acesso passa a ser por convite). `role` vira papel do sistema (ADMIN/MEDICO como papéis fixos). `escopoTurnoIds`/`escopoEspecialidadeIds` (arrays sem FK) viram tabela com FK. Ganha `bloqueado_ate`, `tentativas_falhas` e `senha_alterada_em`. `documento` (CPF) recebe marca `LGPD: pessoal`. | sim: usuários ativos sem hash de senha padrão (forçar convite); vínculo `medico_id` |
| `Papel` | `papeis` + `papeis_permissoes` | redesenhar | Remove `telas` (legado, schema:99). `permissoes String[]` vira linhas `tela.acao` com FK. Mudança de permissão derruba as sessões. | sim: expandir `telas` para `permissoes` antes (regra hoje aplicada na leitura) |

### 2.2 catalogo (inclui o registro básico de Cliente)

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Modalidade` | `modalidades` | manter | `nome` vira `codigo`. Passa a ser FK em `laudos`, `exames` e `precos_*` (hoje texto). | sim |
| `Especialidade` | `especialidades` + `frentes_escala` (escala) | dividir | A coluna `modalidade` (schema:1316) faz a mesma linha servir de "escala de modalidade". Esse papel passa para `frentes_escala` (tipo especialidade\|modalidade), e `especialidades` fica catálogo puro. | sim |
| `Subespecialidade` | `subespecialidades` + `subespecialidades_especialidades` | manter | A tabela implícita do Prisma `_EspecialidadeToSubespecialidade` vira tabela explícita. Arranjos, escala e exame passam a referenciar por id (hoje por nome, schema:1365). | sim |
| `CategoriaExame` | `categorias_exame` | manter | Vira FK em `exames`, `precos_*`, `regras_quebra_exame` e `arranjos`. | sim |
| `Prioridade` | `prioridades` | manter | Ganha `ordem_exibicao` (RN:172) e `urgente boolean` (substitui `ConfiguracaoDistribuicao.prioridadesUrgentes`). | sim |
| `PrioridadeDePara` | `prioridades_de_para` | manter | `nomeFinal` texto vira `prioridade_id` FK. Usado na ingestão. | sim |
| `EspecialidadeRegra` | `especialidades_de_para` | renomear | `destino` texto vira `especialidade_id` FK. `tipo` NORMALIZACAO\|INVALIDA\|ARRANJO vira enum. | sim |
| `Exame` | `exames` | redesenhar | `modalidade`, `especialidade`, `subespecialidade`, `categoria` e `prioridade` (texto) viram FKs. `exigeRevisaoManual` fica aqui. `modoMedicos` vai para distribuição (`exames_distribuicao`). | sim |
| `RegraQuebraExame` | `regras_quebra_exame` | redesenhar | `exameOriginal`/`exameQuebrado` (texto = `Exame.nome`, que não é único, schema:2158) viram `exame_origem_id`/`exame_destino_id` FK. `categoriaQuebrada` vira FK. | sim (resolver colisões de nome à mão) |
| `ExameForaPadrao` | `exames_de_para_valores` | renomear | `chaveNormalizada` é a chave de busca na ingestão. `exameId` vira FK. | sim |
| `Cliente` | `clientes` (catalogo) + `clientes_dados_fiscais` (faturamento) + `contas_pre_pagas` (credito-pre-pago) + `clientes_distribuicao` (distribuicao) + `contratos_partes` (contratos) | dividir | Catálogo: `nome`, `nome_fantasia`, `razao_social`, `cnpj`/`cpf`, `tipo_pessoa`, `ativo`, `oculto_dashboards` (novo, indexado), `contratado_id` (emissora). Fiscal/endereço/bancário/e-mail de NF vão para faturamento. O código Omie não vem: o redo-one não fala com o Omie, e a carga do Omie na virada (saldos, títulos, cadastros) casa pelo CNPJ no financeiro do One. Representante e testemunha (CPF, nascimento) vão para contratos (LGPD). `volumeContratado*`/`volumePlantao*` vão para `contratos.volume_estimado`. Ficha contratual (schema:2020-2034) e `enriquecido` saem. `modoMedicos` vai para distribuição. | sim: identificação, fiscal, pré-pago; não: ficha contratual |
| `ClienteNomeAlias` | `clientes_aliases` | unificar | Une com `ClienteApelido`: `padrao`, `tipo` (exato\|prefixo\|sufixo\|normalizado), `cliente_id` FK (hoje `ClienteApelido.destino` é texto). Índice por `chave_normalizada`. | sim |
| `ClienteApelido` | `clientes_aliases` | unificar | Ver acima. A ordem de avaliação EXATO → PREFIXO → SUFIXO, com o padrão mais longo vencendo (schema:1708), vira regra do resolvedor na ingestão. | sim (resolver `destino` texto para id) |
| `ClienteOculto` | coluna `clientes.oculto_dashboards` | unificar | Booleano indexado no lugar de tabela por nome. As exclusões fixas de `filtrosOcultos.ts` também viram dado. | sim (casar `empresa` com cliente) |

### 2.3 medicos

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Medico` | `medicos` + `medicos_dados_pagamento` + `medicos_regras_repasse` (repasse) + `medicos_distribuicao` (distribuicao) | dividir | Cadastro: nome, `chave_normalizada`, CRM, `id_mobilemed`, contato, `ativo`, `oculto_dashboards` (novo), sênior, fellowship, função, nível, `tipo_contratacao_id`. Pagamento (LGPD: pessoal): CPF, CNPJ, Pix, sócio, `optanteSimples` (o código de fornecedor no Omie não vem; o contas a pagar é do financeiro do One). Repasse: `neurologista`, `nomeNeurologista`, `repasseSomenteAdicionais`, `repasseRestricoes` (Json vira tabela `medicos_restricoes_repasse`), `acrescimoSemDigitador`/`adicionalValorSemDigitador`. Distribuição: `distribuicaoAutomatica`, `forcarNeuro`. Saem `equipe` (texto, substituído por `equipes_membros`), `modalidades`/`especialidades`/`categorias`/`prioridades` (arrays não usados pelo motor), `tipoContratacao`/`socio` duplicados (schema:637), `contasAPagar`, `modoClientes`/`modoExames` (RN:859). | sim |
| `MedicoNomeAlias` | `medicos_aliases` | manter | `tipoOrigem` vira enum. Usado na ingestão para resolver `laudos.medico_id`. | sim |
| `Equipe` | `equipes` | manter | `plantao` permanece. | sim |
| `EquipeMembro` | `equipes_membros` | manter | Sem mudança relevante. | sim |
| `GrupoMedico` | `grupos_medicos` | manter | Usado nos filtros de tipificação. Avaliar unificação com `equipes` (ver Dúvidas). | sim |
| `GrupoMedicoMembro` | `grupos_medicos_membros` | manter | Sem mudança relevante. | sim |
| `TipoContratacao` | `tipos_contratacao` | manter | Vira FK em `medicos` (hoje picklist de texto). | sim |

### 2.4 ingestao

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Importacao` | `importacoes` | redesenhar | `storagePath` vira `arquivo_id` (S3). `importadoPorId` passa a aceitar usuário **ou** chave de robô. Ganha `job_id` e contadores `inseridas`/`atualizadas`/`inalteradas`. Deixa de existir o cascade que apagaria laudos (schema:213-215). | parcial: últimos ~100 registros para histórico; arquivos só se ainda estiverem no storage |
| `Laudo` | `laudos` + `laudos_linhas_brutas` + `classificacoes_laudo` (faturamento) | redesenhar | Chave natural única (`cliente_id`, `accession_number`, `dia_realizacao`, `estudo`) com upsert. FKs: `cliente_id`, `medico_id`, `medico_reassinatura_id`, `especialidade_id`, `modalidade_id`, `prioridade_id`, `exame_id` (resolvidos na ingestão). Ficam o texto de origem normalizado e `pendente_resolucao`. Saem `hashLinha`, `semanaIso`, `anoLaudo`, `diaLaudo`, `tipificacao*` e `dadosBrutos` (vai para `laudos_linhas_brutas`). Entra `origem` (normal\|compartilhamento). `nomePaciente` vira `paciente_chave` (HMAC) no laudo; nome e código vão para `laudos_pacientes` (23/11/2026). `digitador` e `codigoPaciente`: ver LGPD. Índices planejados pelas consultas (menos de 16). | sim: só competências **fechadas** + aberta atual (o resto vem do RPA); recalcular totais depois |
| `ExamePipeline` | `fila_exames` + `retratos_fila` | redesenhar | Upsert pela chave do exame (cliente + paciente_chave + estudo + realização) no lugar de `deleteMany`. `bucketPipeline`, `bucketSla`, `esperaMinutos` e `restanteMin` são calculados na leitura em relação a `retratos_fila.data_referencia`. Saem `sexoPaciente`, `nomeSolicitante`, `crmSolicitante`, `convenio` (só no Painel IA) e `dadosBrutos`. `aniversarioPaciente` vira `paciente_idoso`. `medico`/`empresa` viram FK. | não (estado transitório; o primeiro retrato do RPA popula) |
| `AvisoCadastro` | `pendencias_cadastro` | redesenhar | `chave` texto exata (RN:851, o "ignorar" vale só para uma grafia) passa a apontar para `alias` resolvido. `registroId` vira FK polimórfica (`tipo` + id). A decisão vai para `eventos_auditoria`. | parcial: só os `ignorado` (decisões); os pendentes são recalculados |

### 2.5 escala

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Turno` | `turnos` | manter | `tipo` vira enum (fixo\|lista). `duracaoMin` é derivada; manter só se indexada. | sim |
| `TurnoEspecialidade` | `turnos_frentes` | renomear | Passa a apontar para `frentes_escala` (especialidade **ou** modalidade). | sim |
| `AlocacaoMedico` | `alocacoes` + `alocacoes_recortes` | redesenhar | Arrays de texto (`prioridades`, `subespecialidades`, `modalidades`) viram tabela de recortes com FK. `diasSemana`/`semanasDoMes` podem continuar `int[]`. `status` sai (substituído por `ausencias`, schema:1627). `coberturaDeId` permanece. | sim: vínculos vigentes (`dataFim` nulo ou futuro) + histórico de 12 meses para o repasse de lista |
| `AjusteProdutividade` | `ajustes_produtividade` | manter | Sem mudança relevante. | parcial: últimos 90 dias |
| `AusenciaMedico` | `ausencias` + `ausencias_recortes` | redesenhar | `especialidadeIds`/`turnoIds` (arrays sem FK) viram tabela. `observacoes`/`motivoRecusa` podem conter saúde (licença): marcar `LGPD: saúde`. `solicitadaPor`/`revisadaPor` viram FK de usuário. | sim |
| `LogAlteracaoEscala` | `eventos_auditoria` (transversal) | unificar | Vira linha genérica (contexto=escala, entidade, registro, ação, antes, depois, autor). | parcial: últimos 12 meses |

### 2.6 distribuicao

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `ConfiguracaoDistribuicao` | `configuracao_distribuicao` | redesenhar | `ordemFila` (Json) vira `criterios_ordem_fila` (linhas ordenadas). `prioridadesUrgentes` sai (vai para `prioridades.urgente`). `listaPrioridades` vira FK. `roboMargemRecolhimento` (Json) vira tabela por frente. | sim |
| `RodadaDistribuicao` | `rodadas` + `rodadas_eventos` + `rodadas_filtros` | redesenhar | `eventos` (Json) vira tabela append-only. Os arrays de ids (`turnoIds`, `frentes`, `prioridades`, `clientesPrioritarios`, `medicosExcluidos`/`Incluidos`) viram tabela de filtros com FK. `insumosMotor` fica `jsonb` (retrato para reprodutibilidade). `solicitadaPorId`/`aprovadaPorId` viram FK. | parcial: últimos 90 dias (auditoria operacional) |
| `DesignacaoDistribuicao` | `designacoes` | redesenhar | Passa a referenciar `fila_exames.id` (agora estável), mantendo a chave do exame. `nomePaciente` vira `paciente_chave`, com o nome lido só da fila. `empresa`/`modalidade`/`especialidade`/`subespecialidade` viram FK. `medicoNome` fica (retrato do que foi enviado). | parcial: 90 dias; os vínculos de gratificação (`alocacaoGratificadaId`) do período aberto |
| `PoliticaDistribuicao` | `politicas_distribuicao` | redesenhar | `especialidade`/`modalidade` texto viram FK. `proporcoes`, `pesos` e `tetosSubespecialidade` (Json) viram tabelas filhas ou colunas tipadas. | sim |
| `JanelaSemAutomacao` | `janelas_sem_automacao` | manter | `modalidade`/`especialidade` texto viram FK. | sim |
| `ReforcoDistribuicao` | `reforcos` + `reforcos_medicos` | redesenhar | `medicoIds[]` vira tabela. Textos viram FK. `criadoPorId` vira FK. | parcial: só ativos |
| `ClienteMedicoVinculo` | `clientes_medicos_permitidos` | renomear | Junto com `clientes_distribuicao.modo_medicos`. | sim |
| `ExameMedicoVinculo` | `exames_medicos_permitidos` | renomear | Junto com `exames_distribuicao.modo_medicos`. | sim |
| `MedicoRegraDistribuicao` | `arranjos` + `arranjos_recortes` | unificar | Une com `EquipeRegraDistribuicao` (`dono_tipo` medico\|equipe). Arrays (`modalidades`, `subespecialidades`, `categorias`, `prioridades`, `clientes`, `exames`, `clientesExclusivos`) viram linhas de recorte com FK. Hoje `clientes`/`exames` guardam ids sem integridade (schema:1458-1462). `frenteTipo`/`frenteId` ficam. | sim |
| `EquipeRegraDistribuicao` | `arranjos` | unificar | Ver acima. | sim |
| `MedicoExcecao` | `excecoes_medico` | manter | Sem mudança relevante (já usa FK). | sim |
| `PrioridadeCliente` | `prioridades_cliente` | manter | Passa a apontar para `frentes_escala`. | sim |
| `AcompanhamentoPilhaRobo` | `acompanhamento_pilha_robo` | contexto a definir | Histórico por médico × turno. `medicoNome` sai (FK). Candidato a `operacao` ou a tabela de totais do analytics. | parcial: 90 dias |
| `CarenciaDirecionamento` | `carencias_direcionamento` | contexto a definir | Cálculo por cron: a trava `ocupadoAte` passa para o job único e os blocos para o job. Revisão de telas propõe fundir Direcionamento em Prazos (revisao-telas.md:19). | não (recalculável) |

### 2.7 faturamento

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Configuracao` | `aliquotas_impostos` (faturamento) + `tarifas_repasse` (repasse) + `destinatarios_notificacao` (credito-pre-pago) + `parametros_indicadores` (analytics/operacao) | dividir | Singleton genérico desmembrado. `faturamentoExclusaoFiscal` (nomes) vira `clientes_dados_fiscais.exclusao_fiscal boolean`. `faturamentoIntegracaoSoComVolume` vira coluna em `parametros_faturamento`. Alíquotas e pisos ganham vigência por competência. `metaSlaPct`/`metaVolumetriaTotal` saem (duplicam `MetaMensal`). `faixasListaAtraso` (Json) vira tabela. `notificacoesPrePago` (Json) vira tabela. | sim (exceto metas duplicadas) |
| `RegraCategoria` | `regras_tipificacao` | renomear | CO/NC/NC1. | sim |
| `SubRegra` | `subregras_tipificacao` + `subregras_criterios` | redesenhar | `modalidadeMedicos`/`especialidadeMedicos` (Json de chaves de nome) viram critérios com FK (modalidade/especialidade, modo, médicos/grupos). `categorias` (ignorado, RN:140) sai. `fatura`/`repassa` ficam. | sim |
| `ClienteRegra` | `clientes_tipificacao` | redesenhar | `empresa` texto vira `cliente_id` FK. | sim (resolver nome) |
| `ClienteSubRegra` | `clientes_subregras` + `clientes_subregras_criterios` | redesenhar | Igual a `SubRegra`. `empresa` vira `cliente_id`. | sim |
| `ClienteRegraOrdem` | `clientes_tipificacao.ordem_personalizada` + `clientes_subregras.ordem` | unificar | `linhas` (Json) vira a coluna `ordem` nas linhas de critério. `empresa` vira FK. | sim |
| `ClienteSplit` | `regras_divisao_cliente` | redesenhar | `origem`/`destino` (nomes) viram `cliente_origem_id`/`cliente_destino_id`. `modalidade`/`prioridade` viram FK. | sim |
| `ParametroFaturamento` | `parametros_faturamento` | redesenhar | Remove os campos que duplicam o cliente (`razaoSocial`, `cnpj`, `nomeFantasia`, `nomeMobilemed`, `clienteNome`, `numeroContrato`). `clienteId` passa a FK obrigatória. Ganha vigência por competência. Saem também os campos sem efeito (RN:300-304: adicional de urgência, reajuste, desconto, dia de faturamento) ou ficam marcados "informativo" (ver Dúvidas). Os textos `criterios*` saem. | sim: só ativos |
| `PrecoServico` | `precos_cliente` | redesenhar | `clienteNome` sai. `cliente_id` passa a obrigatório. Modalidade, especialidade, categoria e prioridade viram FK. `linhaArquivo`, `aplicarLegado` e `origemReferencialId` saem (avaliar). Vigência `YYYY-MM` vira coluna de competência tipada. | sim: só linhas vigentes + versões das competências fechadas (para reprocessar) |
| `TabelaPrecoPadrao` | `precos_padrao_contratado` | renomear | `contratadoId` vira FK. Textos viram FK. | sim |
| `DemonstrativoFaturamento` | `demonstrativos_faturamento` + `demonstrativos_faturamento_itens` + `demonstrativos_sem_preco` | redesenhar | `detalhes`, `precosNaoCadastrados` e `parametrosUtilizados` (Json) viram itens tipados (arranjo × dia × quantidade × unitário). `clienteIds[]` vira tabela de membros do grupo. Upsert por (`competencia`, `grupo`) com `versao`, sem delete + recreate. | sim: só competências **fechadas** (cabeçalho + itens). Abertas são regeradas |
| `DemonstrativoFaturamentoDia` | `demonstrativos_faturamento_itens` | unificar | Coluna `dia` nos itens. `data` (string) vira `date`. | sim, junto com o cabeçalho |
| `StatusFaturamentoCliente` | `faturamento_pos_fechamento` | redesenhar | `relatorioPath` vira `arquivo_id`. `nfDetalhes` (Json) vira colunas. `emailDestino` é dado pessoal do cliente. Chave por `demonstrativo_id` (hoje `chaveGrupo` texto). | sim: todas (marca de NF emitida evita nota em dobro) |
| `FechamentoPeriodo` | `competencias` | redesenhar | `geracaoIniciadaEm` e `ultimaTentativaEm` (lease) saem: o job único resolve. `pendencias` (Json) vira `pendencias_cadastro`. `fechadoPor`/`reabertoPor` viram FK + `eventos_auditoria`. `importacaoTravadaEm` fica. | sim |
| `LaudoManual` | `laudos_manuais` | redesenhar | `clienteNome`/`medico` (texto) viram FK. `paciente` sai ou vira `paciente_chave` (LGPD). `criadoPor` vira FK + auditoria. | sim |
| `LaudoAjuste` | `ajustes_laudo` | redesenhar | `laudoId @unique` com cascade (schema:3027-3028) é o que perde o ajuste na reimportação. Passa a usar a **chave natural do laudo**, sem cascade. Overrides viram FK. `excluir` e `motivo` ficam. | sim: todos |
| `ApuracaoBalanco` | `apuracoes_balanco` | contexto a definir | Distribuição aos sócios: `entradas` e `resultado` (Json). Não se encaixa claramente em faturamento nem em repasse. | sim |

### 2.8 repasse

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `MedicoValorRepasse` | `precos_repasse` | redesenhar | `clienteNome` vira `cliente_id` FK (nulo = todos). Textos viram FK. Saem `dataInicioVigencia`/`dataFimVigencia` (sem uso, schema:2257-2258), `estaNoEscopo` (avaliar) e `medicoNomeOriginal`. Fica a vigência por competência. | sim: vigentes + versões usadas pelas competências fechadas |
| `TabelaPrecoRepasse` | `tabela_referencia_repasse` | manter | Só referência (RN:448). `nivel` vira FK de um catálogo de níveis. Strings vazias como "qualquer" viram NULL com índice único parcial. | sim |
| `MedicoValorAdicional` | `adicionais_repasse` | redesenhar | Ponto único de adicionais: avulso, `peer_review`, `plantao` e os resultados de `regras_apuracao` (com `origem` + `regra_id`). `periodo` texto vira `competencia`. | sim |
| `RegraApuracao` | `regras_apuracao` + `regras_apuracao_recortes` | redesenhar | Arrays de texto viram recortes com FK. `tarifa_laudo` deve ser conciliada com `precos_repasse` (preço em dois lugares). `criadoPor` vira FK + auditoria. | sim |
| `ListaAtraso` | `listas_atraso` + `listas_atraso_exames` + `listas_atraso_recortes` + `listas_atraso_faixas` | redesenhar | `accessions[]` vira tabela (chave do laudo). `faixas` (Json) vira tabela. Arrays de ids/textos viram recortes com FK. | sim: competências abertas + fechadas recentes |
| `DemonstrativoRepasse` | `demonstrativos_repasse` + `demonstrativos_repasse_itens` | redesenhar | `detalhesGrupos`, `detalhesExames`, `adicionais` e `missKeys` (Json) viram itens tipados. `detalhesExames` tem paciente (fonte do PDF): o PDF passa a ser gerado de itens + `laudo_id`. `medicoId` vira FK. | sim: fechadas (sem nome de paciente nos itens) |
| `DemonstrativoRepasseDia` | `demonstrativos_repasse_itens` | unificar | Coluna `dia`. | sim, junto |
| `StatusRepasseMedico` | `repasse_pos_fechamento` | renomear | `relatorioPath` vira `arquivo_id`. A conta a pagar do médico vai para o financeiro do One (no dashboards-one era no Omie). | sim |

### 2.9 credito-pre-pago

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `MovimentoCredito` | `movimentos_credito` | redesenhar | Continua só-inserção (trigger). `paciente`, `estudo`, `medico` e `chaveExame` "por valor" viram `laudo_id` (estável com o upsert) + `paciente_chave`. Fora isso, `medico` vira FK. | sim: todos (extrato é a fonte do saldo) |
| `RecargaCredito` | `recargas_credito` | manter | `boletoUrl` vira `arquivo_id` ou o boleto do financeiro do One (Itaú); no dashboards-one vinha do Omie. `solicitadoPor` vira FK. | sim |
| `AlertaCredito` | `alertas_credito` | manter | `dados` (Json) avaliar. `resolvidoPor` vira FK. | parcial: não resolvidos + 6 meses |

### 2.10 contratos

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `Contratado` | `contratados` + `contratos_partes` | redesenhar | Empresa emissora (001/002). Representante e testemunha (CPF, data de nascimento, e-mail, telefone) vão para `contratos_partes` (LGPD). `contratadoRepasseId` (texto) vira FK auto-referência. Os códigos Omie não vêm (financeiro do One). | sim |
| `Contrato` | `contratos` + `contratos_signatarios` + `contratos_documentos` | redesenhar | Sem FK hoje (schema:2473): `clienteId`/`contratadoId` viram FK obrigatória e `clienteNome` sai. JSON em texto (`faixasVolume`, `configuracoesFranquia`, `configuracoesIntegracao`, `servicosContratados`, `tabelaPrecos`) sai: ou não é usado, ou duplica `precos_cliente`/`parametros_faturamento` (ver Dúvidas). `clicksignSignatarios` vira tabela. `urlDocumento*` vira `arquivo_id`. Campos de cálculo (`descontoPercentual`, `percentualIss`…) saem, porque só vale `parametros_faturamento` (RN:207-209). | sim: contratos + signatários + documentos (cópia para S3) |
| `ModeloDocumento` | `modelos_documento` | redesenhar | `storagePath` vira `arquivo_id`. `contratadoId` vira FK. | sim (+ cópia dos .docx para S3) |
| `ContratadoModelo` | `contratados_modelos` | manter | FKs reais. | sim |
| `ContratadoEmailNotificacao` | `contratados_destinatarios` | renomear | Avaliar unificação com `destinatarios_notificacao` (pré-pago). | sim |
| `ContratadoTemplateEmail` | `modelos_email` | renomear | Genérico por (`contratado_id`, `tipo`). | sim |
| `EmailLogContratoAssinado` | `notificacoes_enviadas` (transversal) | unificar | Log idempotente genérico de e-mails (`chave_idempotencia` única). Serve também para o pós-fechamento e o pré-pago. | parcial: 12 meses |

### 2.11 qualidade

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `ClienteQualidadeVinculo` | `clientes_service_desk` | renomear | De-para do id do Service Desk para `cliente_id`. | sim |

*Fora do Prisma (não conta nos 94):* schema `radshield` com 12 tabelas (`versoes`, `laudos_analisados`, `apontamentos`, `config_dia`, `clinicas`, `medicos_rs`, `cruzamentos`, `mapeamento`, `coletas`, `trava`, `exames_rs`, `acompanhamentos`). Proposta: trazer para o contexto qualidade com prefixo `radshield_`. Manter o HMAC do paciente com expurgo em 13 meses (`radshield-schema.sql:63`). `trava` vira job único. `medicos_rs`/`clinicas` passam a apontar para `medicos`/`clientes`.

### 2.12 analytics (só leitura) / contexto a definir

| Model legado | Destino (tabela nova) | Ação | Mudanças principais | Dados a migrar? |
|---|---|---|---|---|
| `MetaMensal` | `metas_mensais` | contexto a definir | São escritas pelo admin; o analytics é só leitura. Sugestão: `operacao` ou configuração em `qualidade`/`faturamento`. O analytics lê. | sim |
| `PainelIaSalvo` | `paineis_ia_salvos` | contexto a definir | Tem escrita (do usuário) e `conteudo` (Json da conversa). Garantir que nenhum dado de paciente seja gravado nem enviado à IA. | sim (se o Painel IA continuar) |

---

## 3. Tabelas novas (sem equivalente no legado)

| Tabela proposta | Contexto dono | Propósito |
|---|---|---|
| `totais_laudos_dia` | ingestao (escreve) / analytics (lê) | Dia (BRT) × cliente × modalidade × especialidade × prioridade [× tipificação × médico?]: volume, quantidade, atrasados, soma de TAT e de atraso. Atualizada no upsert de laudos. |
| `totais_laudos_hora` | ingestao / analytics | Mapa de calor dia-da-semana × hora (hoje calculado em UTC, RN:862). |
| `totais_fila_retrato` | ingestao / analytics | Agregado de cada retrato da fila (bucket × especialidade × prioridade) para os painéis e a série histórica do backlog. |
| `laudos_linhas_brutas` | ingestao | Linha original da planilha (jsonb) por `laudo_id` + `importacao_id`, com retenção (ex.: 90 dias). Fora da tabela principal. |
| `retratos_fila` | ingestao | Cabeçalho de cada snapshot (`data_referencia`, importação). |
| `classificacoes_laudo` | faturamento | Resultado da tipificação por laudo (regra, subregra, fatura, repassa), hoje em `laudos.tipificacao*`. |
| `competencias` | faturamento | (redesenho de `FechamentoPeriodo`) Referenciada por repasse e pré-pago. |
| `sessoes` | identidade | Sessão no banco (hash do token, usuário, expiração, IP/UA) para o cookie httpOnly. |
| `convites_tokens` | identidade | Convite de primeiro acesso e recuperação de senha (hash, expiração, uso único). |
| `tentativas_login` | identidade | Bloqueio por tentativas falhas (ou colunas em `usuarios`). |
| `chaves_api_robo` | identidade | Uma por robô (importação, distribuição, comentários): hash, permissões restritas, último uso, revogação. |
| `papeis_permissoes` | identidade | Ver 2.1. |
| `eventos_auditoria` | transversal (biblioteca comum) | Quem, quando, entidade, id, ação, antes, depois. Cobre competência, ajustes, preços, regras de apuração, crédito, escala, usuários/papéis e **acesso a dado de paciente**. |
| `arquivos` | transversal (infra) | Chave S3, bucket, tipo, tamanho, hash, dono (contexto + id), retenção. PDFs, .docx, planilhas importadas, boletos. |
| tabelas da fila de jobs | infra (biblioteca, ex.: pg-boss/graphile-worker) | Gerenciadas pela biblioteca. Substituem os leases `geracaoIniciadaEm`, `ocupadoAte`, `radshield.trava` e os crons. |
| `notificacoes_enviadas` | transversal | Log idempotente de e-mails (ver 2.10). |
| `destinatarios_notificacao` | credito-pre-pago (ou transversal) | Substitui `Configuracao.notificacoesPrePago` (Json). |
| `frentes_escala` | escala | Frente = especialidade **ou** modalidade (ver `Especialidade.modalidade`). |
| `usuarios_escopos_escala` | escala | Recorte da gestora de escala (turno/frente). |
| `medicos_restricoes_repasse` | repasse | Substitui `Medico.repasseRestricoes` (Json). |
| `lotes_antecipacao` | repasse | **Proposta:** registro dos lotes enviados à Altis (hoje nada é persistido; está pausada, RN:476-477). Ver Dúvidas. |
| `niveis_medico` | medicos | Catálogo de níveis (Nível 0–6, 1.1…) usado por `tabela_referencia_repasse` e `medicos.nivel`. |

---

## 4. Descartados

| Model legado | Motivo | Evidência |
|---|---|---|
| `Account` | Adapter do next-auth com `strategy: "jwt"`; OAuth não é usado. O novo login é próprio. | `src/lib/auth.ts:23-24`; 0 usos `prisma.account.*` fora de `src/generated` |
| `Session` | Sessão hoje é JWT; tabela vazia. Substituída por `sessoes`. | `src/lib/auth.ts:24`; 0 usos `prisma.session.*` |
| `VerificationToken` | Não usado; substituído por `convites_tokens`. | 0 usos `prisma.verificationToken.*` |
| `CategoriaMedico` | Catálogo órfão: o campo `Medico.categoria` foi removido; só existe o CRUD genérico. | migration `20260819120000_remover_categoria_medico`; uso só em `src/lib/services/catalogos.ts:502` |
| `ConfiguracaoEscala` | Gravada, mas sem efeito. | RN:528 e RN:855; uso só em `escala-hierarquica.ts:2018-2051` (get/save) e `ConfigEscalaForm.tsx` |
| `MedicoClienteVinculo` | Lista do lado do médico (`modoClientes`) que o motor não lê. O motor usa arranjos + `ClienteMedicoVinculo`. | RN:859 (item 20); uso só em `src/lib/services/vinculosMedico.ts`; o motor lê `clienteMedicoVinculo` em `distribuicao/montarEntrada.ts:227` |
| `MedicoExameVinculo` | Idem, lado exame (`modoExames`). | RN:859; uso só em `vinculosMedico.ts`; o motor lê `exameMedicoVinculo` (`montarEntrada.ts:228`) |
| `MedicoExameProdutividade` | Cadastrada, mas não lida pelo motor (a capacidade vem de `AlocacaoMedico.produtividade`). | uso só em `src/lib/services/vinculosMedico.ts`; 0 ocorrências em `src/lib/services/distribuicao/` |
| `SolicitacaoSaque` | Saque interno desligado e substituído pela Altis; a lista é só histórico. **Proposta:** exportar o histórico para arquivo (S3/CSV) antes de descartar. | RN:490-491; `src/components/medico/BotaoSacar.tsx:97`; `revisao-telas.md:43` |

Campos descartados dentro de models mantidos (resumo): `Laudo.hashLinha/semanaIso/anoLaudo/diaLaudo/dadosBrutos/tipificacao*`; `ExamePipeline.sexoPaciente/nomeSolicitante/crmSolicitante/dadosBrutos/bucket*`; `Medico.equipe/modalidades/especialidades/categorias/prioridades/tipoContratacao(texto)/contasAPagar/modoClientes/modoExames`; `Cliente` ficha contratual (schema:2020-2034) e `enriquecido`; `Papel.telas`; `MedicoValorRepasse.dataInicio/FimVigencia`; `Configuracao.metaSlaPct/metaVolumetriaTotal`; `FechamentoPeriodo.geracaoIniciadaEm/ultimaTentativaEm`; os JSON em texto de `Contrato`.

---

## 5. Pontos de atenção LGPD

| Tabela nova | Campos pessoais / saúde | Tratamento proposto |
|---|---|---|
| `laudos` | `nomePaciente`, `codigoPaciente` (saúde: vinculados ao exame); `digitador`; médico (profissional) | `paciente_chave` (HMAC com segredo, como no RadShield) no laudo. Desde 23/11/2026, nome e código como chegaram em `laudos_pacientes` (`LGPD: saúde`, 1:1, leitura só pelo caso de uso `LerPacientesDosLaudos`, com `importacao.paciente.ver` e um evento de auditoria por laudo lido; nunca em log, erro, analytics ou totais). Retenção igual à do laudo (sai em cascata com ele; decisão de 24/11/2026). `digitador` fora ou FK. Analytics nunca lê paciente. |
| `laudos_linhas_brutas` | Linha completa da planilha (nome, nascimento, sexo…) | `LGPD: saúde`. Retenção curta (ex.: 90 dias) com expurgo por job. Acesso só da ingestão. |
| `fila_exames` | Nome e código do paciente, estudo | `LGPD: saúde`. Necessário para a distribuição (agrupar por paciente, conferir na MobileMed). Expurgo do nome quando o exame sai da fila + N dias. Nascimento vira `paciente_idoso`. Sem sexo nem solicitante. |
| `designacoes` | `nomePaciente` | Substituir por FK para `fila_exames` + `paciente_chave`. Leitura do nome exige permissão específica e gera evento de auditoria. |
| `laudos_manuais` | `paciente`, `accession` | `paciente_chave` ou remover (ver Dúvidas). |
| `movimentos_credito` | `paciente`, `estudo` | Trocar por `laudo_id` + `paciente_chave`. Tabela só-inserção: o expurgo é por anonimização controlada (exceção documentada ao trigger). |
| `demonstrativos_repasse_itens` | Paciente (o PDF do médico mostra paciente, RN:458) | Itens sem nome; o PDF busca o nome na hora em `fila_exames`/fonte permitida ou mostra pseudônimo (ver Dúvidas). PDF no S3 privado com retenção. |
| `rodadas.insumos_motor` (jsonb) | Pode conter chaves de exame/paciente | Garantir só ids/pseudônimos. |
| `usuarios` | e-mail, CPF (`documento`), nome | `LGPD: pessoal`. Exportação/exclusão por titular. |
| `medicos`, `medicos_dados_pagamento` | CPF, CNPJ, Pix, e-mail, telefone, CRM | `LGPD: pessoal`. Pagamento em tabela separada, com permissão própria e auditoria de acesso. |
| `ausencias` | `tipo` (licença), observações | `LGPD: saúde` em `observacoes` quando for licença médica. Texto livre com aviso de "não informar CID". |
| `clientes_dados_fiscais` | CPF (cliente PF), e-mail, telefone, contato, dados bancários | `LGPD: pessoal` quando PF. |
| `contratos_partes` | Representante/testemunha: nome, CPF, data de nascimento, e-mail, telefone | `LGPD: pessoal`. Minimizar: data de nascimento só se a ClickSign exigir (ver Dúvidas). Retenção = vigência do contrato + prazo legal. |
| `contratos_signatarios`, `notificacoes_enviadas`, `faturamento_pos_fechamento` | e-mails/nomes de destinatários | `LGPD: pessoal`, retenção 12–24 meses. |
| `ausencias`/`eventos_auditoria` | `antes`/`depois` podem copiar dados pessoais | Política: auditoria guarda ids e campos alterados; mascarar CPF/Pix. |
| `paineis_ia_salvos` | Conversa com a IA | Garantir que não contenha paciente (regra: nenhum dado de paciente vai para provedor de IA). |
| `radshield_*` | HMAC do paciente (`versoes`) | Manter HMAC, expurgo em 13 meses, acesso só do job. |
| `acompanhamento_pilha_robo`, `alertas_credito.dados` | Indiretos (médico) | Baixo risco; retenção 90 dias–6 meses. |

---

## 6. Ordem sugerida de migração dos dados (apenas planejamento)

| # | Módulo | Tabelas (destino) | Depende de |
|---|---|---|---|
| 1 | identidade | `papeis`, `papeis_permissoes`, `usuarios` (sem senha; convites gerados depois), `chaves_api_robo` (novas, não migram) | — |
| 2 | catalogo | `modalidades`, `especialidades`, `subespecialidades` (+ ligação), `categorias_exame`, `prioridades`, `prioridades_de_para`, `especialidades_de_para`, `exames`, `regras_quebra_exame`, `exames_de_para_valores`, `contratados` (*antes* de clientes, porque é FK da emissora; é de contratos, mas precisa entrar aqui), `clientes`, `clientes_aliases` (une as duas fontes) | 1 (autoria) |
| 3 | medicos | `tipos_contratacao`, `niveis_medico`, `medicos`, `medicos_dados_pagamento`, `medicos_aliases`, `equipes`, `equipes_membros`, `grupos_medicos(_membros)`; depois `usuarios.medico_id` | 2 |
| 4a | ingestao | `importacoes` (histórico curto) → `laudos` (competências fechadas + aberta, resolvendo cliente/médico/especialidade pelos aliases; sem resolução, vai para `pendencias_cadastro`) → `pendencias_cadastro` (decisões "ignorado") → recalcular `totais_*` | 2, 3 |
| 4b | escala | `frentes_escala`, `turnos`, `turnos_frentes`, `alocacoes(_recortes)`, `ausencias`, `ajustes_produtividade`, `usuarios_escopos_escala`, `eventos_auditoria` (escala) | 3 |
| 5 | analytics | Nada a migrar: valida os `totais_*` contra o legado (volumetria/SLA de 1–2 meses); `metas_mensais` (onde for decidido) | 4a |
| 6 | distribuicao | `configuracao_distribuicao`, `politicas_distribuicao`, `janelas_sem_automacao`, `arranjos(_recortes)`, `excecoes_medico`, `clientes/exames_medicos_permitidos`, `prioridades_cliente`, `reforcos` ativos; histórico de `rodadas`/`designacoes` (90 dias, opcional). `fila_exames` não migra. | 2, 3, 4b |
| 7a | contratos | `contratos_partes`, `contratos`, `contratos_signatarios`, `contratos_documentos` + cópia de arquivos para S3, `modelos_documento`, `contratados_modelos`, destinatários e modelos de e-mail | 2 |
| 7b | faturamento | `competencias` → `clientes_dados_fiscais`, `parametros_faturamento`, `aliquotas_impostos`, `precos_cliente`, `precos_padrao_contratado`, `regras/subregras_tipificacao`, `clientes_tipificacao/subregras`, `regras_divisao_cliente` → `classificacoes_laudo` (reclassificar, não copiar) → `ajustes_laudo` (pela chave natural), `laudos_manuais` → demonstrativos fechados + `faturamento_pos_fechamento` | 4a, 7a |
| 7c | repasse | `tarifas_repasse`, `tabela_referencia_repasse`, `precos_repasse`, `medicos_regras_repasse`, `regras_apuracao`, `adicionais_repasse`, `listas_atraso` → demonstrativos fechados + `repasse_pos_fechamento` | 3, 4a, 4b, 7b (`competencias`) |
| 7d | credito-pre-pago | `contas_pre_pagas` (de `Cliente.prePago*` e `recargaAuto*`) → `recargas_credito` → `movimentos_credito` (ligar ao `laudo_id` pela chave natural) → `alertas_credito` abertos; conferir saldo = soma do extrato | 4a, 7b |
| 8 | qualidade | `clientes_service_desk`; `radshield_*` (com HMAC preservado, mesmo segredo) | 2, 3 |

Conferências sugeridas: totais por competência (faturamento bruto/líquido por grupo, repasse por médico) iguais ao legado nas competências fechadas; saldo de crédito igual por cliente; número de laudos por competência igual.

---

## 7. Dúvidas para o usuário

1. **Chave natural do laudo:** a regra do legado é empresa + accession + **dia** de realização + estudo (RN:85-89). Vale também para laudos sem accession ou com accession genérico ("P.S", "UTI")? Existe id estável da MobileMed para laudos (como existe `idExameMobilemed` na fila)?
2. **Histórico de laudos a migrar:** quantas competências fechadas? Todas (para reprocessamento) ou só os demonstrativos fechados + as últimas N competências de laudos?
3. **Tipificação nos totais:** a Volumetria filtra por CO/NC/NC1. Os totais devem ter `regra_tipificacao` como dimensão? E o médico (volume por médico, ranking)?
4. **Paciente no PDF de repasse e no portal do médico** (RN:458 e RN:818): continuar mostrando o nome? Se sim, de onde ele vem depois do expurgo da fila (prazo de retenção)?
5. **`codigoPaciente` e `paciente` em `laudos_manuais`/`movimentos_credito`:** podem virar só HMAC?
6. **Contexto das telas SLA/Prazos/Pendentes/Direcionamento** (`fila_exames`, `retratos_fila`, `acompanhamento_pilha_robo`, `carencias_direcionamento`, `metas_mensais`): distribuicao, analytics ou um novo `operacao`?
7. **`ApuracaoBalanco`** (distribuição aos sócios) e **`PainelIaSalvo`**: em que contexto ficam? O Painel IA continua?
8. **`SolicitacaoSaque`:** o histórico ainda é consultado? Basta um export para S3/CSV?
9. **Altis:** quando reativada, precisaremos persistir os lotes enviados (`lotes_antecipacao`)? Hoje nada é gravado.
10. **Parâmetros sem efeito** (adicional de urgência, reajuste, desconto/acréscimo, dia de faturamento, RN:300-304): descartar ou manter como informativos?
11. **JSON em texto de `Contrato`** (`faixasVolume`, `configuracoesFranquia`, `tabelaPrecos`…): algum é lido hoje ou pode ser descartado?
12. **`GrupoMedico` × `Equipe`:** podem virar um conceito só (grupo com finalidade tipificação/distribuição)?
13. **Preço do repasse:** `RegraApuracao` do tipo `tarifa_laudo` e `Medico.adicionalValorSemDigitador` devem virar linhas de `precos_repasse`/`adicionais_repasse`, ou continuam como regras?
14. **Data de nascimento de representante/testemunha:** a ClickSign ou o contrato exigem? Se não, descartar.
15. **Exclusão fiscal e médico oculto:** confirmar que "Dr. Rodrigo" e as empresas fiscais viram flags de cadastro (`oculto_dashboards`, `exclusao_fiscal`). E a inconsistência RN:865 (oculto na Volumetria, visível no SLA) deve ser unificada ou mantida por tela?
16. **`Contratado`:** fica em contratos (como mapeado) ou no catálogo, já que faturamento e cliente dependem dele como emissora?

---

**Checklist:** identidade 2 + catalogo 14 + medicos 7 + ingestao 4 + escala 6 + distribuicao 14 + faturamento 17 + repasse 8 + credito-pre-pago 3 + contratos 7 + qualidade 1 + analytics/a definir 2 = 85 (seção 2) + 9 descartados (seção 4).

**Models cobertos: 94/94**
