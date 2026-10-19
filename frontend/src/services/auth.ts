import type { Usuario } from '../types';
import { api } from './api';

interface RespostaUsuario { id: string; email: string; cliente: string }
const paraUsuario = (u: RespostaUsuario): Usuario => ({ login: u.email, cliente: u.cliente });

export const authService = {
  login: async (email: string, senha: string): Promise<Usuario> => paraUsuario(await api<RespostaUsuario>('/auth/login', { body: { email, password: senha } })),
  me: async (): Promise<Usuario> => paraUsuario(await api<RespostaUsuario>('/auth/me')),
  logout: async (): Promise<void> => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined); },
};
