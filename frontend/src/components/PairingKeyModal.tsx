import { useState } from 'react';

interface Props { nome: string; chave: string; onClose: () => void }

/** A chave só existe em memória: ao fechar, não há como vê-la novamente. */
export function PairingKeyModal({ nome, chave, onClose }: Props) {
  const [copiada, setCopiada] = useState(false);
  const copiar = () => navigator.clipboard?.writeText(chave).then(() => setCopiada(true), () => setCopiada(false));
  return (
    <div className="ov">
      <div className="card modal" role="dialog" aria-modal="true">
        <h2 style={{ marginTop: 0 }}>Chave de pareamento</h2>
        <div style={{ color: 'var(--muted)' }}>Máquina: <b>{nome}</b></div>
        <div className="keybox">{chave}</div>
        <p className="warn">
          Copie e guarde esta chave agora. Ela é exibida <b>uma única vez</b> e não poderá ser consultada depois que
          esta janela for fechada. Se a perder, será necessário gerar um novo pareamento.
        </p>
        <div className="bar" style={{ margin: 0, justifyContent: 'flex-end' }}>
          <button className="btn sec" onClick={copiar}>{copiada ? 'Copiada ✓' : 'Copiar'}</button>
          <button className="btn" onClick={onClose}>Já guardei a chave, fechar</button>
        </div>
      </div>
    </div>
  );
}
