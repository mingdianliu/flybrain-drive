// Build an English entry page without duplicating the simulation or downloading extra data.
import { readFile, writeFile } from 'node:fs/promises';
import { english } from '../dist/i18n.mjs';
const root = new URL('../dist/', import.meta.url);
const translate = (text) => {
  const original = text.trim();
  const key = original.replace(/\s+/g, ' ');
  if (!/[\p{Script=Han}]/u.test(key)) return text;
  if (!(key in english)) throw Error(`Missing English translation: ${key}`);
  return text.replace(original, english[key]);
};
let page = await readFile(new URL('index.html', root), 'utf8');
page = page
  .replace(/(?<=>)[^<>]+(?=<)/g, translate)
  .replace(/(aria-label|content)="([^"]*)"/g, (_, attr, text) => `${attr}="${translate(text)}"`)
  .replace('lang="zh-CN"', 'lang="en"')
  .replace('href="./"', 'href="en.html"')
  .replaceAll('href="driving-guide.html"', 'href="driving-guide.en.html"')
  .replaceAll('href="./model-notes.html"', 'href="./model-notes.en.html"')
  .replace(
    /<a\s+class="language-link"[^>]*>[\s\S]*?<\/a\s*>/,
    '<a class="language-link" href="./" lang="zh-CN" hreflang="zh-CN">中文</a>',
  );
await writeFile(new URL('en.html', root), page);
console.log('Built English page (en.html) with shared simulation modules.');
