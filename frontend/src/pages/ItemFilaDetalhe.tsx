import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { useData } from '../context/DataContext';
import { fmtData } from '../lib/format';
import { obterItemFila, type ItemDetalhe } from '../services/recursos';

const Info = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <div className="card"><div style={{ color: 'var(--muted)', marginBottom: 8 }}>{rotulo}</div><div style={{ fontSize: 18, fontWeight: 500 }}>{children}</div></div>
);

/** Valor de um campo do item, em texto: objetos e listas aparecem como JSON. */
const texto = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Tela aberta pelo link da coluna Referência: mostra os dados do item, uma linha por campo ("Nome: Mauro"). */
export default function ItemFilaDetalhe() {
  const { id = '' } = useParams();
  const { atual } = useData();
  const [item, setItem] = useState<ItemDetalhe | null | undefined>(undefined); // undefined = carregando, null = não encontrado

  const carregar = useCallback(async () => {
    try { setItem(await obterItemFila(atual.id, id)); } catch { setItem(null); }
  }, [atual.id, id]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (item === undefined) return <div style={{ color: 'var(--muted)' }}>Carregando…</div>;
  if (!item) return (<><h1>Item não encontrado</h1><Link className="lnk" to="/fila">← Voltar para Fila</Link></>);

  const campos = Object.entries(item.dados);
  return (
    <>
      <Link className="lnk" to="/fila">← Voltar para Fila</Link>
      <h1 style={{ marginTop: 10 }}>{item.referencia ?? '(sem referência)'}</h1>
      <div className="stats">
        <Info rotulo="Status"><Badge status={item.status} /></Info>
        <Info rotulo="Automação">{item.automacao ?? '—'}</Info>
        <Info rotulo="JOB">{item.jobId ? <Link className="lnk" to={`/execucoes/${item.jobId}`}>#{item.jobId.slice(0, 6)}</Link> : '—'}</Info>
        <Info rotulo="Timestamp">{fmtData(item.timestamp)}</Info>
      </div>
      <div className="card" style={{ marginTop: 22 }}>
        <h2 style={{ marginTop: 0 }}>Dados do item</h2>
        <div className="dados">
          {campos.length === 0 && <span style={{ color: 'var(--muted)' }}>Este item não tem dados.</span>}
          {campos.map(([k, v]) => <div key={k}><span className="k">{k}:</span> {texto(v)}</div>)}
        </div>
      </div>
      <div className="card" style={{ marginTop: 22 }}>
        <h2 style={{ marginTop: 0 }}>Processamento</h2>
        <div className="dados">
          <div><span className="k">Log:</span> {item.log || '—'}</div>
          {item.erro && <div><span className="k">Erro:</span> {item.erro}</div>}
          <div><span className="k">Tentativas:</span> {item.tentativas}</div>
          <div><span className="k">Atualizado em:</span> {fmtData(item.atualizado)}</div>
          {item.finalizado && <div><span className="k">Finalizado em:</span> {fmtData(item.finalizado)}</div>}
        </div>
      </div>
    </>
  );
}
