import { describe, expect, it } from 'vitest';

import { alteracoesDoCadastro, descreverEventoCadastro } from './historico-cadastro';

const ID_NEURO = '11111111-1111-4111-8111-111111111111';
const ID_SOL = '22222222-2222-4222-8222-222222222222';
const ID_PLENO = '33333333-3333-4333-8333-333333333333';
const ID_CONTA = '44444444-4444-4444-8444-444444444444';
const ID_MEDICO = '55555555-5555-4555-8555-555555555555';
const ID_RX = '66666666-6666-4666-8666-666666666666';
const nomes = {
  [ID_NEURO]: 'NEURO',
  [ID_SOL]: 'CLINICA SOL',
  [ID_PLENO]: 'Pleno',
  [ID_CONTA]: 'Ana (portal)',
  [ID_MEDICO]: 'Ana Reis',
  [ID_RX]: 'RX',
};
const evento = (
  entidade: string,
  acao: string,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
  entidadeId = 'x',
) => ({ entidade, entidadeId, acao, antes, depois });

const arranjo = (mudar: Record<string, unknown> = {}) => ({
  especialidadeId: ID_NEURO,
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...mudar,
});

describe('descreverEventoCadastro', () => {
  it('equipe do médico: entrou, saiu ou a equipe foi excluída, com o nome dela', () => {
    expect(descreverEventoCadastro('equipe', 'membro_entrou', 'Equipe 2')).toBe(
      'Entrou na Equipe 2',
    );
    expect(descreverEventoCadastro('equipe', 'membro_saiu', 'Equipe 2')).toBe('Saiu da Equipe 2');
    expect(descreverEventoCadastro('equipe', 'equipe_excluida', 'Equipe 2')).toBe(
      'Saiu da Equipe 2 (equipe excluída)',
    );
    expect(descreverEventoCadastro('equipe', 'membro_entrou')).toBe('Entrou numa equipe');
  });

  it('diz o que aconteceu em português, por cadastro', () => {
    expect(descreverEventoCadastro('medico', 'criado')).toBe('Médico criado');
    expect(descreverEventoCadastro('medico', 'alterado')).toBe('Cadastro alterado');
    expect(descreverEventoCadastro('medico', 'pagamento_lido')).toBe(
      'Dados de pagamento consultados',
    );
    expect(descreverEventoCadastro('arranjos_medico', 'alterado')).toBe('Arranjos alterados');
    expect(descreverEventoCadastro('usuario', 'medico_vinculado')).toBe('Conta do portal ligada');
    expect(descreverEventoCadastro('cliente', 'alias_criado')).toBe('Apelido adicionado');
    expect(descreverEventoCadastro('cliente', 'unificado_em')).toBe(
      'Virou unidade de outro cliente',
    );
    expect(descreverEventoCadastro('exame', 'excluido')).toBe('Exame excluído');
    expect(descreverEventoCadastro('de_para_valor_exame', 'alterado')).toBe(
      'Valor fora do padrão alterado',
    );
  });

  it('ação desconhecida aparece como veio', () => {
    expect(descreverEventoCadastro('medico', 'novidade')).toBe('Médico: novidade');
  });
});

describe('alteracoesDoCadastro', () => {
  it('campo: antes → depois, com rótulos em português e ids trocados por nomes', () => {
    const linhas = alteracoesDoCadastro(
      evento(
        'medico',
        'alterado',
        { nivelId: null, senior: false, funcao: 'STAFF', dataInicioVinculo: '2024-03-01' },
        { nivelId: ID_PLENO, senior: true, funcao: 'FELLOW', dataInicioVinculo: '2025-01-02' },
      ),
      nomes,
    );
    expect(linhas).toEqual([
      { rotulo: 'Nível', antes: '(vazio)', depois: 'Pleno' },
      { rotulo: 'Sênior', antes: 'Não', depois: 'Sim' },
      { rotulo: 'Função', antes: 'Staff', depois: 'Fellow (em formação)' },
      { rotulo: 'Início do vínculo', antes: '01/03/2024', depois: '02/01/2025' },
    ]);
  });

  it('outra conta na MobileMed: o id sem separador de milhar, a observação e o motivo', () => {
    expect(descreverEventoCadastro('medico', 'conta_mobilemed_adicionada')).toBe(
      'Outra conta na MobileMed adicionada',
    );
    expect(descreverEventoCadastro('medico', 'conta_mobilemed_removida')).toBe(
      'Outra conta na MobileMed removida',
    );
    expect(
      alteracoesDoCadastro(
        evento('medico', 'conta_mobilemed_adicionada', null, {
          idMobilemed: 19053,
          observacao: 'login do plantão',
          motivo: 'mapeamento pelos laudos',
        }),
      ),
    ).toEqual([
      { rotulo: 'ID na MobileMed', antes: null, depois: '19053' },
      { rotulo: 'Observação', antes: null, depois: 'login do plantão' },
      { rotulo: 'Motivo', antes: null, depois: 'mapeamento pelos laudos' },
    ]);
  });

  it('unidade do teto do médico na distribuição', () => {
    expect(
      alteracoesDoCadastro(
        evento(
          'medico_distribuicao',
          'alterado',
          { unidadeTeto: 'exames' },
          { unidadeTeto: 'laudos' },
        ),
        nomes,
      ),
    ).toEqual([{ rotulo: 'Conta o teto por', antes: 'Exames', depois: 'Laudos' }]);
  });

  it('valor sensível gravado mascarado continua mascarado', () => {
    expect(
      alteracoesDoCadastro(
        evento('medico', 'pagamento_alterado', { cpf: '***01' }, { cpf: '***99' }),
        nomes,
      ),
    ).toEqual([{ rotulo: 'CPF', antes: '***01', depois: '***99' }]);
  });

  it('na criação só o depois preenchido; na exclusão só o antes', () => {
    expect(
      alteracoesDoCadastro(
        evento('cliente', 'criado', null, { nome: 'SOL', cnpj: null, tipoPessoa: 'PJ' }),
        nomes,
      ),
    ).toEqual([
      { rotulo: 'Nome', antes: null, depois: 'SOL' },
      { rotulo: 'Tipo de pessoa', antes: null, depois: 'Pessoa jurídica' },
    ]);
    expect(
      alteracoesDoCadastro(
        evento('cliente', 'alias_excluido', { tipo: 'prefixo', padrao: 'SOL' }, null),
        nomes,
      ),
    ).toEqual([
      { rotulo: 'Tipo', antes: 'Começa com', depois: null },
      { rotulo: 'Apelido', antes: 'SOL', depois: null },
    ]);
  });

  it('arranjos: mostra os incluídos e os removidos, descritos por extenso', () => {
    const linhas = alteracoesDoCadastro(
      evento(
        'arranjos_medico',
        'alterado',
        { arranjos: [arranjo()] },
        {
          arranjos: [
            arranjo(),
            arranjo({ especialidadeId: null, modoClientes: 'apenas', clienteIds: [ID_SOL] }),
          ],
        },
      ),
      nomes,
    );
    expect(linhas).toEqual([
      {
        rotulo: 'Arranjo incluído',
        antes: null,
        depois: 'Todas as especialidades; clientes: só CLINICA SOL',
      },
    ]);
  });

  it('arranjo de frente de modalidade: a modalidade e as especialidades dela', () => {
    const linhas = alteracoesDoCadastro(
      evento(
        'arranjos_medico',
        'alterado',
        { arranjos: [] },
        {
          arranjos: [
            arranjo({ especialidadeId: null, modalidadeId: ID_RX, especialidadeIds: [ID_NEURO] }),
          ],
        },
      ),
      nomes,
    );
    expect(linhas).toEqual([
      { rotulo: 'Arranjo incluído', antes: null, depois: 'RX; especialidades: NEURO' },
    ]);
  });

  it('conta do portal: diz qual conta, sem repetir o médico', () => {
    expect(
      alteracoesDoCadastro(
        evento(
          'usuario',
          'medico_vinculado',
          { medicoId: null },
          { medicoId: ID_MEDICO },
          ID_CONTA,
        ),
        nomes,
      ),
    ).toEqual([{ rotulo: 'Conta', antes: null, depois: 'Ana (portal)' }]);
  });
});

describe('dados de faturamento do cliente', () => {
  const fiscais = (antes: Record<string, unknown>, depois: Record<string, unknown>) =>
    evento('cliente_dados_fiscais', 'alterado', antes, depois, 'c-1');

  it('frase do evento', () => {
    expect(descreverEventoCadastro('cliente_dados_fiscais', 'alterado')).toBe(
      'Dados de faturamento alterados',
    );
  });

  it('campos com rótulos da aba, CEP e telefone formatados', () => {
    expect(
      alteracoesDoCadastro(
        fiscais(
          {
            cep: null,
            uf: null,
            contatoNome: null,
            email: 'velho@cliente.com.br',
            telefone: null,
            bancoAgencia: null,
            exclusaoFiscal: false,
          },
          {
            cep: '01310100',
            uf: 'SP',
            contatoNome: 'Ana',
            email: 'novo@cliente.com.br',
            telefone: '11999998888',
            bancoAgencia: '0001',
            exclusaoFiscal: true,
          },
        ),
      ),
    ).toEqual([
      { rotulo: 'Exclusão fiscal', antes: 'Não', depois: 'Sim' },
      { rotulo: 'CEP', antes: '(vazio)', depois: '01310-100' },
      { rotulo: 'UF', antes: '(vazio)', depois: 'SP' },
      { rotulo: 'Nome do contato', antes: '(vazio)', depois: 'Ana' },
      { rotulo: 'E-mail do contato', antes: 'velho@cliente.com.br', depois: 'novo@cliente.com.br' },
      { rotulo: 'Telefone do contato', antes: '(vazio)', depois: '(11) 99999-8888' },
      { rotulo: 'Agência', antes: '(vazio)', depois: '0001' },
    ]);
  });

  it('CEP ou telefone fora do formato aparecem como estão', () => {
    expect(
      alteracoesDoCadastro(
        fiscais({ cep: '2016010', telefone: null }, { cep: '20160100', telefone: '1133 / 1144' }),
      ),
    ).toEqual([
      { rotulo: 'CEP', antes: '2016010', depois: '20160-100' },
      { rotulo: 'Telefone do contato', antes: '(vazio)', depois: '1133 / 1144' },
    ]);
  });

  it('e-mails da NF: um item por e-mail adicionado ou removido', () => {
    expect(
      alteracoesDoCadastro(
        fiscais(
          { emailsNf: ['a@x.com', 'b@x.com'], cidade: null },
          { emailsNf: ['b@x.com', 'c@x.com', 'd@x.com'], cidade: 'Santos' },
        ),
      ),
    ).toEqual([
      { rotulo: 'E-mail da NF removido', antes: 'a@x.com', depois: null },
      { rotulo: 'E-mail da NF adicionado', antes: null, depois: 'c@x.com' },
      { rotulo: 'E-mail da NF adicionado', antes: null, depois: 'd@x.com' },
      { rotulo: 'Cidade', antes: '(vazio)', depois: 'Santos' },
    ]);
  });

  it('e-mails da NF só reordenados: mostra a ordem antes e depois', () => {
    expect(
      alteracoesDoCadastro(
        fiscais({ emailsNf: ['a@x.com', 'b@x.com'] }, { emailsNf: ['b@x.com', 'a@x.com'] }),
      ),
    ).toEqual([
      { rotulo: 'Ordem dos e-mails da NF', antes: 'a@x.com, b@x.com', depois: 'b@x.com, a@x.com' },
    ]);
  });

  it('na ordem da aba, não na do JSON gravado (o jsonb reordena as chaves)', () => {
    const linhas = alteracoesDoCadastro(
      fiscais(
        {
          uf: null,
          cep: null,
          cidade: null,
          emailsNf: [],
          logradouro: null,
          exclusaoFiscal: false,
        },
        {
          uf: 'SP',
          cep: '01310100',
          cidade: 'São Paulo',
          emailsNf: ['a@x.com'],
          logradouro: 'Av. Paulista',
          exclusaoFiscal: true,
        },
      ),
    );
    expect(linhas.map((l) => l.rotulo)).toEqual([
      'E-mail da NF adicionado',
      'Exclusão fiscal',
      'CEP',
      'Logradouro',
      'Cidade',
      'UF',
    ]);
  });
});
