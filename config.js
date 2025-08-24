// Mantive a mesma storageKey de v5 para não perder dados existentes.
const CONFIG = {
  storageKey: 'vls_festas_v5',
  halls: ['Gourmet', 'Menor'],
  deleteRequiresSindico: false,
  users: [
    { username: 'zelador',    password: '123456', role: 'zelador' },
    { username: 'sindico',    password: '123456', role: 'sindico' },
    { username: 'encarregado',password: '123456', role: 'encarregado' },
  ]
};