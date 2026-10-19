import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { ParametrosEditor } from '../components/ParametrosEditor';
import { useData } from '../context/DataContext';
import { fmtData, fmtTamanho } from '../lib/format';
import { mensagem } from '../services/api';
import { alterarParametro, ativarParametro, ativarVersao, criarParametro, excluirParametros, listarParametros, listarVersoes, type Versao } from '../services/recursos';
import type { Parametro } from '../types';

export default function AutomacaoDetalhe() {
  const { id = '' } = useParams();
  const { data: d, atual, prontos, recarregarRecursos } = useData();
  const a = d.automations.find((x) => x.id === id);
  const existe = !!a;
  const [itens, setItens] = useState<Parametro[]>([]);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setItens(await listarParametros(atual.id, id)); setVersoes(await listarVersoes(atual.id, id)); setErro(''); } catch (e) { setErro(mensagem(e)); }
  }, [atual.id, id]);
  useEffect(() => { if (existe) void carregar(); }, [existe, carregar]);

  /** Chama a API, recarrega a lista e devolve a mensagem de erro ('' = ok) para o formulário mostrar. */
  const executar = async (fn: () => Promise<unknown>): Promise<string> => {
    try { await fn(); await carregar(); return ''; } catch (e) { return mensagem(e); }
  };

  if (!prontos) return <div style={{ color: 'var(--muted)' }}>Carregando…</div>;
  if (!a) return (<><h1>Automação não encontrada</h1><Link className="lnk" to="/automacoes">← Voltar para Automações</Link></>);

  return (
    <>
      <Link className="lnk" to="/automacoes">← Voltar para Automações</Link>
      <h1 style={{ marginTop: '0.625rem' }}>{a.nome} <span className="v" style={{ fontWeight: 400 }}>v{a.versao}</span></h1>
      {a.desc && <p style={{ color: 'var(--muted)', margin: '-0.875rem 0 1.25rem' }}>{a.desc}</p>}
      {erro && <p className="err">{erro}</p>}
      <h2>Pacote (.zip)</h2>
      <DataTable cols={['Versão', 'Tamanho', 'Entrada', 'SHA-256', 'Enviada em', '']} hasRows={versoes.length > 0} empty="Nenhum pacote enviado. Use “Enviar pacote” na tela Automações.">
        {versoes.map((v) => (
          <tr key={v.id}>
            <td>v{v.version} {v.current && <span className="badge ok">atual</span>}</td><td>{fmtTamanho(v.size)}</td>
            <td><code>{v.entrypoint ?? '—'}</code></td><td title={v.sha256 ?? ''}><code>{v.sha256?.slice(0, 12) ?? '—'}</code></td><td>{fmtData(v.createdAt)}</td>
            <td className="act"><div>
              {v.hasPackage && <a className="btn sec sm" href={`/api/automations/${id}/versions/${v.id}/package?workspaceId=${atual.id}`}>Baixar</a>}
              {v.hasPackage && !v.current && (
                <button className="btn sec sm" onClick={() => void executar(() => ativarVersao(atual.id, id, v.id)).then((e) => { if (e) setErro(e); void recarregarRecursos(); })}>Ativar esta versão</button>
              )}
            </div></td>
          </tr>
        ))}
      </DataTable>
      <h2>Parâmetros</h2>
      <ParametrosEditor termo="parâmetro" exemplo="caminho_saida" itens={itens}
        dica={<>Os parâmetros ficarão disponíveis para a automação por meio de funções Python. O nome deve ser um identificador
          (letras, números e _). Valores <b>confidenciais</b> são sempre exibidos mascarados. Parâmetros <b>desativados</b> não
          são enviados à automação: na leitura pelo Python retornam <code>None</code>.</>}
        onAdd={(x) => executar(() => criarParametro(atual.id, id, x))}
        onUpdate={(pid, x) => executar(() => alterarParametro(atual.id, id, pid, x))}
        onToggle={(pid) => executar(() => ativarParametro(atual.id, id, pid, itens.find((i) => i.id === pid)?.ativo === false))}
        onRemove={(ids) => executar(() => excluirParametros(atual.id, id, ids))} />
    </>
  );
}
