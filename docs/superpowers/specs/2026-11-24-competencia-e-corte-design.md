# Competências e corte configurável (início da Fase 5, `faturamento`)

Data: 24/11/2026. Aprovado na conversa: abordagem A (competência calculada na importação e gravada no laudo).

## Intenção

O dashboards-one tem muitas inconsistências e o usuário está revisando ponto a ponto. No fechamento do mês, três datas se confundem e a configuração não bate com o cálculo:

- **Data do exame** (`dataRealizacao`), **data do laudo** (`dataLaudo`, assinatura) e **data do fechamento** (o instante em que alguém fecha a competência, à mão: outubro/2026 em 10/11, setembro em 09/10, agosto em 10/09).
- A regra que põe o laudo num mês é fixa no código: `max(mês do exame, mês(laudo − 7 dias))`, em horário de Brasília. Ou seja, o laudo assinado até o dia 7 do mês seguinte fica no mês do exame.
- O dashboards-one tem um corte por cliente (`diaCorteCompetencia` + `corteCompetenciaDesde`, de 1 a 28, exemplo no código: SROSALIA de 26 a 25), mas nenhum cliente está com ele preenchido.
- Os campos "Dia de fechamento" (7 em 283 clientes, 30 no CENTRO_ANGIO_NEURO, 31 no SANTA_LUCIA) e "Dia de faturamento" (8 na maioria, 26 no SROSALIA) não entram no cálculo; o segundo só vai para a Omie como dia da nota.

O redo-one precisa que **o corte seja configurável**: um padrão para todos e um corte próprio por cliente. O usuário está implementando o mesmo no dashboards-one. Hoje só o **SROSALIA** fatura diferente, e ele será configurado **depois** da importação, à mão.

## Objetivos

1. Tabela de **competências** no `faturamento`: aberta/fechada, quem fechou e quando, quem reabriu e quando, trava de importação. Ligada à porta `CompetenciasBloqueadas` da `ingestao`, hoje sem implementação (`SemCompetenciasBloqueadas`).
2. **Corte configurável**: um corte padrão (global) e um corte por cliente com vigência.
3. A `ingestao` calcula a competência de cada laudo pela configuração e grava em `laudos.competencia`, como hoje.
4. Mudar um corte recalcula só os laudos das competências **abertas** atingidas.
5. Importar do dashboards-one as competências (`fechamentos_periodo`) com status e datas; **todos os clientes no corte padrão**.
6. Telas: Faturamento › Competências, o corte padrão nas Configurações e o corte do cliente numa aba Faturamento do painel do cliente.

## Fora do escopo

- Fechamento separado por cliente (fechar o SROSALIA e deixar os outros abertos). O fechamento é um só para todos.
- Gerar demonstrativo, preço, franquia, tipificação, Omie e dia da nota (`diaFaturamento`). Ficam para as próximas etapas do `faturamento`.
- Trazer o corte por cliente do dashboards-one na importação. O SROSALIA é configurado à mão depois.
- Mudar a regra do `repasse` ou do `credito-pre-pago`. Eles vão ler a mesma `laudos.competencia` quando existirem.

## Anti-objetivos (seria falha mesmo funcionando)

- Um laudo de competência **fechada** mudar de mês, entrar ou sair por causa de uma mudança de corte.
- Confundir data do exame, data do laudo e data do fechamento em qualquer cálculo ou rótulo de tela.
- Deixar dois campos com nome parecido (como "Dia de fechamento" e "Dia de faturamento" do dashboards-one) em que um não tem efeito.
- Deixar o corte fixo no código (CLAUDE.md: regra que o negócio muda fica no banco, editável por tela, com permissão e auditoria).
- Mudar a competência de algum laudo já importado na hora de ligar a configuração: com tudo no padrão, o resultado tem de ser idêntico ao de hoje.

## A regra

Datas em UTC no banco, lidas em horário de Brasília (UTC−3 fixo) para decidir dia e mês, como `apps/api/src/ingestao/domain/competencia.ts` já faz.

Um **corte** diz até que dia vai a competência M, medido pela **data do laudo**:

- `dia` (1 a 31) ou "último dia do mês";
- `mes`: `seguinte` (o corte cai no mês M+1) ou `proprio` (cai no próprio mês M).

Exemplos:

| Corte | Competência M recebe os laudos assinados de | Uso |
| --- | --- | --- |
| dia 7, mês seguinte | 08/M a 07/(M+1) | padrão de hoje |
| dia 25, próprio mês | 26/(M−1) a 25/M | SROSALIA (a configurar depois) |
| último dia, próprio mês | 01/M ao último dia de M | um cliente que fatura pelo mês do laudo |

Um dia maior que o tamanho do mês vale como o último dia dele (dia 31 em fevereiro = 28 ou 29).

Cada corte diz também se **considera a data do exame** (sim/não):

- **Sim** (o padrão de hoje): competência = max(mês do exame, mês que o corte dá para a data do laudo). O laudo nunca vai para um mês anterior ao do exame; é o que mantém no mês certo o exame feito no dia 2 e assinado no dia 3 com o corte "dia 7, mês seguinte".
- **Não** (o SROSALIA, pedido do usuário em 24/11): competência = mês que o corte dá para a **data do laudo**, e só ela. Entra tudo que foi laudado do dia tal ao dia tal, não importa quando o exame foi feito ou enviado.

Com corte no próprio mês as duas opções dão o mesmo número (a assinatura não vem antes do exame), mas a opção fica explícita na configuração e na tela, para ninguém precisar saber disso. A data de envio (`dataTransferencia`) não entra em corte nenhum.

Com o padrão "dia 7, mês seguinte", essa fórmula dá exatamente `competenciaDoLaudo` de hoje. Os testes têm de provar isso, inclusive nas viradas de mês às 21h–00h de Brasília e no dia 08.

**Vigências.** Todo corte vale a partir de uma competência (`desde`, "YYYY-MM"). O corte padrão tem a linha inicial "dia 7, mês seguinte" desde sempre. O cliente tem a própria cadeia de vigências, e cada linha dela é um corte próprio ou "usa o padrão" (voltar ao padrão é uma vigência nova, não um fim de vigência). Só se cria vigência nova; a passada não se edita.

`desde` tem de ser **posterior à última competência fechada** (e não pode haver competência fechada depois dela). Assim todo mês a partir de `desde` está aberto, e nenhuma mudança de corte alcança um mês fechado.

**Cálculo pela cadeia.** O corte que vale para o cliente no mês M é a vigência do cliente com o maior `desde` ≤ M; se ela for "usa o padrão", ou se o cliente não tem vigência, vale a vigência padrão com o maior `desde` ≤ M. Para um laudo:

1. calcula a competência pelo corte mais antigo da cadeia efetiva do cliente;
2. para cada vigência seguinte, em ordem de `desde`: se a competência atual é ≥ `desde`, ela passa a ser `max(desde, competência pelo novo corte)`; se é anterior, fica.

Laudo que já estava antes de `desde` não se mexe; laudo que estava em `desde` ou depois segue o novo corte, sem nunca voltar para antes de `desde`. Um corte que encurta o mês empurra laudos para a frente; um que alonga traz para `desde` laudos que iriam para depois.

A competência é, então, **função pura** de (data do exame, data do laudo, cliente, cadeia de vigências). A importação a cada 15 min, o job de recálculo e qualquer reprocessamento chegam ao mesmo valor. Não existe laudo "preso": a importação continua recalculando a competência de toda a janela, como hoje, e ignora as linhas de competência fechada.

**Competências sem linha.** A linha em `competencias` nasce na importação (upsert "aberta" quando chega o primeiro laudo do mês) e na importação do dashboards-one; mês sem linha está aberto. A lista vem da tabela. Só se fecha competência que já tem linha e cujo mês já acabou.

**Reabrir.** Reabrir volta o status para aberta e não mexe na trava separada da importação (como no dashboards-one: reabrir para ajustar preço não destrava). Não precisa de recálculo: como `desde` é sempre posterior à última fechada, a cadeia dá o mesmo resultado para os laudos dela.

**Mudança do cliente do laudo.** Quando o cliente de um laudo muda depois da importação (aviso triado que resolve o cliente, unidade unificada ou desfeita), o corte efetivo pode mudar. O mesmo job de recálculo roda para os laudos atingidos nas competências abertas. Na prática só importa quando algum dos clientes envolvidos tem corte próprio.

**Unidades.** O laudo de uma unidade (`clientes.unificado_em_id`) segue o corte do cliente principal, porque é por ele que se fatura.

**Reassinatura.** A competência continua saindo de `dataLaudo`, como hoje. O laudo reassinado na MobileMed chega com outra data e outra chave natural (a data do laudo faz parte dela). Com a competência antiga fechada, o laudo antigo fica nela e o novo entra pela competência da nova data; com ela aberta, a importação troca um pelo outro, como já faz. É o comportamento de hoje; os testes só confirmam que a trava não o quebra.

## O que já existe e muda

- `ingestao/domain/competencia.ts`: `competenciaDoLaudo(realizacao, laudo)` vira o cálculo com um corte, e o código fixo do dia 7 sai de lá. O corte que vale para o laudo chega pela configuração.
- `ingestao/domain/preparar-laudo.ts`: calcula a competência com o corte do cliente do laudo (ou o padrão, se o laudo não tem cliente resolvido).
- `ingestao/application/ports/competencias-bloqueadas.ts`: ganha a implementação real do `faturamento` (competências fechadas ou com a importação travada). A importação já ignora os laudos dessas competências e já conta `ignoradasCompetenciaFechada`.
- Nova porta na `ingestao` para ler os cortes (padrão e por cliente, com vigências), implementada pelo `faturamento`, no mesmo molde da `CompetenciasBloqueadas`.
- Permissões que já estão no catálogo: `faturamento.ver`, `faturamento.competencia.fechar`, `faturamento.competencia.reabrir`. Faltam a de travar/destravar a importação e a de editar os cortes.
- Os totais pré-somados (`totais_laudos_dia`) são por dia, não por competência: o recálculo não mexe neles.

## O que entra

### Banco (`faturamento`)

- `competencias`: competência ("YYYY-MM", única), status (aberta | fechada), fechada em/por, reaberta em/por, importação travada em/por, observações. Sem o lease e as marcas de geração do dashboards-one: a geração do demonstrativo vem depois, como job do graphile-worker.
- Cortes: padrão e por cliente, cada linha com `desde`, dia (ou último dia), mês (`seguinte` | `proprio`), quem criou e quando.
- Auditoria (`eventos_auditoria`) em fechar, reabrir, travar, destravar e criar corte.

### API

- Listar competências (com contagem de laudos e de volume de cada uma), fechar, reabrir, travar e destravar a importação.
- Ler e criar vigência do corte padrão; ler e criar vigência do corte do cliente (corte próprio ou "usa o padrão"). Antes de salvar, uma **prévia**: quantos laudos mudam de competência, de qual para qual.
- Salvar o corte grava a vigência e um job (na mesma transação) que recalcula `laudos.competencia` dos laudos atingidos nas competências abertas.
- Fechar trava a competência para a importação na hora (a porta passa a devolvê-la).

### Importação do dashboards-one

- `fechamentos_periodo` → `competencias`: competência, status, `dataFechamento`, `fechadoPor`, `reabertoEm`, `reabertoPor`, `importacaoTravadaEm`/`Por`, `observacoes`. Quem fechou vem como texto (e-mail ou "claude-code"); o redo-one guarda o texto do dashboards-one quando não houver usuário correspondente.
- Nenhum corte por cliente: todos ficam no padrão. `diaFechamento` e `diaFaturamento` não são trazidos aqui (o segundo volta com a Omie).
- Junto do `migrar:legado` que já existe (`apps/api/src/migracao-legado`), só leitura no dashboards-one.

### Web

Passar pela skill `ui-design` antes de desenhar cada tela.

- **Faturamento › Competências**: lista das competências (mais nova em cima) com status, data e autor do fechamento e da reabertura, trava da importação, laudos e volume. Ações por permissão: fechar, reabrir, travar e destravar, com confirmação.
- **Configurações › Faturamento**: o corte padrão, com o histórico de vigências e a prévia ao salvar.
- **Painel do cliente › aba Faturamento**: o corte próprio do cliente (ou "usa o padrão"), histórico de vigências e prévia ao salvar. A aba nasce aqui e depois recebe o resto dos dados de faturamento do cliente.

Toda tela com o texto explícito de qual data cada número usa ("data do laudo", "data do exame", "fechada em").

## Abordagens consideradas

- **A (escolhida):** a competência é calculada na importação e gravada no laudo, agora pela configuração; mudar o corte recalcula por job só as competências abertas. As consultas seguem usando o índice `laudos_competencia_idx`, e o mês fechado não se mexe.
- **B:** calcular a competência na hora da consulta. Descartada: cada consulta de painel ou faturamento teria de cruzar laudo, cliente e corte, voltando à lentidão do dashboards-one, e um mês fechado mudaria sempre que alguém mexesse no corte.

## Decisões minhas (o usuário pode corrigir)

- O corte tem dia e mês (`proprio`/`seguinte`) em vez de só o dia como no dashboards-one, para caber o padrão (dia 7 do mês seguinte) e "último dia do mês" no mesmo mecanismo.
- "Considera a data do exame" é uma opção de cada corte (padrão: sim; o SROSALIA será configurado com "não").
- O corte da unidade é o do cliente principal.
- O corte padrão também tem vigência.
- `desde` tem de ser posterior à última competência fechada. Isso torna a competência uma função pura das datas, do cliente e da configuração, e a importação não precisa de exceção nenhuma.
- Na troca de corte, o laudo que já estava em `desde` ou depois nunca volta para antes de `desde`.
- Voltar ao padrão é uma vigência nova "usa o padrão".
- A linha da competência nasce na importação; mês sem linha está aberto; só se fecha mês que já acabou.
- Reabrir não limpa a trava separada da importação nem recalcula.
- Mudar o cliente de um laudo (triagem, unidade) dispara o mesmo recálculo.
- Fechar já trava a importação; a trava separada serve para travar uma competência ainda aberta (como `importacaoTravadaEm` do dashboards-one).

## Para quem vai construir

- Nomes de tabelas, colunas, rotas e componentes, seguindo `apps/api/CLAUDE.md` e `apps/web/CLAUDE.md`.
- O estilo de arquitetura do `faturamento` (o CLAUDE.md diz: regra rica + integrações → hexagonal).
- Como o job de recálculo divide o trabalho (lotes) e como evita corrida com a importação a cada 15 minutos.
- TDD em tudo, e os casos de borda das datas vindos do `competencia.ts` do dashboards-one (virada às 21h de Brasília, dia 08, dia 31, fevereiro).

## Adendo 25/11/2026: período da data do exame configurável

Aprovado pelo usuário ("Sim" sobre o esboço). Até aqui o exame só tinha a chave "considerar" e o período fixo do mês cheio (dia 1 ao último), como no dashboards-one.

- O corte ganha uma segunda parte com a mesma forma da do laudo: **data do exame**, com dia (número ou último) e mês (próprio | seguinte), além da chave "considerar".
- Competência: com o exame considerado, cada data dá um mês pelo seu corte (a mesma função de hoje) e vale o maior dos dois; sem considerar, só o laudo.
- Padrão: exame até o último dia do próprio mês; laudo até o dia 7 do mês seguinte. É a regra de hoje, então nenhuma competência muda; as vigências existentes ganham esse corte do exame na migration.
- SROSALIA e as demais vigências continuam como estão.
- Vigência, travas e recálculo por job: os mesmos do corte do laudo.
- Tela: o editor de corte mostra as duas partes ("Data do laudo \*" e "Data do exame") e o resumo descreve os dois períodos ("laudos assinados de 08 de um mês a 07 do seguinte; exames realizados de 01 a 31 do mês").
