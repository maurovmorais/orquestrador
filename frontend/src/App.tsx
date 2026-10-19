import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataProvider } from './context/DataContext';
import AutomacaoDetalhe from './pages/AutomacaoDetalhe';
import Automacoes from './pages/Automacoes';
import Ativos from './pages/Ativos';
import Agendamentos from './pages/Agendamentos';
import Execucoes from './pages/Execucoes';
import Fila from './pages/Fila';
import ItemFilaDetalhe from './pages/ItemFilaDetalhe';
import ExecucaoDetalhe from './pages/ExecucaoDetalhe';
import Login from './pages/Login';
import Maquinas from './pages/Maquinas';
import Painel from './pages/Painel';
import Workspaces from './pages/Workspaces';
import { authService } from './services/auth';
import type { Usuario } from './types';

export default function App() {
  const [user, setUser] = useState<Usuario | null | undefined>(undefined); // undefined = verificando a sessão
  useEffect(() => { authService.me().then(setUser).catch(() => setUser(null)); }, []);
  const sair = useCallback(() => { void authService.logout(); setUser(null); }, []);

  if (user === undefined) return <div className="login">Carregando…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <DataProvider onSessaoExpirada={sair}>
      <Routes>
        <Route element={<Layout user={user} onLogout={sair} />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="painel" element={<Painel />} />
          <Route path="maquinas" element={<Maquinas />} />
          <Route path="automacoes" element={<Automacoes />} />
          <Route path="automacoes/:id" element={<AutomacaoDetalhe />} />
          <Route path="fila" element={<Fila />} />
          <Route path="fila/:id" element={<ItemFilaDetalhe />} />
          <Route path="execucoes" element={<Execucoes />} />
          <Route path="execucoes/:id" element={<ExecucaoDetalhe />} />
          <Route path="agendamentos" element={<Agendamentos />} />
          <Route path="ativos" element={<Ativos />} />
          <Route path="ambientes" element={<Workspaces />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
