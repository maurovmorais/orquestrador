import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { MODO_DEMO } from '../config/env';
import { useData } from '../context/DataContext';
import { useSelecao } from '../hooks/useSelecao';
import { fmtData } from '../lib/format';
import { mensagem } from '../services/api';
import { acaoFila, gerarItensExemplo, listarFila, simularRunnerFila, type AcaoFilaApi, type ItemDaFila } from '../services/recursos';

type AcaoFila = 'cancelar' | 'cancelarJob' | 'duplicar' | 'reprocessar';
const ROTULO: Record<AcaoFila, string> = { cancelar: 'Cancelar item', cancelarJob: 'Cancelar JOB inteiro', duplicar: 'Duplicar', reprocessar: 'Reprocessar' };
const API: Record<AcaoFila, AcaoFilaApi> = { cancelar: 'cancel', cancelarJob: 'cancel_job', duplicar: 'duplicate', reprocessar: 'reprocess' };
const RESULTADO: Record<AcaoFila, string> = { cancelar: 'cancelado(s)', cancelarJob: 'cancelado(s) com o JOB', duplicar: 'duplicado(s)', reprocessar: 'enviado(s) para reprocessamento' };
const TAMANHOS = [10, 50, 100];

export default function Fila() {
  const { data: d, atual } = useData();
  const [escolhida, setEscolhida] = useState(d.automations[0]?.id ?? '');
  const [ordem, setOrdem] = useState<'recent' | 'oldest'>('recent'); // só exibição; o atendimento é sempre FIFO
  const [tamanho, setTamanho] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<{ total: number; items: ItemDaFila[] }>({ total: 0, items: [] });
  const [acao, setAcao] = useState<AcaoFila | ''>('');
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  const autId = d.automations.some((a) => a.id === escolhida) ? escolhida : d.automations[0]?.id ?? '';
  const paginas = Math.max(1, Math.ceil(lista.total / tamanho));
  const ini = (pagina - 1) * tamanho;
  const sel = useSelecao(lista.items.map((f) => f.id)); // a seleção vale para os itens da página exibida

  const carregar = useCallback(async () => {
    if (!autId) return;
    try { setLista(await listarFila(atual.id, autId, { page: pagina, pageSize: tamanho, order: ordem })); setErro(''); } catch (e) { setErro(mensagem(e)); }
  }, [atual.id, autId, pagina, tamanho, ordem]);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 5000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { if (pagina > paginas) setPagina(paginas); }, [pagina, paginas]);
  useEffect(() => { if (!sel.algum) setConfirmando(false); }, [sel.algum]);

  // Altura do bloco fixo (título + filtros + ações): o cabeçalho da tabela fixa logo abaixo dele.
  const bloco = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState('6.75rem');
  useEffect(() => {
    const el = bloco.current;
    if (!el) return;
    const medir = () => setPin(`calc(3.25rem + ${el.offsetHeight}px)`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.automations.length]);

  if (!d.automations.length) return (<><h1>Fila</h1><div className="card">Cadastre uma automação antes de usar a fila.</div></>);

  const irPara = (p: number) => { setPagina(p); sel.limpar(); };

  const aplicar = async () => {
    if (!acao) return;
    const ids = sel.selecionados;
    setErro('');
    try {
      const r = await acaoFila(atual.id, API[acao], ids);
      if (acao === 'cancelarJob') setAviso(r.jobs ? `${r.jobs} JOB(s) cancelado(s): ${r.affected} item(ns) ${RESULTADO[acao]}.` : 'Os itens selecionados não pertencem a nenhum JOB.');
      else setAviso(`${r.affected} de ${ids.length} item(ns) ${RESULTADO[acao]}.` + (r.affected < ids.length ? ' Os demais não estavam em um status que permite esta ação.' : ''));
      sel.limpar(); setConfirmando(false); setAcao('');
      await carregar();
    } catch (e) { setErro(mensagem(e)); }
  };

  const demo = async (fn: () => Promise<unknown>) => {
    try { await fn(); setAviso(''); await carregar(); } catch (e) { setAviso(mensagem(e)); }
  };

  return (
    <div style={{ '--pin': pin } as CSSProperties}>
      <div className="pinblock" ref={bloco}>
        <h1>Fila</h1>
        <div className="card" style={{ marginBottom: '1.375rem' }}>
          <div className="bar" style={{ margin: 0 }}>
            <select value={autId} aria-label="Automação" onChange={(e) => { setEscolhida(e.target.value); setAviso(''); irPara(1); }}>
              {d.automations.map((a) => <option key={a.id} value={a.id}>{a.nome} — {a.desc}</option>)}
            </select>
            {MODO_DEMO && <button className="btn sec sm" title="Somente demonstração" onClick={() => void demo(() => gerarItensExemplo(atual.id, autId, 25, lista.total))}>Gerar 25 itens de exemplo</button>}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', margin: '0.75rem 0 0' }}>
            Os itens são inseridos pela própria automação, por meio de uma instrução Python (função a ser criada). Cada item é um dicionário
            com as variáveis usadas no processamento; clique na referência para ver os dados do item. O atendimento segue a ordem <b>FIFO</b> (o mais antigo primeiro); a ordenação da tabela,
            no cabeçalho <b>Referência</b>, é só de exibição.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>
            Quando a automação inicia (execução manual ou agendamento), todos os itens <b>NEW</b> formam um <b>JOB</b>. Status: <b>NEW</b> = inserido, ainda fora de um JOB ·
            <b> AGUARDANDO</b> = no JOB, esperando a vez (máquina ocupada) · <b>PROCESSANDO</b> = em andamento · <b>SUCESSO</b> ou <b>FALHA</b> = fim.
            Cancelar vale para itens PROCESSANDO ou AGUARDANDO, ou para o JOB inteiro.
          </p>
        </div>

        <div className="bar" style={{ justifyContent: 'space-between', margin: 0 }}>
          <span style={{ fontSize: '0.8125rem', color: erro ? 'var(--bad)' : 'var(--muted)' }}>{erro || aviso || `${lista.total} item(ns) na fila desta automação.`}</span>
          <div className="bar" style={{ margin: 0 }}>
            {MODO_DEMO && <button className="btn sec sm" title="Somente demonstração: simula o runner" onClick={() => void demo(() => simularRunnerFila(atual.id, autId))}>Simular runner</button>}
            {confirmando && acao ? (
              <>
                <span style={{ fontSize: '0.875rem' }}>{ROTULO[acao]} {sel.selecionados.length} item(ns)?</span>
                <button className="btn red sm" onClick={() => void aplicar()}>Confirmar</button>
                <button className="btn sec sm" onClick={() => setConfirmando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <select value={acao} aria-label="Ação" onChange={(e) => setAcao(e.target.value as AcaoFila | '')}>
                  <option value="">Ação…</option>
                  {(Object.keys(ROTULO) as AcaoFila[]).map((k) => <option key={k} value={k}>{ROTULO[k]}</option>)}
                </select>
                <button className="btn sm" disabled={!acao || !sel.algum} onClick={() => setConfirmando(true)}>
                  Aplicar{sel.algum ? ` (${sel.selecionados.length})` : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <DataTable hasRows={lista.items.length > 0} empty="Nenhum item na fila." selecao={lista.items.length ? sel : undefined}
        cols={[
          <button key="item" className="thbtn" title="Reordenar pelo timestamp" onClick={() => { setOrdem(ordem === 'oldest' ? 'recent' : 'oldest'); irPara(1); }}>
            Referência <span aria-hidden>{ordem === 'oldest' ? '▲ mais antigo' : '▼ mais recente'}</span>
          </button>, 'Status', 'JOB', 'Log', 'Timestamp']}>
        {lista.items.map((f) => (
          <tr key={f.id}>
            <td><input type="checkbox" aria-label="Selecionar item" checked={sel.tem(f.id)} onChange={() => sel.alternar(f.id)} /></td>
            <td><Link className="lnk" to={`/fila/${f.id}`}>{f.referencia ?? '(sem referência)'}</Link></td>
            <td><Badge status={f.status} /></td>
            <td>{f.jobId ? <Link className="lnk" to={`/execucoes/${f.jobId}`}>#{f.jobId.slice(0, 6)}</Link> : '—'}</td>
            <td>{f.log}</td>
            <td title={`Atualizado em ${fmtData(f.atualizado)}`}>{fmtData(f.timestamp)}</td>
          </tr>
        ))}
      </DataTable>

      {lista.total > 0 && (
        <div className="bar" style={{ justifyContent: 'space-between', margin: '0.75rem 0 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--muted)' }}>
            Itens por página
            <select value={tamanho} onChange={(e) => { setTamanho(Number(e.target.value)); irPara(1); }}>
              {TAMANHOS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>{ini + 1}–{ini + lista.items.length} de {lista.total}</span>
          <div className="bar" style={{ margin: 0 }}>
            <button className="btn sec sm" disabled={pagina <= 1} onClick={() => irPara(pagina - 1)}>‹ Anterior</button>
            <span style={{ fontSize: '0.875rem' }}>Página {pagina} de {paginas}</span>
            <button className="btn sec sm" disabled={pagina >= paginas} onClick={() => irPara(pagina + 1)}>Próxima ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
