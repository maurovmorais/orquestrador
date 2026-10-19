import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { useData } from '../context/DataContext';
import { fmtData } from '../lib/format';
import { logsExecucao, obterExecucao, type Execucao, type LinhaLog } from '../services/recursos';

const Info = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <div className="card"><div style={{ color: 'var(--muted)', marginBottom: 8 }}>{rotulo}</div><div style={{ fontSize: 18, fontWeight: 500 }}>{children}</div></div>
);

export default function ExecucaoDetalhe() {
  const { id = '' } = useParams();
  const { atual } = useData();
  const [exec, setExec] = useState<Execucao | null | undefined>(undefined); // undefined = carregando, null = não encontrada
  const [logs, setLogs] = useState<LinhaLog[]>([]);
  const painel = useRef<HTMLDivElement>(null);
  const ativo = exec?.status === 'em execução' || exec?.status === 'cancelando';

  const carregar = useCallback(async () => {
    try {
      const [e, l] = await Promise.all([obterExecucao(atual.id, id), logsExecucao(atual.id, id)]);
      setExec(e); setLogs(l);
    } catch { setExec(null); }
  }, [atual.id, id]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (!ativo) return; const t = setInterval(() => void carregar(), 3000); return () => clearInterval(t); }, [ativo, carregar]); // acompanha o log enquanto roda
  useEffect(() => { if (painel.current) painel.current.scrollTop = painel.current.scrollHeight; }, [logs.length]);

  if (exec === undefined) return <div style={{ color: 'var(--muted)' }}>Carregando…</div>;
  if (!exec) return (<><h1>Execução não encontrada</h1><Link className="lnk" to="/execucoes">← Voltar para Execuções</Link></>);

  return (
    <>
      <Link className="lnk" to="/execucoes">← Voltar para Execuções</Link>
      <h1 style={{ marginTop: 10 }}>{exec.excluida ? '(automação excluída)' : exec.automacao} <span className="v" style={{ fontWeight: 400 }}>v{exec.versao}</span></h1>
      <div className="stats">
        <Info rotulo="Status"><Badge status={exec.status} /></Info>
        <Info rotulo="Máquina">{exec.maquina ?? '—'}</Info>
        <Info rotulo="Iniciada">{fmtData(exec.iniciada)}</Info>
        <Info rotulo="Finalizada">{fmtData(exec.finalizada)}</Info>
      </div>
      <div className="card" style={{ marginTop: 22 }}>
        <h2 style={{ marginTop: 0 }}>Logs</h2>
        <div className="logbox" ref={painel}>
          {logs.length === 0 && <span className="t">Nenhum log registrado para esta execução.</span>}
          {logs.map((l, i) => (
            <div key={i}>
              <span className="t">{new Date(l.ts).toLocaleTimeString('pt-BR')}</span>{' '}
              <span className={l.level}>[{l.source}:{l.level}]</span> {l.message}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
