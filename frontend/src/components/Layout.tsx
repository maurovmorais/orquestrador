import { NavLink, Outlet } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { rotulo } from '../domain/workspaces';
import type { Usuario } from '../types';

const MENU: [string, string][] = [
  ['/painel', 'Painel'], ['/ambientes', 'Ambientes'], ['/maquinas', 'Máquinas'], ['/automacoes', 'Automações'], ['/fila', 'Fila'],
  ['/execucoes', 'Execuções'], ['/agendamentos', 'Agendamentos'], ['/ativos', 'Ativos'],
];

export function Layout({ user, onLogout }: { user: Usuario; onLogout: () => void }) {
  const { workspaces, atual, selecionar } = useData();
  return (
    <div className="app">
      <nav className="side">
        <div className="brand">⚙ Orquestrador</div>
        {MENU.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>
        ))}
        <div className="sp" />
        <div className="userbox"><b>{user.cliente}</b><span>{user.login}</span></div>
        <button onClick={onLogout}>Sair</button>
      </nav>
      <main>
        <div className="topbar">
          <label htmlFor="sel-ambiente" className="toplabel">Ambiente</label>
          <select id="sel-ambiente" className={`wsel ${atual.ambiente === 'produção' ? 'prod' : 'hml'}`}
            value={atual.id} onChange={(e) => selecionar(e.target.value)}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{rotulo(w)}</option>)}
          </select>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
