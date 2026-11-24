import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoDadosFiscais } from './legado';
import { type CadastroParaDadosFiscais, mapearDadosFiscais } from './mapear-dados-fiscais';

type FichaLegada = LegadoDadosFiscais['clientes'][number];

const ficha = (extra: Partial<FichaLegada> = {}): FichaLegada => ({
  id: 'leg-1',
  contato: null,
  email: null,
  emailEnvioNf: null,
  telefone: null,
  bancoCodigo: null,
  bancoAgencia: null,
  bancoConta: null,
  endereco: null,
  enderecoNumero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  cep: null,
  omieCodigoCliente: null,
  omieDataSincronizacao: null,
  ...extra,
});

const ID1 = idDoLegado('clientes', 'leg-1');
const ID2 = idDoLegado('clientes', 'leg-2');

const cadastro = (extra: Partial<CadastroParaDadosFiscais> = {}): CadastroParaDadosFiscais => ({
  clientes: [
    {
      id: ID1,
      nome: 'CLINICA RADIOCOR',
      chaveNormalizada: 'clinica radiocor',
      nomeFantasia: null,
      unificadoEmId: null,
    },
    {
      id: ID2,
      nome: 'CLINICADIA',
      chaveNormalizada: 'clinicadia',
      nomeFantasia: null,
      unificadoEmId: null,
    },
  ],
  clientesAliases: [],
  sufixosNomeCliente: [],
  ...extra,
});

const mapear = (clientes: FichaLegada[], exclusaoFiscal: string[] = [], c = cadastro()) =>
  mapearDadosFiscais({ clientes, exclusaoFiscal }, c);

describe('mapearDadosFiscais', () => {
  it('ficha vazia vira linha vazia do cliente migrado (a carga sobrescreve)', () => {
    const { tabelas, avisos } = mapear([ficha()]);
    expect(tabelas.clientesDadosFiscais).toEqual([
      {
        clienteId: ID1,
        emailsNf: [],
        email: null,
        contatoNome: null,
        telefone: null,
        cep: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        cidade: null,
        uf: null,
        bancoCodigo: null,
        bancoAgencia: null,
        bancoConta: null,
        omieCodigoCliente: null,
        omieSincronizadoEm: null,
        exclusaoFiscal: false,
        atualizadoPorId: null,
      },
    ]);
    expect(avisos).toEqual([]);
  });

  it('campos como estão, aparados; endereço, banco e Omie', () => {
    const [linha] = mapear([
      ficha({
        contato: ' Ana ',
        email: 'fin@cliente.com.br',
        telefone: '(11) 3333-4444 / (11) 99999-0000',
        endereco: 'Av. Paulista',
        enderecoNumero: '1000',
        complemento: '',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        estado: 'sp',
        cep: '01310-100',
        bancoCodigo: '341',
        bancoAgencia: '0001',
        bancoConta: '12345-6',
        omieCodigoCliente: '8556006877',
        omieDataSincronizacao: '2026-03-11T03:23:09.850Z',
      }),
    ]).tabelas.clientesDadosFiscais;
    expect(linha).toMatchObject({
      contatoNome: 'Ana',
      email: 'fin@cliente.com.br',
      telefone: '(11) 3333-4444 / (11) 99999-0000',
      logradouro: 'Av. Paulista',
      numero: '1000',
      complemento: null,
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01310100',
      bancoCodigo: '341',
      bancoAgencia: '0001',
      bancoConta: '12345-6',
      omieCodigoCliente: '8556006877',
      omieSincronizadoEm: new Date('2026-03-11T03:23:09.850Z'),
    });
  });

  it('e-mails da NF separados por vírgula, ponto e vírgula ou espaço, sem vazios nem repetidos, na ordem', () => {
    const [linha] = mapear([
      ficha({
        emailEnvioNf:
          'robertalopesbt@gmail.com, administracao@teleimagem.com.br;clinicabt@gmail.com\n ;; Administracao@teleimagem.com.br clinica2@x.com,',
      }),
    ]).tabelas.clientesDadosFiscais;
    expect(linha?.emailsNf).toEqual([
      'robertalopesbt@gmail.com',
      'administracao@teleimagem.com.br',
      'clinicabt@gmail.com',
      'clinica2@x.com',
    ]);
  });

  it('e-mail fora do formato vem como está, com aviso', () => {
    const { tabelas, avisos } = mapear([ficha({ emailEnvioNf: 'ok@x.com, financeiro' })]);
    expect(tabelas.clientesDadosFiscais[0]?.emailsNf).toEqual(['ok@x.com', 'financeiro']);
    expect(avisos).toEqual([
      {
        tabela: 'clientes_dados_fiscais',
        item: 'CLINICA RADIOCOR',
        motivo:
          'E-mail da NF "financeiro" fora do formato: veio como está; a tela pede para corrigir ao salvar.',
      },
    ]);
  });

  it('CEP: só dígitos, 7 dígitos ganham o zero; o que não der 8 vem como está, com aviso', () => {
    const cep = (valor: string) =>
      mapear([ficha({ cep: valor })]).tabelas.clientesDadosFiscais[0]?.cep;
    expect(cep('12.606-580')).toBe('12606580');
    expect(cep('2016010')).toBe('02016010');
    expect(cep('')).toBeNull();
    expect(cep('129410030')).toBe('129410030');
    expect(mapear([ficha({ cep: '129410030' })]).avisos).toEqual([
      {
        tabela: 'clientes_dados_fiscais',
        item: 'CLINICA RADIOCOR',
        motivo:
          'CEP "129410030" sem 8 dígitos: veio como está; a tela pede para corrigir ao salvar.',
      },
    ]);
  });

  it('ficha de cliente que não migrou fica de fora', () => {
    expect(mapear([ficha({ id: 'sumiu' })]).tabelas.clientesDadosFiscais).toEqual([]);
  });

  it('exclusão fiscal: resolve pelo nome na MobileMed e pelos apelidos; o que não resolver vai para o relatório', () => {
    const { tabelas, avisos, exclusaoFiscal } = mapear(
      [ficha(), ficha({ id: 'leg-2' })],
      ['CLINICA RADIOCOR', 'CLINICA_RADIOCOR', 'CLINICADIA_TC', 'RADIOCOR_LOCAL'],
      cadastro({
        clientesAliases: [
          { tipo: 'exato', chave: 'CLINICADIA_TC', padrao: 'CLINICADIA_TC', clienteId: ID2 },
        ],
      }),
    );
    expect(tabelas.clientesDadosFiscais.map((l) => [l.clienteId, l.exclusaoFiscal])).toEqual([
      [ID1, true],
      [ID2, true],
    ]);
    expect(exclusaoFiscal).toEqual([
      { nome: 'CLINICA RADIOCOR', cliente: 'CLINICA RADIOCOR' },
      { nome: 'CLINICA_RADIOCOR', cliente: 'CLINICA RADIOCOR' },
      { nome: 'CLINICADIA_TC', cliente: 'CLINICADIA' },
      { nome: 'RADIOCOR_LOCAL', cliente: null },
    ]);
    expect(avisos).toEqual([
      {
        tabela: 'clientes_dados_fiscais',
        item: 'RADIOCOR_LOCAL',
        motivo: 'Nome da exclusão fiscal sem cliente no redo-one: ficou de fora.',
      },
    ]);
  });

  it('exclusão fiscal de cliente sem ficha no dashboards-one (principal criado na carga) ganha a linha', () => {
    const principal = idDoLegado('clientes-principal', 'prn');
    const c = cadastro();
    c.clientes.push({
      id: principal,
      nome: 'PRN',
      chaveNormalizada: 'prn',
      nomeFantasia: 'PRN',
      unificadoEmId: null,
    });
    const { tabelas } = mapear([], ['PRN'], c);
    expect(tabelas.clientesDadosFiscais).toEqual([
      expect.objectContaining({ clienteId: principal, exclusaoFiscal: true, emailsNf: [] }),
    ]);
  });
});
