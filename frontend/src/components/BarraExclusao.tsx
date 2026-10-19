import { useEffect, useState } from 'react';

interface Props { quantidade: number; onConfirmar: () => void }

/** Botão "Excluir (N)" acima da tabela; ao clicar, pede a confirmação na própria barra. */
export function BarraExclusao({ quantidade, onConfirmar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => { if (!quantidade) setConfirmando(false); }, [quantidade]);

  if (confirmando) {
    return (
      <div className="bar" style={{ margin: 0 }}>
        <span style={{ fontSize: '0.875rem' }}>Excluir {quantidade} {quantidade > 1 ? 'itens' : 'item'}?</span>
        <button className="btn red sm" onClick={() => { onConfirmar(); setConfirmando(false); }}>Confirmar exclusão</button>
        <button className="btn sec sm" onClick={() => setConfirmando(false)}>Cancelar</button>
      </div>
    );
  }
  return (
    <button className="btn red sm" disabled={!quantidade} onClick={() => setConfirmando(true)}>
      Excluir{quantidade ? ` (${quantidade})` : ''}
    </button>
  );
}
