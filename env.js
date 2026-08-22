// ============================================================
// .env ファイルを読み込む、ごく簡単なパーサ
//
// 本来は dotenv というライブラリを使いますが、
// 「インストール作業ゼロ」を守るために自前で書いています。
// やっていることは「1行ずつ見て KEY=VALUE に分解する」だけです。
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** このファイルが置かれているフォルダ（= プロジェクトのルート） */
export const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * .env を読んで process.env に流し込みます。
 * すでに環境変数が設定されている場合は、そちらを優先します。
 */
export function loadEnv() {
  let text;
  try {
    text = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    // .env が無くても、環境変数で直接渡されているかもしれないので続行します
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    // 空行と # で始まるコメント行は飛ばす
    if (line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // "..." や '...' で囲まれていたら、その囲みを外す
    if (value.length >= 2 && /^(".*"|'.*')$/s.test(value)) {
      value = value.slice(1, -1);
    }

    // 環境変数で直接指定された値を上書きしない
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * 必須の設定を読み出して、足りなければ分かりやすく教えて終了します。
 */
export function requireConfig() {
  loadEnv();

  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  const region = process.env.AWS_REGION?.trim();
  const modelId = process.env.MODEL_ID?.trim();

  const problems = [];

  if (!apiKey || apiKey === 'ここに発行したAPIキーを貼る') {
    problems.push(
      'AWS_BEARER_TOKEN_BEDROCK が未設定です。\n' +
      '    → Bedrock コンソールで短期 API キーを発行し、.env に貼り付けてください。'
    );
  }
  if (!region) {
    problems.push(
      'AWS_REGION が未設定です。\n' +
      '    → 例: AWS_REGION=ap-northeast-1（キーを発行したリージョンと必ず揃えてください）'
    );
  }

  if (problems.length > 0) {
    console.error('\n設定が足りません:\n');
    problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
    console.error('  .env.example をコピーして .env を作る手順:');
    console.error('    macOS / Linux :  cp .env.example .env');
    console.error('    Windows       :  copy .env.example .env\n');
    process.exit(1);
  }

  return { apiKey, region, modelId };
}
