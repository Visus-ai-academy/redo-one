import { describe, expect, it } from 'vitest';

import type { DadosEmpresaEmissora, NotaFiscalServico } from '../../application/ports/emissor-nfse';
import { SimuladorEmissorNfse } from './simulador-emissor-nfse';

const CNPJ = '12345678000190';
const agora = new Date('2026-11-27T15:00:00Z');

const dados: DadosEmpresaEmissora = {
  cnpj: '12.345.678/0001-90',
  razaoSocial: 'Teleimagem Ltda',
  nomeFantasia: 'Teleimagem',
  inscricaoMunicipal: null,
  regimeTributario: 'regime_normal',
  endereco: {
    logradouro: 'Rua A',
    numero: '1',
    complemento: null,
    bairro: 'Centro',
    municipio: 'Curitiba',
    uf: 'PR',
    cep: '80000000',
  },
  email: null,
  telefone: null,
  enviarEmailTomador: true,
};

const nota = {
  dataEmissao: agora,
  dataCompetencia: '2026-11-01',
  prestador: { cnpj: CNPJ },
} as NotaFiscalServico;

const simulador = () => new SimuladorEmissorNfse('homologacao', () => agora);

describe('SimuladorEmissorNfse — empresa', () => {
  it('cadastra, consulta e atualiza pela mesma chave (o CNPJ)', async () => {
    const s = simulador();
    expect(await s.consultarEmpresa(CNPJ)).toBeNull();

    const criada = await s.salvarEmpresa(dados);
    const atualizada = await s.salvarEmpresa({ ...dados, razaoSocial: 'Teleimagem S.A.' });

    expect(atualizada.id).toBe(criada.id);
    expect(await s.consultarEmpresa('12.345.678/0001-90')).toMatchObject({
      cnpj: CNPJ,
      razaoSocial: 'Teleimagem S.A.',
      habilitada: { homologacao: true, producao: false },
      certificado: null,
    });
  });

  it('com certificado, devolve o titular e a validade de um ano', async () => {
    const empresa = await simulador().salvarEmpresa({
      ...dados,
      certificado: { arquivoBase64: 'UEZY', senha: 's' },
    });
    expect(empresa.certificado).toEqual({
      cnpjTitular: CNPJ,
      validoDe: agora,
      validoAte: new Date('2027-11-27T15:00:00Z'),
    });
    expect(empresa.tokens.homologacao?.revelar()).toMatch(/^simulador-/);
  });
});

describe('SimuladorEmissorNfse — NFS-e', () => {
  const comEmpresa = async () => {
    const s = simulador();
    await s.salvarEmpresa(dados);
    return s;
  };

  it('emite como processando e autoriza na primeira consulta, com número sequencial', async () => {
    const s = await comEmpresa();

    expect((await s.emitirNfse('fat-1', nota)).status).toBe('processando');
    await s.emitirNfse('fat-2', nota);

    const primeira = await s.consultarNfse(CNPJ, 'fat-1');
    const segunda = await s.consultarNfse(CNPJ, 'fat-2');
    expect(primeira).toMatchObject({
      referencia: 'fat-1',
      status: 'autorizada',
      numero: '1',
      dataEmissao: agora,
    });
    expect(primeira?.codigoVerificacao).toBeTruthy();
    expect(segunda?.numero).toBe('2');
  });

  it('recusa referência repetida e prestador sem empresa', async () => {
    const s = await comEmpresa();
    await s.emitirNfse('fat-1', nota);

    await expect(s.emitirNfse('fat-1', nota)).rejects.toMatchObject({ tipo: 'recusada' });
    await expect(
      s.emitirNfse('fat-9', { ...nota, prestador: { ...nota.prestador, cnpj: '1' } }),
    ).rejects.toMatchObject({ tipo: 'nao_encontrado' });
  });

  it('consulta de referência inexistente devolve null', async () => {
    expect(await (await comEmpresa()).consultarNfse(CNPJ, 'nada')).toBeNull();
  });

  it('cancela só a autorizada', async () => {
    const s = await comEmpresa();
    await s.emitirNfse('fat-1', nota);
    const justificativa = 'Nota emitida com valor errado';

    await expect(s.cancelarNfse(CNPJ, 'fat-1', justificativa)).rejects.toMatchObject({
      tipo: 'recusada',
    });
    await s.consultarNfse(CNPJ, 'fat-1');
    expect((await s.cancelarNfse(CNPJ, 'fat-1', justificativa)).status).toBe('cancelada');
    expect((await s.consultarNfse(CNPJ, 'fat-1'))?.status).toBe('cancelada');
    await expect(s.cancelarNfse(CNPJ, 'nada', justificativa)).rejects.toMatchObject({
      tipo: 'nao_encontrado',
    });
  });

  it('recusa justificativa curta como a Focus', async () => {
    await expect((await comEmpresa()).cancelarNfse(CNPJ, 'fat-1', 'x')).rejects.toThrow(/15 a 255/);
  });
});
