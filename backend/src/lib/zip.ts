// Inspeção mínima de .zip (sem descompactar): confere a estrutura, caminhos seguros e o arquivo de entrada.
const ENTRADAS = ['main.py', 'bot.py', '__main__.py', 'main.pyc', 'bot.pyc', 'main.exe', 'bot.exe'];

export interface ZipInfo { erro?: string; entrypoint?: string; requirements?: string; arquivos?: number; bytes?: number }

export function inspecionarZip(buf: Buffer): ZipInfo {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return { erro: 'O arquivo não é um .zip válido.' };
  let eocd = -1; // fim do diretório central: procura de trás para frente (comentário de até 64 KB)
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { erro: 'Zip corrompido (diretório central não encontrado).' };
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || off === 0xffffffff) return { erro: 'Zip64 não é suportado.' };
  if (total === 0) return { erro: 'O zip está vazio.' };
  if (total > 5000) return { erro: 'Zip com arquivos demais (máximo 5000).' };

  const nomes: string[] = [];
  let bytes = 0;
  for (let i = 0; i < total; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return { erro: 'Zip corrompido (entrada inválida).' };
    if (buf.readUInt16LE(off + 8) & 1) return { erro: 'Zip protegido por senha não é suportado.' };
    bytes += buf.readUInt32LE(off + 24);
    const n = buf.readUInt16LE(off + 28), m = buf.readUInt16LE(off + 30), k = buf.readUInt16LE(off + 32);
    const nome = buf.toString('utf8', off + 46, off + 46 + n).replace(/\\/g, '/');
    if (nome.startsWith('/') || /^[A-Za-z]:/.test(nome) || nome.split('/').includes('..')) return { erro: `Caminho inseguro no zip: ${nome}` };
    nomes.push(nome);
    off += 46 + n + m + k;
  }
  if (bytes > 500 * 1024 * 1024) return { erro: 'Conteúdo descompactado grande demais (máximo 500 MB).' };
  const entrypoint = ENTRADAS.find((e) => nomes.includes(e));
  if (!entrypoint) return { erro: `Não encontrei o arquivo de entrada na raiz do zip. Esperado um destes: ${ENTRADAS.join(', ')}.` };
  return { entrypoint, requirements: nomes.includes('requirements.txt') ? 'requirements.txt' : undefined, arquivos: total, bytes };
}
