// ============================================================
// Amazon Bedrock 体験チャットbot ─ サーバ側
//
// 依存パッケージゼロ。Node.js 18 以降なら `node app.js` だけで動きます。
// このサーバの仕事は2つだけです。
//   1. public/index.html（チャット画面）をブラウザに配る
//   2. 画面から届いたメッセージを Bedrock に中継して、返答を返す
//
// なぜ中継が必要か:
//   Bedrock は CORS に対応していないため、ブラウザから直接は呼べません。
//   それに、API キーをブラウザ側に置くと誰にでも見えてしまいます。
//   だからキーはこのサーバだけが持ち、ブラウザには渡しません。
// ============================================================

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { ROOT, requireConfig } from './env.js';

const { apiKey, region, modelId } = requireConfig();

// ============================================================
// ★★★ 演習ゾーン ★★★
// ここの値を書き換えて `node app.js` を再起動すると、AIの振る舞いが変わります。
// 詳しい課題は README.md の「カスタマイズ演習」を見てください。
// ============================================================

// 【演習1】システムプロンプト ── AIの性格・役割・話し方を決める指示文。
//          いちばん変化が大きくて面白い部分です。
const SYSTEM_PROMPT = `あなたは親しみやすい日本語のアシスタントです。
専門用語はできるだけ避け、初心者にもわかる言葉で、簡潔に答えてください。`;

// 【演習2】応答の長さ（トークン数の上限）。小さくすると途中で切れます。
const MAX_TOKENS = 512;

// 【演習3】"ランダムさ"。0 に近い = 毎回ほぼ同じ / 1 に近い = 表現が自由。
//
//          null にすると temperature を送りません。
//          モデルによっては temperature の指定が禁止されています。
//          （例: Claude Fable 5 は「1.0 か未指定のみ」。思考型モデルも受け付けない場合がある）
//          エラーが出たら null にしてください。
const TEMPERATURE = 0.7;

// 【演習4】何件ぶんの会話を覚えておくか（1往復 = あなた1件 + AI1件 = 2件）。
//          0 にすると毎回はじめて会った状態になります。
const MAX_HISTORY = 20;

// ============================================================
// ★★★ 演習ゾーンここまで ★★★
// ============================================================

const PORT = Number(process.env.PORT) || 8000;

// 会話の履歴。Bedrock は前回の会話を覚えていないので、
// 毎回この配列をまるごと送ることで「会話が続いている」ように見せています。
// ローカルで1人が使う前提なので、あえてシンプルな1本の配列にしています。
// （本番のアプリなら、利用者ごとに分けて持つ必要があります）
let history = [];

/**
 * Bedrock の Converse API を呼びます。
 * 使っているのは Node 18 以降に組み込まれている fetch だけ。AWS SDK は不要です。
 *
 * 短期 API キーは `Authorization: Bearer <キー>` を付けるだけで使えるので、
 * ふつうの AWS API で必要な SigV4 署名を自分で書く必要がありません。
 */
async function callBedrock(messages) {
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/converse`;

  const inferenceConfig = { maxTokens: MAX_TOKENS };
  // TEMPERATURE が null のときは、キーごと送りません（演習3のコメント参照）
  if (TEMPERATURE !== null) {
    inferenceConfig.temperature = TEMPERATURE;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      system: [{ text: SYSTEM_PROMPT }],
      inferenceConfig,
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(explainError(response, raw));
  }

  const data = JSON.parse(raw);

  // 返答の本文は output.message.content の中にあります。
  // content は配列なので、テキスト部分だけをつなげて取り出します。
  // （思考型モデルでは、思考の中身が別のブロックで入ってくることがあります。
  //   ここでは text だけを拾うので、自然と本文だけが表示されます）
  const text = (data.output?.message?.content ?? [])
    .map((block) => block.text ?? '')
    .join('')
    .trim();

  // モデルが「答えを拒否した」場合など、本文が空で返ることがあります
  if (text === '') {
    return {
      text:
        '（モデルから本文が返りませんでした。' +
        `停止理由: ${data.stopReason ?? '不明'}。` +
        'MAX_TOKENS が小さすぎるか、モデルが応答を拒否した可能性があります）',
      usage: data.usage ?? null,
    };
  }

  return { text, usage: data.usage ?? null };
}

/**
 * Bedrock のエラーを、原因の見当がつく日本語メッセージに翻訳します。
 * 初心者がつまずくポイントはほぼこの5種類に収まります。
 */
function explainError(response, raw) {
  let serverMessage = raw;
  try {
    serverMessage = JSON.parse(raw).message ?? JSON.parse(raw).Message ?? raw;
  } catch {
    // JSON でなければそのまま使う
  }

  // 例: "AccessDeniedException:http://internal.amazon.com/..." → "AccessDeniedException"
  const type = (response.headers.get('x-amzn-errortype') ?? '').split(':')[0];
  const detail = `\n\n（Bedrock からの応答: HTTP ${response.status} ${type} ${serverMessage}）`;

  // キーの文字列そのものが API キーの形式になっていない場合
  if (/Invalid API Key format/i.test(serverMessage)) {
    return (
      'API キーの形式が正しくありません。\n' +
      '.env の AWS_BEARER_TOKEN_BEDROCK が、Bedrock コンソールで発行したキーの\n' +
      '全文になっているか確認してください。コピー漏れ、前後の余分な文字、\n' +
      'アクセスキー ID など別の値を貼ってしまっている、などがよくある原因です。' +
      detail
    );
  }

  // temperature / top_p を受け付けないモデル（Claude Fable 5 や思考型モデルなど）
  if (/temperature|top_?p|top_?k/i.test(serverMessage)) {
    return (
      'このモデルは temperature などの指定を受け付けないようです。\n' +
      'app.js の TEMPERATURE を null に変えて、再起動してください。' +
      detail
    );
  }

  if (response.status === 403 || type === 'AccessDeniedException') {
    return (
      'Bedrock に拒否されました。上から順に確認してください。\n' +
      '\n' +
      '1. API キーの期限切れ。短期キーは最長12時間で失効します。\n' +
      '   コンソールで再発行して .env に貼り替えてください。まずこれを疑ってください。\n' +
      '\n' +
      '2. 初回呼び出しの待ち時間。商用リージョンではモデルアクセスは既定で有効ですが、\n' +
      '   初回だけ Bedrock が裏でサブスクリプション処理を行い、完了まで最大15分かかります。\n' +
      '   数分待って、もう一度試してください。\n' +
      '\n' +
      '3. モデル固有の追加条件。\n' +
      `   ・Claude 系（今のモデル: ${modelId}）は、アカウントにつき1回だけ\n` +
      '     初回利用フォームの提出が必要です。Bedrock コンソールのモデルカタログから\n' +
      '     Anthropic のモデルを選んで提出してください。\n' +
      '   ・OpenAI GPT-5.6 系は、既定プロジェクト（project/default）に対する\n' +
      '     bedrock:InvokeModel 権限が必要です。\n' +
      '   ・Claude Fable 5 は Data Retention API でのオプトインが必要です。\n' +
      '\n' +
      '4. アカウント側の前提。IAM に aws-marketplace:Subscribe などの権限があるか、\n' +
      '   有効な支払い方法が設定されているかを確認してください。\n' +
      '\n' +
      '追加の手続きが要らないモデルに変えるのが手軽です。\n' +
      '.env の MODEL_ID を global.amazon.nova-2-lite-v1:0 にすると、\n' +
      'フォーム提出もプロジェクト権限も不要で動きます。' +
      detail
    );
  }

  if (response.status === 404 || type === 'ResourceNotFoundException') {
    return (
      `モデルが見つかりません（MODEL_ID=${modelId} / AWS_REGION=${region}）。\n` +
      '`npm run models` で、そのリージョンで実際に使える ID の一覧を確認して貼り替えてください。' +
      detail
    );
  }

  if (type === 'ValidationException') {
    return (
      `リクエストの内容が不正だと言われました（MODEL_ID=${modelId}）。\n` +
      'モデル ID の書き方が違う可能性があります。最近のモデルは us. / eu. / apac. / global. で始まる\n' +
      '「クロスリージョン推論プロファイル」の ID でないと呼べないものが多く、\n' +
      'なかには推論プロファイル必須で、素のモデル ID では呼べないものもあります。\n' +
      '`npm run models` で使える ID を確認してください。' +
      detail
    );
  }

  if (response.status === 429 || type === 'ThrottlingException') {
    return '呼び出しが多すぎて制限されました。数秒待ってからもう一度試してください。' + detail;
  }

  return 'Bedrock の呼び出しに失敗しました。' + detail;
}

// ------------------------------------------------------------
// ここから下は「ブラウザとやりとりする部分」です。
// Bedrock とは直接関係ないので、最初は読み飛ばしても大丈夫です。
// ------------------------------------------------------------

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('送信されたデータが大きすぎます'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStaticFile(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : normalize(urlPath).replace(/^([/\\])+/, '');
  const filePath = join(ROOT, 'public', relative);

  // public/ の外に出ようとするパス（../ など）は拒否します
  if (!filePath.startsWith(join(ROOT, 'public'))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  // 画面が起動時に読む、表示用の設定
  if (req.method === 'GET' && pathname === '/api/config') {
    sendJson(res, 200, { modelId, region, historyLength: history.length });
    return;
  }

  // 「会話をリセット」ボタン
  if (req.method === 'POST' && pathname === '/api/reset') {
    history = [];
    sendJson(res, 200, { ok: true });
    return;
  }

  // チャット本体
  if (req.method === 'POST' && pathname === '/api/chat') {
    try {
      if (!modelId) {
        sendJson(res, 400, {
          error:
            'MODEL_ID が設定されていません。\n' +
            '`npm run models` で使えるモデル ID を確認し、.env の MODEL_ID に貼り付けてください。',
        });
        return;
      }

      const { message } = JSON.parse(await readRequestBody(req));

      if (typeof message !== 'string' || message.trim() === '') {
        sendJson(res, 400, { error: 'メッセージが空です。' });
        return;
      }

      // 履歴の末尾に、今回の発言を積む
      history.push({ role: 'user', content: [{ text: message }] });

      // 【演習4】の効き所: 古い履歴を捨てて、直近だけを残します
      if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
      }
      // Bedrock は user から始まる履歴しか受け付けないので、先頭を調整します
      while (history.length > 0 && history[0].role !== 'user') {
        history.shift();
      }

      const { text, usage } = await callBedrock(history);

      history.push({ role: 'assistant', content: [{ text }] });

      sendJson(res, 200, { reply: text, usage });
    } catch (error) {
      // 送ったユーザー発言は取り消して、次の送信で履歴が壊れないようにします
      if (history.at(-1)?.role === 'user') history.pop();

      console.error('[エラー]', error.message);
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET') {
    await serveStaticFile(res, pathname);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

// 127.0.0.1 に限定して待ち受けます。
// 認証を持たないサーバなので、同じネットワークの他の端末から触られないようにするためです。
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Bedrock 体験チャットbot を起動しました');
  console.log('  ----------------------------------------');
  console.log(`  ブラウザで開く : http://localhost:${PORT}`);
  console.log(`  リージョン     : ${region}`);
  console.log(`  モデル         : ${modelId || '(未設定 → npm run models で確認)'}`);
  console.log('');
  console.log('  終了するには Ctrl + C');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nポート ${PORT} は既に使われています。`);
    console.error('.env の PORT を別の番号（例: PORT=8080）に変えて、もう一度起動してください。\n');
    process.exit(1);
  }
  throw error;
});
