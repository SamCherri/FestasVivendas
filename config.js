// v7 - Sheets backend
const CONFIG = {
  halls: ['Gourmet', 'Menor'],
  apiUrl: 'https://script.google.com/macros/s/XXXX/exec',         // ex.: https://script.google.com/macros/s/XXXX/exec
  apiKey: '29913256989517',     // o mesmo definido no Apps Script
  deleteRequiresSindico: false,
  users: [
    { username: 'zelador',    password: '123456', role: 'zelador' },
    { username: 'sindico',    password: '123456', role: 'sindico' },
    { username: 'encarregado',password: '123456', role: 'encarregado' },
  ]
};