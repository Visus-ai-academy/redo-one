import { describe, expect, it } from 'vitest';

import { descreverAparelho, ipParcial } from './aparelho';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('descreverAparelho', () => {
  it.each([
    [UA.chromeWindows, 'Chrome no Windows', false],
    [UA.edgeWindows, 'Edge no Windows', false],
    [UA.safariIphone, 'Safari no iPhone', true],
    [UA.firefoxMac, 'Firefox no Mac', false],
    [UA.chromeAndroid, 'Chrome no Android', true],
    [UA.safariMac, 'Safari no Mac', false],
  ])('%s', (userAgent, nome, movel) => {
    expect(descreverAparelho(userAgent)).toEqual({ nome, movel });
  });

  it('sem user agent ou desconhecido, diz que não identificou', () => {
    expect(descreverAparelho(null)).toEqual({ nome: 'Aparelho não identificado', movel: false });
    expect(descreverAparelho('curl/8.0')).toEqual({
      nome: 'Aparelho não identificado',
      movel: false,
    });
  });
});

describe('ipParcial', () => {
  it('esconde o fim do IPv4', () => {
    expect(ipParcial('177.32.10.200')).toBe('177.32.x.x');
  });

  it('trata o IPv4 que o Express entrega como IPv6 (::ffff:)', () => {
    expect(ipParcial('::ffff:177.32.10.200')).toBe('177.32.x.x');
  });

  it('esconde o fim do IPv6', () => {
    expect(ipParcial('2804:14c:5b81:8ab1::1')).toBe('2804:14c:x:x');
  });

  it.each(['::1', '127.0.0.1', '::ffff:127.0.0.1'])(
    'acesso da própria máquina (%s) vira "local"',
    (ip) => {
      expect(ipParcial(ip)).toBe('local');
    },
  );

  it('sem IP, não mostra nada', () => {
    expect(ipParcial(null)).toBeNull();
  });
});
