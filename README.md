# Student Support Hub (EAR)

Sistema de registros de comportamento da EAR: React + Firebase (Auth, Firestore, Functions, Hosting).

Interface: React + Framer Motion, tema claro/escuro automático, bilíngue EN/PT, responsiva. Fontes servidas pelo próprio site (sem requisições externas).

## Estrutura

```
firestore.rules        Controle de acesso (ADMIN x TEACHER). É aqui que mora a segurança.
firebase.json          Hosting, Functions, Firestore e emuladores
functions/             Backend: login restrito e registros (criar, listar histórico, anular)
  src/logs.ts          Validação, permissões por turma e recálculo das contagens
web/                   Front-end (Vite + React + TS), bilíngue EN/PT
scripts/
  import-roster.ts     Importa alunos, turmas e equipe a partir de CSVs da escola
  seed-emulator.ts     Dados fictícios para desenvolvimento
  templates/           Modelos dos CSVs (dados fictícios)
tests/                 Testes das regras (critérios de aceitação do handoff)
```

## Rodar local (sem nuvem)

Requisitos: Node 22 e Java 17+ (para os emuladores).

```bash
npm run setup          # instala tudo
npm run emulators      # terminal 1: Auth, Firestore, Functions (UI em http://127.0.0.1:4000)
npm run seed           # terminal 2: dados fictícios
npm run dev            # terminal 3: app em http://localhost:5173
```

No login, escolha "Add new account" no popup do emulador e use:
`admin@ear.com.br` (ADMIN), `prof.ana@ear.com.br` (turmas 6A e 7A) ou `prof.bruno@ear.com.br` (turma 8A).

Testes: `npm test` (validação dos registros + regras de acesso).

## Colocar no ar

1. **Criar o projeto** no console do Firebase e ativar o plano Blaze (necessário para Functions).
2. **Firestore**: criar em modo produção na região **`southamerica-east1`**. A região não pode ser mudada depois.
3. **Authentication**: ativar o provedor Google. Fazer o upgrade para **Identity Platform** (ativa as blocking functions que barram contas de fora do domínio ou fora do cadastro). Em domínios autorizados, manter só os necessários.
4. **App Web**: registrar um app Web e copiar a configuração para `web/.env.local` (modelo em `web/.env.example`, com `VITE_USE_EMULATORS=false`).
5. **Projeto local**: `cp .firebaserc.example .firebaserc` e trocar o ID; `npx firebase login`.
6. **Configuração no Firestore** (pelo console): `config/app` → `{ secondaryOffice: "secondary.office@ear.com.br" }`
7. **Seu acesso de ADMIN** (pelo console): `staff/seu.email@ear.com.br` → `{ name, role: "admin", active: true, sectionIds: [] }`
8. **Importar dados** (máquina da TI, CSVs fora do repositório):
   ```bash
   gcloud auth application-default login
   GCLOUD_PROJECT=SEU-ID npm run import-roster -- --students alunos.csv --sections turmas.csv --staff equipe.csv --dry-run
   GCLOUD_PROJECT=SEU-ID npm run import-roster -- --students alunos.csv --sections turmas.csv --staff equipe.csv --confirm
   ```
9. **Deploy**: `npm run deploy`.
10. **Verificar**: abrir o site em janela anônima, entrar com conta de fora do cadastro (deve ser recusada) e criar um registro de teste.

## Papéis e acesso

| Papel | Busca alunos | Registra | Histórico | Contagens |
|---|---|---|---|---|
| `admin` | todos | sim | todos | todas |
| `teacher` | todos | sim | anos em `historyGrades`; ou anos em `grades` com `wholeGradeAccess` ou turma em `classes` | só com `canSeeCounts` (Learning Support) |
| `psychologist` | todos | sim | anos em `grades` | onde vê o histórico |
| `substitute` | todos | sim | não | não |
| `office` | todos | não (somente leitura) | não | não |

Os e-mails dos responsáveis nunca vão para o navegador de quem não é ADMIN: o rascunho do Gmail é montado pelo servidor (function `createlog`).

## Importar a versão 88 (site anterior)

Roda na máquina da TI, lendo a pasta `data/` do pacote v88. Os dados não entram no Git.

```bash
# 1) validar (não grava nada)
npm run import-v88 -- --data "CAMINHO/Student-Support-Hub/data" --worker "CAMINHO/Student-Support-Hub/worker/index.template.js"
# 2) gravar em produção
gcloud auth application-default login
$env:GCLOUD_PROJECT="ear-student-hub"     # PowerShell
npm run import-v88 -- --data "..." --worker "..." --confirm
```

Importa alunos (ativos e arquivados), contatos, nomes dos responsáveis, equipe com papéis e acessos, contagens-base e os eventos datados do Drive (como histórico, sem contar em dobro). É idempotente.

Fotos: `--with-photos` (tudo + fotos) ou `--photos-only` (só as fotos, sem mexer no resto). Exige o Storage ativado no projeto.
Atenção: rodar a importação completa de novo sobrescreve alunos e contatos editados pela tela "Gerenciar alunos". Depois de começar a usar a tela, use só `--photos-only`.

## Fotos, registro coletivo e gerenciar alunos

- Fotos ficam no Storage em `student-photos/{id}`. Qualquer pessoa da equipe com acesso ativo vê (regras em `storage.rules`); só o ADMIN envia ou remove, pela tela (máx. 250 KB, redimensionada no navegador).
- Registro coletivo: 2 a 25 alunos, uma mensagem (use `{{name}}`), um registro e um rascunho por família.
- Gerenciar alunos (ADMIN): adicionar, editar (com proteção contra edição simultânea), arquivar e restaurar.

## Registros (logs)

- O registro é salvo na plataforma (coleção `logs`) quando o professor clica em "Salvar registro e abrir Gmail".
- Quem cria é a function `createlog`: ela valida os dados e define autor, data e turmas do aluno. O navegador não grava nada direto.
- O professor vê o histórico só dos alunos das suas turmas (function `liststudentlogs`), sem contagens.
- Anular (não apaga): ADMIN a qualquer momento; o autor até 60 minutos depois.
- Contagem = base importada da versão anterior + registros feitos na plataforma. Recalculada do zero a cada criação ou anulação, então nunca conta em dobro.

## Modelo de dados

| Coleção | Conteúdo | Quem lê |
|---|---|---|
| `staff/{email}` | papel, turmas, ativo | a própria pessoa; ADMIN |
| `students/{id}` | nome, ano, turmas | equipe autorizada |
| `studentContacts/{id}` | e-mails de responsáveis e aluno | equipe autorizada |
| `studentCounts/{id}`, `stats/school` | contagens e totais | **só ADMIN** |
| `logs/{id}` | registro: aluno, categoria, mensagem, destinatários, autor, data | ADMIN direto; professor via function, só das suas turmas |
| `sections` | turmas e professores | só ADMIN |

Nenhum cliente escreve no banco. Toda escrita vem das functions ou do script de importação.

## Pendências com a escola

- ID estável do aluno e sistema de origem de alunos, turmas e e-mails de responsáveis.
- Aprovação do encarregado (DPO) para guardar o texto dos registros e prazo de retenção.
- Lista de ADMINs, retenção e auditoria (LGPD, com o encarregado).