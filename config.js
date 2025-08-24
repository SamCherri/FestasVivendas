// Configurações (sem banco de dados) — edite aqui
const CONFIG = {
  storageKey: 'vls_festas_v4',
  halls: ['Salão de Festas 1', 'Salão de Festas 2', 'Churrasqueira', 'Salão Gourmet'],
  deleteRequiresSindico: false, // true => só síndico pode excluir
  users: [
    { username: 'zelador',    password: '123456', role: 'zelador' },
    { username: 'sindico',    password: '123456', role: 'sindico' },
    { username: 'encarregado',password: '123456', role: 'encarregado' },
  ]
};