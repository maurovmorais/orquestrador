import { useState, type FormEvent } from 'react';
import { mensagem } from '../services/api';
import { authService } from '../services/auth';
import type { Usuario } from '../types';

export default function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setErro('');
    try { onLogin(await authService.login(email.trim(), senha)); }
    catch (err) { setErro(mensagem(err)); setEnviando(false); }
  };

  return (
    <div className="login"><div className="card">
      <form onSubmit={(e) => void enviar(e)}>
        <h1>Orquestrador</h1><p>Entre para gerenciar suas automações.</p>
        <label>E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        <label>Senha</label><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
        {erro && <p className="err" style={{ marginTop: 10 }}>{erro}</p>}
        <button className="btn" type="submit" disabled={enviando || !email || !senha}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div></div>
  );
}
