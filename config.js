// Configurações do modelo (sem banco de dados)
// ATENÇÃO: credenciais ficam visíveis no código. Não use para dados sensíveis.
const CONFIG = {
  storageKey: 'vls_festas_v2',
  halls: ['Salão de Festas 1', 'Salão de Festas 2', 'Churrasqueira', 'Salão Gourmet'],
  deleteRequiresSindico: false, // se true, somente 'sindico' pode excluir
  users: [
    { username: 'zelador', password: '123456', role: 'zelador' },
    { username: 'sindico', password: '123456', role: 'sindico' },
    { username: 'encarregado', password: '123456', role: 'encarregado' },
  ]
};