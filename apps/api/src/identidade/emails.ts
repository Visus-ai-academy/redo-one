import type { Email } from '../comum/email/envio-email';

/** O que vem do cadastro entra no HTML escapado: nome com `<` não vira marcação. */
function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function html(paragrafos: string[], link: { url: string; rotulo: string }): string {
  const corpo = paragrafos.map((p) => `<p>${p}</p>`).join('');
  return (
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#121917">` +
    `${corpo}<p><a href="${escapar(link.url)}" style="display:inline-block;padding:10px 16px;` +
    `background:#214037;color:#ffffff;border-radius:6px;text-decoration:none">${link.rotulo}</a></p>` +
    `<p style="color:#4F5B58;font-size:13px">Se o botão não abrir, copie este endereço: ` +
    `${escapar(link.url)}</p></div>`
  );
}

export function emailConvite(dados: {
  para: string;
  nome: string;
  convidadoPor: string;
  papel: string;
  link: string;
}): Email {
  const intro = `${dados.convidadoPor} convidou você para o One com o papel ${dados.papel}.`;
  return {
    para: dados.para,
    assunto: 'Seu acesso ao One',
    texto:
      `Olá, ${dados.nome}.\n\n${intro}\n\nCrie sua senha pelo link (vale por 7 dias):\n` +
      `${dados.link}\n`,
    html: html(
      [
        `Olá, ${escapar(dados.nome)}.`,
        escapar(intro),
        'Crie sua senha pelo botão abaixo. O link vale por 7 dias.',
      ],
      { url: dados.link, rotulo: 'Criar senha' },
    ),
  };
}

export function emailRecuperacao(dados: { para: string; nome: string; link: string }): Email {
  const aviso = 'Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.';
  return {
    para: dados.para,
    assunto: 'Nova senha do One',
    texto:
      `Olá, ${dados.nome}.\n\nCrie uma nova senha pelo link (vale por 1 hora e funciona uma vez):\n` +
      `${dados.link}\n\n${aviso}\n`,
    html: html(
      [
        `Olá, ${escapar(dados.nome)}.`,
        'Crie uma nova senha pelo botão abaixo. O link vale por 1 hora e funciona uma vez só.',
        aviso,
      ],
      { url: dados.link, rotulo: 'Criar nova senha' },
    ),
  };
}
