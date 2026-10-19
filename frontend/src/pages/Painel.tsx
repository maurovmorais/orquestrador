import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { useData } from '../context/DataContext';
import { fmtData } from '../lib/format';
import { listarExecucoes, type Execucao } from '../services/recursos';

export default function Painel() {
  const { data: d, atual } = useData();
  const [recentes, setRecentes] = useState<Execucao[]>([]);
  const [ativas, setAtivas] = useState(0);
  const online = d.machines.filter((m) => m.online).length;

  const carregar = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([listarExecucoes(atual.id, { pageSize: 10 }), listarExecucoes(atual.id, { pageSize: 1, ativos: true })]);
      setRecentes(r.items); setAtivas(a.total);
    } catch { /* mantém os últimos valores */ }
  }, [atual.id]);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 5000); return () => clearInterval(t); }, [carregar]);

  return (
    <>
      <h1>Painel</h1>
      <div className="stats">
        <div className="card stat"><span>Máquinas online</span><b>{online} <small>/ {d.machines.length}</small></b></div>
        <div className="card stat"><span>Execuções ativas</span><b>{ativas}</b></div>
        <div className="card stat"><span>Execuções recentes</span><b>{recentes.length}</b></div>
      </div>
      <h2>Últimas execuções</h2>
      <DataTable cols={['Automação', 'Versão', 'Máquina', 'Status', 'Enfileirada', 'Finalizada']} hasRows={recentes.length > 0} empty="Nenhuma execução.">
        {recentes.map((r) => (
          <tr key={r.id}>
            <td><Link className="lnk" to={`/execucoes/${r.id}`}>{r.excluida ? '(excluída)' : r.automacao}</Link></td>
            <td>v{r.versao}</td><td>{r.maquina ?? '—'}</td><td><Badge status={r.status} /></td>
            <td>{fmtData(r.enfileirada)}</td><td>{fmtData(r.finalizada)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
