# Vivendas de La Salles — Festas (Site estático, sem banco de dados)

**Uso interno.** Não há servidor nem banco de dados; os dados ficam **no navegador (localStorage)** do dispositivo.  
Se abrir em outro celular/computador, não verá os mesmos dados.

> Login aqui é apenas para organizar o acesso (não é seguro). As credenciais ficam no arquivo `config.js`.

## Estrutura
```
vivendas-festas-static/
├─ index.html
├─ style.css
├─ app.js
└─ config.js
```

## Como usar (GitHub Pages)
1. Crie um repositório no GitHub (ex.: `vivendas-festas-static`).
2. Envie estes arquivos para a raiz do repositório.
3. No GitHub, vá em **Settings → Pages → Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (pasta `/root`)
4. Acesse o link gerado pelo GitHub Pages. Abra no celular e faça login.

### Login (padrão — altere em `config.js`)
- Usuário: `zelador` / Senha: `123456`
- Usuário: `sindico` / Senha: `123456`
- Usuário: `encarregado` / Senha: `123456`

## Funções
- Cadastrar, editar, excluir festas.
- Filtros por **data** e **salão**.
- Detalhes rápidos (botão **Ver**).
- **Exportar** e **Importar** JSON (útil para trocar dados entre dispositivos).
- **Checagem de conflito**: alerta se houver outra festa no mesmo salão, mesma data e horário que se sobrepõe.
- Opção de restringir exclusão só ao síndico (`deleteRequiresSindico` em `config.js`).

## Limitações
- Sem banco/servidor: dados ficam somente no **dispositivo** (navegador). Se limpar histórico/armazenamento, perde os registros.
- Login não é seguro (as senhas estão no JavaScript). Não use para dados sensíveis.

## Próximos passos (opcionais)
- Migrar para back-end real (Flask/Django/Node) com banco de dados.
- Autenticação real e controle de permissões por usuário.
- Relatórios e exportação CSV automática.
