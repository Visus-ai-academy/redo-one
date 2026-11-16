/**
 * Envia o arquivo direto ao storage pela URL assinada (PUT), avisando o progresso em %. É
 * `XMLHttpRequest` e não `fetch` porque só ele informa o progresso do envio.
 */
export function enviarArquivo(
  url: string,
  arquivo: File,
  /** O mesmo tipo que entrou na assinatura da URL. */
  tipoConteudo: string,
  onProgresso: (percentual: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const falhou = () => reject(new Error('O envio da planilha falhou. Tente de novo.'));
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', tipoConteudo);
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) onProgresso(Math.round((evento.loaded / evento.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : falhou());
    xhr.onerror = falhou;
    xhr.send(arquivo);
  });
}
