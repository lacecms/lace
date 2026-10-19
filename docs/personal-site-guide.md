# Личный сайт на Lace: рабочий путь до релиза MVP

Внутренний разбор ручного source-workspace сценария от 30 сентября 2026 года.
Исторические команды ниже сохраняются как пример разработки движка, а не
актуальный consumer quickstart. Для новой установки используй
[публичную документацию](https://lacecms.github.io/lace/en/latest/getting-started/)
и guides сгенерированного проекта. Обновление до alpha.7 с картинками описано в
[compatibility](./compatibility.md#alpha-7-upgrade-and-rollback): пакеты, компоненты
сайта, синхронизация схем и deployment-файлы должны быть согласованы.
Alpha.6 опубликована; alpha.7 пока готовится, её сборка не означает публикацию.

## Что именно ты используешь

Lace — headless CMS. В `lace.config.ts` ты описываешь структуру, в админке заполняешь контент, Astro собирает HTML. Генератор `create-lace` создаёт проект; генератором статики является Astro. Одна установка Lace обслуживает один сайт.

Для примера получатся адреса:

- `/` — главная;
- `/contacts` — контакты;
- `/works` — список работ;
- `/works/my-project` — отдельная работа.

`home` и `contacts` — singleton-модели страниц. `works` — коллекция. Список `/works` создаёт код Astro: наличие коллекции само по себе не создаёт страницу списка.

Твой отдельный репозиторий содержит `site/**`, `lace.config.ts`, зависимости и инфраструктуру. Исходники движка и админки в него переносить не нужно. Установить CMS прямо в непустой проект нельзя, но с шаблона `0.11.0` (30E) существующий Astro-сайт подключается без копирования стартера: в корне сайта создай CMS в подкаталоге командой `create-lace cms --existing-site ..` (каталог `site/` не создаётся, сайт генератор не меняет), затем из `cms/` выполни `pnpm exec lace add block --all --site ..` и следуй `docs/lace-astro-site.md`. Флаг `--no-site` создаёт только CMS без сайта, `--starter` — пример сайта в `site/`. Без флага генератор в терминале спрашивает режим, а без терминала создаёт стартер. Этот гайд использует стартер.

## 1. Создай проект из текущего репозитория

Публичные `@lacecms/*` и `create-lace` уже выпускаются согласованными альфами.
Проверка npm/GHCR от 19 октября 2026 года подтверждает доступность alpha.6;
текущий кандидат — alpha.7/template 0.35.0. Для установки выбирай явно
опубликованную версию и matching images. Ниже оставлен путь локальной сборки
и tarballs для работы с исходниками; он не нужен обычному потребителю.

Нужны Node `>=24.12.0` и pnpm `>=12` (минимумы; проверено на Node `24.12.0` и pnpm `12.3.4`), а для VPS — Docker Compose. Каталог назначения должен быть новым либо содержать только `.git`, `README.md`, `LICENSE`.

Из репозитория Lace:

```sh
cd /Users/jentix/Dev/lace
pnpm install --frozen-lockfile
pnpm build
node packages/create-lace/dist/bin.js create /Users/jentix/Dev/my-portfolio --starter --cloudflare
```

Флаг `--cloudflare` добавляет Pages-конфиг и ручной workflow; VPS Compose тоже остаётся. Он **не создаёт CMS Worker**.

Для пустого существующего репозитория:

```sh
cd /Users/jentix/Dev/my-portfolio
node /Users/jentix/Dev/lace/packages/create-lace/dist/bin.js init . --starter --cloudflare
```

### Установи локальные пакеты

В новом проекте создай `scripts/install-local-lace.mjs` со следующим содержимым. Это временный путь потребления unreleased-пакетов. Скрипт пакует граф зависимостей, копирует архивы внутрь проекта и настраивает относительные ссылки, включая транзитивные зависимости. Простого `pnpm add /path/to/sdk.tgz` недостаточно: другие `@lacecms/*` тоже пока недоступны как release-зависимости.

```js
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";

const engine = resolve(process.argv[2]);
const project = process.cwd();
const artifacts = join(project, ".lace/packages");
await mkdir(artifacts, { recursive: true });
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const root = await readJson(join(project, "package.json"));
const site = await readJson(join(project, "site/package.json"));

// Эти два дополнительных прямых импорта понадобятся для ручной Worker-композиции.
root.dependencies["@lacecms/platform-cloudflare"] = "0.0.0";
root.dependencies["@lacecms/db"] = "0.0.0";

const pending = Object.keys({ ...root.dependencies, ...site.dependencies })
  .filter((name) => name.startsWith("@lacecms/"));
const seen = new Set();
const references = new Map();
while (pending.length) {
  const name = pending.pop();
  if (seen.has(name)) continue;
  seen.add(name);
  const directory = join(engine, "packages", name.slice("@lacecms/".length));
  const metadata = await readJson(join(directory, "package.json"));
  if (metadata.name !== name) throw new Error(`Wrong package: ${name}`);
  pending.push(...Object.keys(metadata.dependencies ?? {})
    .filter((dependency) => dependency.startsWith("@lacecms/")));
  const result = spawnSync("pnpm", ["pack", "--pack-destination", artifacts, "--json"],
    { cwd: directory, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Pack failed: ${name}\n${result.stderr}`);
  const packed = JSON.parse(result.stdout);
  references.set(name, `file:.lace/packages/${basename(packed.filename)}`);
}
for (const [metadata, path, prefix] of [
  [root, join(project, "package.json"), "file:"],
  [site, join(project, "site/package.json"), "file:../"],
]) {
  for (const section of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(metadata[section] ?? {})) {
      if (references.has(name)) {
        metadata[section][name] = references.get(name).replace("file:", prefix);
      }
    }
  }
  await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`);
}
const workspacePath = join(project, "pnpm-workspace.yaml");
const yaml = await readFile(workspacePath, "utf8");
if (/^overrides:/m.test(yaml)) throw new Error("Overrides already exist; review manually.");
const overrides = [...references]
  .filter(([name]) => name !== "@lacecms/sdk")
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, value]) => `  '${name}': '${value}'`).join("\n");
await writeFile(workspacePath, `${yaml}\noverrides:\n${overrides}\n`);
// Acceptance тоже использует engine lockfile как основу, затем пересчитывает его.
await copyFile(join(engine, "pnpm-lock.yaml"), join(project, "pnpm-lock.yaml"));
```

Запусти **один раз на свежем проекте**:

```sh
cd /Users/jentix/Dev/my-portfolio
node scripts/install-local-lace.mjs /Users/jentix/Dev/lace
pnpm install --no-frozen-lockfile
```

Сохрани `pnpm-lock.yaml` и `.lace/packages/*.tgz` вместе с проектом: архивы понадобятся VPS builder и CI. Не используй абсолютные ссылки на исходный Lace workspace. Скрипт выше — пример адаптации существующего acceptance-механизма, отдельной поддерживаемой CLI-командой он не является.

Root `package.json` и `pnpm-workspace.yaml` — managed-файлы. Этот временный обход меняет их; будущий `lace upgrade` может показать конфликты. Не исправляй manifest hashes так, будто эти локальные изменения были исходным шаблоном.

## 2. Опиши модели до первого заполнения CMS

Замени `lace.config.ts`:

```ts
import { defineConfig, definePage, defineCollection } from "@lacecms/config";
import { field } from "@lacecms/content";

export default await defineConfig({
  content: [
    definePage({
      key: "home", version: 1, label: "Главная", path: "/",
      fields: { intro: field.textarea({ required: true }) },
    }),
    definePage({
      key: "contacts", version: 1, label: "Контакты", path: "/contacts",
      fields: {
        email: field.text({ required: true }),
        note: field.textarea(),
        profileUrl: field.url(),
      },
    }),
    defineCollection({
      key: "works", version: 1, label: "Работы", route: "/works/:slug",
      fields: {
        summary: field.textarea({ required: true }),
        description: field.textarea(),
        projectUrl: field.url(),
        cover: field.media(),
        order: field.number(),
      },
      listFields: ["order", "summary"],
    }),
  ],
});
```

`title` — встроенное обязательное поле; у работы также есть встроенный `slug`. Повторно определять их в `fields` не нужно. Email здесь текстовый: специального email field нет. Slug должен состоять из латинских строчных букв, цифр и одиночных дефисов, например `my-project`.

Пример использует структурированные поля: они сразу дают достаточный сайт. Если нужны hero/richText/image/quote/cta, зарегистрируй `builtInBlocks` и разрешённые `blocks` в моделях **до создания контента**. В текущем sync структурное изменение модели с сохранёнными snapshots блокируется даже с увеличенной `version`; универсальной миграции заполненного контента пока нет.

## 3. Напиши Astro-страницы

Конфигурация маршрута в CMS не создаёт Astro-файл. Удали шаблонный `site/src/pages/blog/`, иначе он продолжит запрашивать отсутствующую модель `posts`.

Ниже используется один опубликованный build export на процесс сборки. Это даёт всем страницам один набор данных. Draft в него не попадает.

Создай `site/src/lib/cms.ts`:

```ts
import { createLaceClient } from "@lacecms/sdk";

const baseUrl = process.env.LACE_API_BASE_URL ?? process.env.LACE_PUBLIC_BASE_URL;
const token = process.env.LACE_BUILD_TOKEN;
if (!baseUrl || !token) throw new Error("Set LACE_API_BASE_URL and LACE_BUILD_TOKEN");
const client = createLaceClient({ baseUrl, token, timeoutMs: 30_000 });
const result = await client.getBuildExport();
if (!result.changed) throw new Error("Expected a published export");
if (process.env.LACE_EXPECTED_PUBLISHED_VERSION !== undefined &&
    result.export.version !== Number(process.env.LACE_EXPECTED_PUBLISHED_VERSION)) {
  throw new Error("Published version changed; retry build");
}

const entries = result.export.entries;
const publicBaseUrl = process.env.LACE_MEDIA_BASE_URL ??
  process.env.LACE_PUBLIC_BASE_URL ?? baseUrl;
const mediaClient = createLaceClient({ baseUrl: publicBaseUrl });
export const mediaUrl = (id: string) => mediaClient.getPublicMediaUrl(id);

// Export entries are published only: { id, modelKey, path, slug?, title, fields, blocks, publishedAt }.
export const media = result.export.media;

export function page(key: string) {
  const item = entries.find((item) => item.modelKey === key);
  if (!item) throw new Error(`Publish page ${key} first`);
  return item;
}
export const works = entries
  .filter((item) => item.modelKey === "works")
  .sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0)
    || a.title.localeCompare(b.title));
```

Токен используется только серверной сборкой; не импортируй этот модуль из клиентских scripts. Не добавляй токену префикс `PUBLIC_` или `VITE_`. Для запуска `pnpm dev`/`pnpm build` экспортируй `.env` в shell: пример ниже использует `process.env`, а не автоматическую загрузку всех переменных Astro.

Замени `site/src/pages/index.astro`:

```astro
---
import { page } from "../lib/cms";
import "../styles/global.css";
const home = page("home");
---
<html lang="ru">
  <head><meta charset="utf-8" /><title>{home.title}</title></head>
  <body>
    <nav><a href="/works">Работы</a> <a href="/contacts">Контакты</a></nav>
    <main><h1>{home.title}</h1><p>{String(home.fields.intro ?? "")}</p></main>
  </body>
</html>
```

Создай `site/src/pages/contacts.astro`:

```astro
---
import { page } from "../lib/cms";
const contacts = page("contacts");
const email = String(contacts.fields.email ?? "");
const profile = String(contacts.fields.profileUrl ?? "");
---
<html lang="ru">
  <head><meta charset="utf-8" /><title>{contacts.title}</title></head>
  <body><main>
    <a href="/">Главная</a><h1>{contacts.title}</h1>
    <a href={`mailto:${email}`}>{email}</a>
    <p>{String(contacts.fields.note ?? "")}</p>
    {profile && <a href={profile}>Профиль</a>}
  </main></body>
</html>
```

Создай `site/src/pages/works/index.astro`:

```astro
---
import { media, works, mediaUrl } from "../../lib/cms";
---
<html lang="ru">
  <head><meta charset="utf-8" /><title>Мои работы</title></head>
  <body><main>
    <a href="/">Главная</a><h1>Мои работы</h1>
    {works.map((work) => <article>
      <h2><a href={work.path}>{work.title}</a></h2>
      {typeof work.fields.cover === "string" && media[work.fields.cover] &&
        <img src={mediaUrl(work.fields.cover)} alt={media[work.fields.cover].alt ?? work.title}
          width={media[work.fields.cover].width ?? undefined}
          height={media[work.fields.cover].height ?? undefined} loading="lazy" />}
      <p>{String(work.fields.summary ?? "")}</p>
    </article>)}
  </main></body>
</html>
```

Создай `site/src/pages/works/[slug].astro`:

```astro
---
import { works, mediaUrl } from "../../lib/cms";
export function getStaticPaths() {
  return works.map((work) => ({ params: { slug: work.slug! }, props: { work } }));
}
const { work } = Astro.props;
const url = String(work.fields.projectUrl ?? "");
---
<html lang="ru">
  <head><meta charset="utf-8" /><title>{work.title}</title></head>
  <body><main>
    <a href="/works">Все работы</a><h1>{work.title}</h1>
    {typeof work.fields.cover === "string" &&
      <img src={mediaUrl(work.fields.cover)} alt={work.title} />}
    <p>{String(work.fields.description ?? work.fields.summary ?? "")}</p>
    {url && <a href={url}>Посмотреть проект</a>}
  </main></body>
</html>
```

Это минимальная функциональная вёрстка; общий layout, адаптивность и дизайн находятся в твоём `site/`. URL-поля проходят CMS-валидацию, обычный текст Astro экранирует.

### Если нужны контентные блоки

Начиная с шаблона `0.9.0` (30C), generated starter загружает и рендерит контент через пакеты `@lacecms/sdk`, `@lacecms/render` и `@lacecms/astro`. Loader находится в `site/src/lib/lace.ts` (`getSite()` даёт `byPath`, `entries`, `bySlug` и `mediaUrl`), пять компонентов блоков — в `site/src/components/lace/`, карта блоков — в `site/src/lace/blocks.ts`, версии и хэши установленных блоков — в `site/lace.site.json`. Вместо своего `cms.ts` можно читать страницы так: `const site = await getSite(); const home = site.byPath("/");`, а работы — через `site.entries("works")` и `site.bySlug("works", slug)`.

Блоки страницы выводи через `<LaceBlocks entry={entry} blocks={blocks} mediaUrl={site.mediaUrl} />` из `@lacecms/astro/LaceBlocks.astro`. Данные блоков проверяются правилами CMS до передачи в компонент, а rich text выводит `@lacecms/astro/RichText.astro` только через общий allowlist, без `set:html`. Custom block требует Astro-компонента и записи в `site/src/lace/blocks.ts`: экспортируй его `defineBlock` из модуля, который импортирует `lace.config.ts`, запиши путь к модулю (относительно `site/`) как `"definitions"` в `site/lace.site.json` и выполни `pnpm exec lace add block <type>` — команда создаст типизированный компонент-заготовку и добавит его в карту блоков. `pnpm exec lace add block --all` (с шаблона `0.10.0`, 30D) ставит и обновляет встроенные блоки; изменённые тобой файлы и карту она не перезаписывает, а показывает конфликт с diff. Админка даст generic-форму по metadata, но шаблон отображения остаётся твоим. С шаблона `0.23.0` (CE3C) компоненты блоков получают ещё `image(mediaId, usageAlt?)`: он возвращает `src`, итоговый `alt` (alt блока, иначе alt из Media, иначе пустая строка), `width`, `height` и `objectPosition` из focal point; вне блоков то же дают `site.image(id)` и `site.media(id)`.

## 4. VPS: собери runtime images

На машине сборки из engine repository:

```sh
cd /Users/jentix/Dev/lace
docker build -f apps/api/Dockerfile -t lace-api:portfolio .
docker build -f apps/builder/Dockerfile -t lace-builder:portfolio .
```

На VPS должны оказаться эти images и весь отдельный проект, включая tarballs и lockfile. Собери images на VPS из того же engine commit либо доставь через свой registry / `docker save` + `docker load`. Архитектура images должна соответствовать VPS; локальная ARM-сборка на Mac не обязательно подходит x86 VPS.

## 5. VPS: настрой окружение и подготовь CMS

В отдельном проекте скопируй `.env.example` в `.env`. Для локальной проверки:

```dotenv
LACE_PUBLIC_BASE_URL=http://127.0.0.1:3000/
LACE_API_BASE_URL=http://127.0.0.1:3000/
LACE_DATABASE_PATH=./.lace/data/lace.sqlite
LACE_API_IMAGE=lace-api:portfolio
LACE_BUILDER_IMAGE=lace-builder:portfolio
LACE_AUTH_SECRET=REPLACE_WITH_YOUR_RANDOM_SECRET
LACE_MINIO_ROOT_ACCESS_KEY=REPLACE_WITH_YOUR_ACCESS_KEY
LACE_MINIO_ROOT_SECRET=REPLACE_WITH_YOUR_RANDOM_SECRET
LACE_MINIO_BUCKET=lace-media
LACE_MINIO_REGION=us-east-1
LACE_BUILDER_SECRET=REPLACE_WITH_YOUR_RANDOM_SECRET
LACE_BUILD_TOKEN=
LACE_API_PORT=3000
LACE_HTTP_PORT=8080
```

Для auth/builder secrets сгенерируй разные длинные случайные значения, например `openssl rand -hex 32`; builder secret должен быть минимум 32 символа. До завершения setup оставь build token пустым: API subset стартует без него. Полный builder требует настоящего токена из Settings.

```sh
set -a
. ./.env
set +a
pnpm exec lace db migrate --target node
pnpm exec lace content sync --target node
pnpm exec lace auth bootstrap --target node
pnpm dev:api
```

Bootstrap выдаст одноразовый setup token. Отдельной setup-формы в текущей админке нет. Создай первого администратора HTTP-запросом. Сохрани временный локальный файл `setup-admin.json`:

```json
{
  "token": "TOKEN_FROM_BOOTSTRAP",
  "email": "you@example.com",
  "password": "YOUR_PASSWORD_AT_LEAST_12_CHARACTERS"
}
```

```sh
chmod 600 setup-admin.json
curl --fail-with-body http://127.0.0.1:3000/api/v1/setup/admin \
  -H 'Content-Type: application/json' --data-binary @setup-admin.json
rm setup-admin.json
```

Не коммить setup-файл. После успешной настройки endpoint закрывается. Открой `http://127.0.0.1:3000/admin/` и войди.

## 6. Заполни сайт и собери его локально

В админке:

1. Открой `Content`, создай/заполни главную: title и intro.
2. Создай/заполни контакты: title, email, note, profileUrl.
3. В коллекции «Работы» создай несколько записей: title, slug, summary, description, order, projectUrl.
4. Загрузи картинки в Media и выбери cover каждой работы.
5. Сохрани и **опубликуй** страницы и работы от имени admin. Editor сохраняет draft, но не публикует.
6. В Settings создай build token, скопируй единожды показанное значение в `.env`.

Перед локальной сборкой заново экспортируй обновлённый `.env`:

```sh
set -a
. ./.env
set +a
pnpm typecheck
pnpm build
pnpm dev
```

Готовая статика лежит в `site/dist`. Без опубликованных home/contacts пример намеренно останавливает сборку. Непубликованная работа в список не попадёт. После публикации во время Astro dev перезапусти `pnpm dev`: loader кеширует export в процессе. Это просмотр опубликованного сайта, не live-preview draft.

## 7. VPS: включи production и автоматические rebuilds

Перенеси проект на VPS и настрой DNS + HTTPS перед постоянной эксплуатацией. Например, внешний TLS reverse proxy отправляет `https://portfolio.example.com` на web-сервис Compose, порт `8080`; API и admin проксируются через тот же web-сервис.

На VPS установи canonical origin:

```dotenv
LACE_PUBLIC_BASE_URL=https://portfolio.example.com/
LACE_API_BASE_URL=https://portfolio.example.com/
LACE_MEDIA_BASE_URL=https://portfolio.example.com/
```

В шаблоне `0.3.0` Compose уже передаёт builder browser-facing `LACE_PUBLIC_BASE_URL` из `.env`; `LACE_API_BASE_URL: http://api:3000/` остаётся внутренним адресом export. Ручная правка нового шаблона не нужна. `.env` не копируется builder в scratch; media origin передаётся через Compose environment. Для старого проекта проверь это разделение перед сборкой.

Стандартный web-конфиг проксирует `/api`, `/admin`, `/health`, а статику читает из `/output/current`. Builder и MinIO не нужно публиковать наружу. Снаружи достаточно HTTPS reverse proxy; API-порт 3000 ограничь loopback или firewall. TLS-конфигурацию, DNS и сертификаты генератор пока не создаёт.

```sh
pnpm prod:start
docker compose ps
curl --fail https://portfolio.example.com/health/ready
```

Compose запускает MinIO, инициализацию bucket, отдельный migrate-service, API, builder, dispatcher, web и подготовку static-output volume. Миграции выполняет one-shot service до readiness, а не API startup. При этом Compose **не выполняет content sync/bootstrap** автоматически: эти команды ты запускаешь явно против той же SQLite-базы.

Если VPS начинает с пустой базы, выполни подготовку из шага 5 на VPS, создавай admin уже через HTTPS origin, затем создай настоящий build token. Копирование исходников проекта само по себе не переносит локальную БД и медиа.

Открой `/admin/builds` и нажми **Request build** для первого релиза. До него публичный сайт может отдавать `503 Site build pending`. При Publish последующие сборки идут через outbox → dispatcher → builder. Builder атомарно переключает output только после успеха; ошибка сохраняет предыдущий релиз. На Builds видны ошибки и Retry.

Изменения только CSS/Astro тоже требуют сборки: доставь новый код на VPS и нажми Request build. Изменения моделей требуют sync и перезапуска API/dispatcher; сохранённая структура модели может потребовать отдельной миграции контента, которой сейчас нет.

Остановка без удаления данных: `pnpm prod:stop`. SQLite хранится в `.lace/data/lace.sqlite`, MinIO objects — в `minio-data` volume. Для backup нужны обе части; перед согласованной копией останови записи. `docker compose down --volumes` удаляет named volumes, поэтому не используй его для обычной остановки.

## 8. Cloudflare: подготовь CMS Worker вручную

Полная Cloudflare-схема: Worker с API/admin, D1 с контентом и auth, приватный R2 с медиа, отдельный Pages site с HTML. Можно использовать `cms.example.com` для API/admin и `portfolio.example.com` для сайта.

Runtime-адаптер уже реализован, но генератор пока не собирает этот CMS deployment. Следующие файлы — ручная композиция на имеющихся пакетах, а не готовая команда generator.

В отдельном проекте создай `worker.ts`:

```ts
import { createCloudflareWorker } from "@lacecms/platform-cloudflare";
import config from "./lace.config.ts";
export default createCloudflareWorker({ config });
```

Собери админку в engine repository и скопируй только bundle:

```sh
cd /Users/jentix/Dev/lace
pnpm --filter @lacecms/app-admin build
mkdir -p /Users/jentix/Dev/my-portfolio/.lace/admin
cp -R apps/admin/dist/. /Users/jentix/Dev/my-portfolio/.lace/admin/
```

При каждом обновлении движка потребуется совместимый admin bundle. Editable admin source в проект не добавляется.

Из нового проекта создай Cloudflare resources:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create portfolio-cms
pnpm exec wrangler r2 bucket create portfolio-media
```

Сохрани выданный D1 ID. Команды описаны в официальных [D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/) и [R2](https://developers.cloudflare.com/workers/wrangler/commands/r2/) документах.

Создай **отдельный** `wrangler.worker.jsonc` в корне проекта; generated `wrangler.jsonc` остаётся Pages-конфигом:

```json
{
  "name": "portfolio-cms",
  "main": "worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "portfolio-cms",
    "database_id": "REPLACE_WITH_REAL_D1_ID",
    "migrations_dir": "node_modules/@lacecms/db/drizzle"
  }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "portfolio-media" }],
  "assets": {
    "binding": "ASSETS", "directory": ".lace/admin",
    "html_handling": "none", "not_found_handling": "none",
    "run_worker_first": true
  },
  "triggers": { "crons": ["* * * * *"] },
  "vars": { "LACE_PUBLIC_BASE_URL": "https://cms.example.com/" }
}
```

Подключи CMS hostname в настройках Worker; можно сначала использовать назначенный HTTPS `workers.dev` URL, заменив им canonical base URL. Админка открывается на origin Worker: `https://cms.example.com/admin/`.

## 9. Cloudflare: миграции, sync, admin и deploy

Для operator CLI экспортируй **реальные** значения:

```sh
export CLOUDFLARE_ACCOUNT_ID='YOUR_ACCOUNT_ID'
export CLOUDFLARE_API_TOKEN='YOUR_OPERATOR_API_TOKEN'
export LACE_D1_DATABASE_ID='YOUR_D1_ID'
export LACE_WRANGLER_CONFIG="$PWD/wrangler.worker.jsonc"

pnpm exec lace db migrate --target cloudflare-remote
pnpm exec lace content sync --target cloudflare-remote
pnpm exec lace auth bootstrap --target cloudflare-remote
pnpm exec wrangler secret put LACE_AUTH_SECRET --config wrangler.worker.jsonc
pnpm exec wrangler deploy --config wrangler.worker.jsonc
```

Operator token должен иметь права для выбранных D1 операций; deploy также требует Worker/R2 permissions. CLI работает с remote D1 через Cloudflare API, поэтому одного `wrangler login` для всех CLI-команд недостаточно. Remote target всегда указан явно.

Затем отправь setup JSON из шага 5 в `https://cms.example.com/api/v1/setup/admin`, войди в админку и создай/опубликуй контент и build token. При изменении config повтори sync и deploy Worker: конфигурация статически включена в bundle, а не читается по произвольному пути в runtime.

### Локальная проверка ручной Worker-композиции

Для неё нужны отдельные local bindings/state и development variables. Удобно создать `wrangler.worker.local.jsonc` с той же структурой, другим именем Worker, локальным base URL `http://127.0.0.1:8787/` и `LACE_ENVIRONMENT: "development"` в vars. Секрет для local dev положи в git-ignored `.dev.vars` рядом с конфигом.

```sh
export LACE_WRANGLER_CONFIG="$PWD/wrangler.worker.local.jsonc"
export LACE_CLOUDFLARE_PERSIST_TO="$PWD/.lace/cloudflare-state"
pnpm exec lace db migrate --target cloudflare-local
pnpm exec lace content sync --target cloudflare-local
pnpm exec lace auth bootstrap --target cloudflare-local
pnpm exec wrangler dev --config wrangler.worker.local.jsonc \
  --persist-to .lace/cloudflare-state --port 8787
```

D1 ID для CLI должен совпадать с DB binding конфигурации; local state не является remote D1. На local Worker повтори setup и создай отдельный local build token. Astro dev запускается отдельно с local API URL. Добавь `.dev.vars`, `.wrangler/`, `.lace/cloudflare-state/` в `.gitignore` своего проекта. Не коммить local secret или state.

Готовая команда `pnpm dev:cloudflare` существует в **engine repository**, а generated consumer её пока не получает. Изменение origin/local config и подготовка assets в consumer остаются ручными.

## 10. Cloudflare: сайт Pages и rebuild при Publish

Для ручной первой сборки в проекте:

```sh
export LACE_API_BASE_URL=https://cms.example.com/
export LACE_PUBLIC_BASE_URL=https://cms.example.com/
export LACE_MEDIA_BASE_URL=https://cms.example.com/
# LACE_BUILD_TOKEN экспортируй из своего secret/env-файла.
pnpm build
pnpm exec wrangler pages deploy site/dist --project-name portfolio-site
```

Для первого manual upload создай Pages project через dashboard или Wrangler. Generated workflow тоже делает manual deployment, но требует:

- GitHub vars `CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`;
- GitHub secret `CLOUDFLARE_API_TOKEN`;
- **добавления build environment** к `pnpm build`: CMS base URLs и секрет `LACE_BUILD_TOKEN`.

Шаблон `0.3.0` передаёт `LACE_API_BASE_URL` и `LACE_PUBLIC_BASE_URL` из GitHub vars, `LACE_BUILD_TOKEN` — из secrets. Настрой эти значения: одного Pages deployment token недостаточно. Manual `workflow_dispatch` сам по себе не запускается при Publish в CMS.

### Автоматизация через Pages Git integration + Deploy Hook

Для поддерживаемого текущим Worker deploy-hook trigger пути создай Pages project с Git integration и настрой:

- repository root: корень своего проекта;
- build command: `pnpm install --frozen-lockfile && pnpm build`;
- output directory: `site/dist`;
- Node 24.12.x и pnpm 12.3.4;
- build variables `LACE_API_BASE_URL`, `LACE_PUBLIC_BASE_URL`, `LACE_MEDIA_BASE_URL` = CMS HTTPS origin;
- secret build variable `LACE_BUILD_TOKEN` = токен из Admin Settings.

Архивы `.lace/packages` должны быть доступны build environment, пока нет registry release. Если managed build environment не предоставляет требуемый Node/pnpm, задай их установку явно либо используй собственный CI. Не считай default tools environment гарантированно совместимым с engine pins.

Build settings описаны в [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/). В Settings → Builds создай Deploy Hook для production branch, затем сохрани его URL в **Worker secret**:

```sh
pnpm exec wrangler secret put LACE_DEPLOY_HOOK_URL --config wrangler.worker.jsonc
```

Механизм hook описан в [официальной инструкции Cloudflare](https://developers.cloudflare.com/pages/configuration/deploy-hooks/). Не путай Git-connected Pages build с простым Direct Upload: direct upload готовых файлов сам не знает, как пересобрать репозиторий при CMS Publish.

После Publish Worker ставит build event в outbox и отправляет POST hook; cron раз в минуту восстанавливает необработанные события. Pages собирает сайт с опубликованным export. При смене CSS/Astro Git integration также может собирать по commit.

**Ограничение статуса:** Lace сейчас не опрашивает Cloudflare после принятия hook. Принятый hook (с provider ID или без него) записывается как `accepted`: это только подтверждение, что провайдер принял запрос, а не доказанный успешный HTML deployment. `succeeded` означает доказанную публикацию. Финальный результат проверяй в Pages dashboard; если deployment не удался, повтори сборку через Retry в Admin.

HTML статический, но картинки в данном примере загружаются с public media endpoint CMS, который читает R2/MinIO. Для полностью независимого от CMS набора HTML+картинки нужен отдельный build pipeline копирования media в static output; сейчас автоматически его нет.

## Текущее состояние и исторические ограничения

Ограничения раннего MVP из этого walkthrough больше не являются списком
нереализованных возможностей. Публичные пакеты, API/builder images, packaged
admin, browser setup, Worker consumer template, schema evolution и локальная
release acceptance реализованы. Полный поддерживаемый порядок действий смотри
в guides текущего генератора, [операциях авторизации](./auth-operations.md),
[синхронизации](./configuration-synchronization.md) и
[release guidance](./alpha-release.md).

Пользовательские contacts/works routes по-прежнему требуют Astro-кода.
Pages deploy hook настраивается отдельно; подтверждение принятого hook не равно
готовому deployment. При настроенных Pages tracking credentials Lace отслеживает
конкретный deployment; без них финальную публикацию проверяет оператор.
Локальная acceptance не заменяет проверку реального VPS/Cloudflare и восстановления.

Alpha.7 собирает WebP variants, включая GIF-анимацию, прямо в static output.
Lightbox и public media URL по-прежнему используют оригиналы из CMS. Полностью
автономная копия всех оригиналов не обещается. Обновляй engine/site/builder вместе,
используй matching registry components, затем повышай версии затронутых моделей
и явно синхронизируй image/gallery schemas 4/3. Новых SQL-миграций с alpha.6 нет.

## Исходники, на которых основан гайд

- `docs/mvp-architecture.md`, `docs/archive/mvp-implementation-roadmap.md`;
- `openspec/specs/project-generator/spec.md`, `generated-project-acceptance/spec.md`, `public-sdk/spec.md`, `configuration-synchronization/spec.md`, `operational-cli/spec.md`;
- `packages/create-lace/templates/`, `packages/create-lace/README.md`, `packages/cli/README.md`;
- `scripts/generated-project-acceptance.mjs`, `apps/builder/src/runner.ts`;
- `apps/api/worker/index.ts`, `apps/api/wrangler.jsonc`, `docs/cloudflare-worker.md`;
- `apps/site/src/`, `docs/auth-operations.md`, `apps/admin/src/pages/login/`.

## Составные поля (CE7A)

В модели можно описать группу и упорядоченный список. Такой же набор `fields`
можно передать в `defineBlock` для пользовательского блока:

```ts
import { defineCollection } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";

const peopleFields = {
  heading: field.text(),
  people: field.list({
    minItems: 1,
    maxItems: 20,
    item: field.group({
      fields: {
        name: field.text({ required: true }),
        photo: field.media(),
        role: field.select({ options: ["author", "editor"], defaultValue: "author" }),
      },
    }),
  }),
};
const peopleBlock = defineBlock({ type: "people", version: 1, fields: peopleFields });
const authors = defineCollection({
  key: "authors", version: 1, route: "/authors/:slug", fields: peopleFields,
  blocks: ["people"],
});
```

Данные остаются обычным JSON: `{ people: [{ name: "Ada", photo: "media-id" }] }`.
SDK сохраняет вложенность и порядок; ID из вложенного поля можно передать
обычному `entry.image(id)` или `entry.media(id)`. Render проверяет те же
определения и применяет defaults перед передачей props компоненту.

Отсутствующая необязательная группа остаётся отсутствующей, её дочерние defaults
не применяются. У переданного `{}` defaults дочерних полей применяются; `[]`
перекрывает default списка. `required` требует присутствия при публикации, но
не делает список непустым: для этого нужен `minItems`. Черновик допускает
отсутствующие обязательные значения и длину меньше `minItems`; неверные типы,
небезопасные URL, `null`, пропуски и `undefined` в элементах всегда запрещены.
Default элемента не исправляет отсутствующий элемент списка.

Ограничения: до 6 контейнеров на пути, до 2 групп подряд (список сбрасывает этот
счётчик), прямой список списков запрещён. В каждом списке максимум 100 элементов,
во всём нормализованном snapshot — 500, включая defaults и скрытые блоки. Каждый
вложенный список тоже учитывается: 10 групп с 20 элементами дают 210. Массивы
rich-text и сам список блоков в этот счётчик не входят. Сохраняется лимит 200
media-локаций; один ID в двух местах занимает две локации. Вложенный путь media
выглядит как `/people/0/photo`, в интерфейсе это первый элемент.

В CE7A admin показывает составные поля как JSON только для чтения и сохраняет
их при изменении скалярных полей, копировании блоков и командах жизненного
цикла. Редактор групп/списков появится в CE7C. CE7B поддерживает рекурсивную эволюцию
моделей: вложенные добавления/defaults, переименования и удаления по hints,
проверку ужесточений на сохранённых данных. Структурные изменения требуют повышения
версии модели; изменения данных блоков по-прежнему используют версионированные миграции.
Настройки блоков, SEO mappings и `listFields` остаются скалярными корневыми полями.
Встроенные Gallery/Navigation и стартер относятся к CE7D.

Обновляй engine/admin и пакеты сайта согласованно. До записи составных значений
сделай backup: возврат к старой версии требует восстановления совместимых
данных и конфигурации, автоматического преобразования обратно нет.


For visual sections/tabs without changing stored JSON, see
[form organization and creation-time slug suggestions](form-organization.md).
