// ============================================================
// 使えるモデル ID を一覧表示するツール
//
//     npm run models
//
// 「どのモデル ID を .env に書けばいいのか」は、アカウントとリージョンで
// 変わるうえに、モデルは頻繁に追加・入れ替えされます。
// 推測せずに、このコマンドで実際の一覧を取ってから選んでください。
//
// チャットが動かないときの切り分けにも使えます。
// ここで一覧が取れれば「キーとリージョンは正しい」と分かるので、
// 残る原因はモデル ID かモデルアクセスの有効化に絞れます。
// ============================================================

import { requireConfig } from './env.js';

const { apiKey, region } = requireConfig();

/** Bedrock の管理系 API を GET で呼びます */
async function get(path) {
  const response = await fetch(`https://bedrock.${region}.amazonaws.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const raw = await response.text();

  if (!response.ok) {
    const type = (response.headers.get('x-amzn-errortype') ?? '').split(':')[0];
    let message = raw;
    try {
      message = JSON.parse(raw).message ?? raw;
    } catch {
      /* JSON でなければそのまま */
    }

    if (/Invalid API Key format/i.test(message)) {
      throw new Error(
        'API キーの形式が正しくありません。\n' +
        '  .env の AWS_BEARER_TOKEN_BEDROCK が、Bedrock コンソールで発行したキーの全文に\n' +
        '  なっているか確認してください（コピー漏れ、別の値の貼り付けなどがよくある原因です）。\n' +
        `  （HTTP ${response.status} ${type} ${message}）`
      );
    }

    if (response.status === 403 || type === 'AccessDeniedException') {
      throw new Error(
        'Bedrock に拒否されました。\n' +
        '  ・API キーが失効している（短期キーは最長12時間）→ 再発行して .env に貼り替え\n' +
        `  ・.env の AWS_REGION（今は ${region}）が、キーを発行したリージョンと違う\n` +
        `  （HTTP ${response.status} ${type} ${message}）`
      );
    }
    throw new Error(`一覧の取得に失敗しました（HTTP ${response.status} ${type}）: ${message}`);
  }

  return JSON.parse(raw);
}

/** 会話に使えそうなモデルだけに絞ります */
function isChatModel(model) {
  return (
    model.outputModalities?.includes('TEXT') &&
    model.inputModalities?.includes('TEXT') &&
    model.modelLifecycle?.status !== 'LEGACY' &&
    // 埋め込み・画像用など、会話に向かないものを名前で除外
    !/embed|image|canvas|reranker|stable-?diffusion/i.test(model.modelId)
  );
}

function printSection(title, note, ids) {
  console.log(`\n${title}`);
  console.log('─'.repeat(60));
  if (note) console.log(`${note}\n`);

  if (ids.length === 0) {
    console.log('  （該当なし）');
    return;
  }
  for (const { id, name } of ids) {
    console.log(`  ${id}`);
    if (name) console.log(`      ${name}`);
  }
}

try {
  console.log(`\nリージョン ${region} で使えるモデルを調べています...`);

  // クロスリージョン推論プロファイル。最近のモデルはこちらの ID を使います。
  const profiles = await get('/inference-profiles?maxResults=1000&type=SYSTEM_DEFINED').catch(
    () => ({ inferenceProfileSummaries: [] })
  );

  // 素の基盤モデル（オンデマンド呼び出しができるもの）
  const foundation = await get('/foundation-models?byOutputModality=TEXT&byInferenceType=ON_DEMAND');

  const profileIds = (profiles.inferenceProfileSummaries ?? [])
    .filter((p) => p.status !== 'INACTIVE')
    .filter((p) => !/embed|image|canvas|reranker/i.test(p.inferenceProfileId))
    .map((p) => ({ id: p.inferenceProfileId, name: p.inferenceProfileName }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const modelIds = (foundation.modelSummaries ?? [])
    .filter(isChatModel)
    .map((m) => ({ id: m.modelId, name: `${m.providerName} ${m.modelName}` }))
    .sort((a, b) => a.id.localeCompare(b.id));

  printSection(
    '【おすすめ】クロスリージョン推論プロファイル',
    'まずはこの中から選んでください。最近のモデルは、こちらの ID でないと呼べないことが多いです。',
    profileIds
  );

  printSection(
    '基盤モデルの ID（オンデマンド）',
    '上の一覧で動かなかった場合や、古めのモデルを使いたい場合はこちら。',
    modelIds
  );

  console.log('\n' + '='.repeat(60));
  console.log('使いたい ID を1つコピーして、.env の MODEL_ID に貼り付けてください。');
  console.log('例:  MODEL_ID=' + (profileIds[0]?.id ?? modelIds[0]?.id ?? 'コピーしたID'));
  console.log('='.repeat(60));
  console.log('\n※ 一覧に出ていても、Bedrock コンソールの「モデルアクセス」で');
  console.log('   有効化していないモデルは呼び出すと拒否されます。\n');
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
