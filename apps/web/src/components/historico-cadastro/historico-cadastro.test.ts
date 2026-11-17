import { describe, expect, it } from 'vitest';

import { alteracoesDoCadastro, descreverEventoCadastro } from './historico-cadastro';

const ID_NEURO = '11111111-1111-4111-8111-111111111111';
const ID_SOL = '22222222-2222-4222-8222-222222222222';
const ID_PLENO = '33333333-3333-4333-8333-333333333333';
const ID_CONTA = '44444444-4444-4444-8444-444444444444';
const ID_MEDICO = '55555555-5555-4555-8555-555555555555';
const nomes = {
  [ID_NEURO]: 'NEURO',
  [ID_SOL]: 'CLINICA SOL',
  [ID_PLENO]: 'Pleno',
  [ID_CONTA]: 'Ana (portal)',
  [ID_MEDICO]: 'Ana Reis',
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
