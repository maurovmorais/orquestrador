/** Validação simples: 5 campos (min hora dia mês dia-da-semana). */
export const cronValido = (s: string): boolean => {
  const p = s.trim().split(/\s+/);
  return p.length === 5 && p.every((x) => /^[\d*/,\-?LW#A-Za-z]+$/.test(x));
};
