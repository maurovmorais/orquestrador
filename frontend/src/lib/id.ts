export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const chavePareamento = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0'))
    .join('').toUpperCase().match(/.{1,6}/g)!.join('-');
