# Amazon Bedrock 体験チャットbot

Amazon Bedrock の**短期 API キーを貼り付けるだけ**で動く、チャットbotの最小構成です。
`npm install` も `pip install` も `aws configure` も不要。Node.js だけあれば動きます。

```
APIキーを発行 → .env に貼る → node app.js → ブラウザで会話
```

動かしたあとは、AIの性格や応答の長さを書き換える[カスタマイズ演習](#カスタマイズ演習)まで用意してあります。

---

## 目次

- [なぜこんなに簡単に動くのか](#なぜこんなに簡単に動くのか)
- [必要なもの](#必要なもの)
- [セットアップ](#セットアップ)
- [カスタマイズ演習](#カスタマイズ演習)
- [仕組み](#仕組み)
- [うまく動かないとき](#うまく動かないとき)
- [料金とキーの扱い](#料金とキーの扱い)
- [次のステップ](#次のステップ)

---

## なぜこんなに簡単に動くのか

ふつう AWS の API を呼ぶには **SigV4 署名**という手続きが必要で、これを自力で書くのは大変です。だから通常は AWS SDK（boto3 や aws-sdk）を入れて、`aws configure` で認証情報を設定します。

ところが Bedrock の API キーは `Authorization: Bearer <キー>` を付けるだけで認証が通ります（[Use an Amazon Bedrock API key](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html)）。署名がいらないので、**SDK もインストールも不要**で、Node.js に組み込まれている `fetch` だけで呼べます。

これがこのリポジトリが依存パッケージゼロで成立している理由です。

> 出典の記述はライセンス配慮のため要約しています。

---

## 必要なもの

| | 内容 |
|---|---|
| Node.js | **18 以降**（`fetch` が組み込みになったバージョン）。確認: `node -v` |
| AWS アカウント | Bedrock が使えるもの |
| ブラウザ | 特別な設定は不要 |

Node.js が入っていなければ [nodejs.org](https://nodejs.org/) の LTS 版をインストールしてください。インストーラが PATH まで設定してくれます。

---

## セットアップ

### 1. このリポジトリを取得

```bash
git clone https://github.com/<あなたのユーザー名>/AmazonBedrockTutorial.git
cd AmazonBedrockTutorial
```

### 2. モデルアクセスについて（多くの場合、作業は不要）

商用リージョンでは、**すべての基盤モデルへのアクセスが既定で有効**になっています。サードパーティ製モデルを初めて呼び出すと、Bedrock が裏で自動的にサブスクリプション処理を行います（[Request access to models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)）。

つまり、以前必要だった「コンソールでモデルアクセスを有効化する」操作は、基本的にもう踏まなくて済みます。ただし自動有効化が成立するには前提が3つあります。

- IAM に `aws-marketplace:Subscribe` / `Unsubscribe` / `ViewSubscriptions` があること
- アカウントに有効な支払い方法が設定されていること
- **Anthropic（Claude）のモデルを使う場合のみ**、初回利用フォームの提出が必要

Claude を使いたい場合だけ、[Bedrock コンソール](https://console.aws.amazon.com/bedrock)のモデルカタログから Anthropic のモデルを選び、用途を記述するフォームを提出してください。**アカウント（または AWS Organizations の管理アカウント）につき1回だけ**で、提出すれば即時に使えるようになります。会社のサイトを持っていない個人開発者や学生の場合、GitHub プロフィールや個人のポートフォリオ URL を書けば問題ないと明記されています。

**この手順を完全に飛ばしたいなら、手順5で Amazon Nova を選んでください。** Amazon 自前のモデルはフォーム提出もサブスクリプションも不要です。

> 初回呼び出し時は、自動サブスクリプションの完了までに最大15分かかることがあります。その間は `AccessDeniedException` が返る場合があるので、少し待ってから再試行してください。

### 3. 短期 API キーを発行する

[Bedrock コンソール](https://console.aws.amazon.com/bedrock)を開き、画面右上で**使いたいリージョンを選んだうえで**、左メニューの「API キー」→「**短期 API キー**」→ 発行。表示されたキーをコピーします。

> 短期キーは最長 12 時間で失効します（[ドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)）。翌日動かなくなったら、再発行して貼り替えるだけです。
> また、**キーは発行したリージョン向けの呼び出しにしか使えません。** ここで選んだリージョンを覚えておいてください。

### 4. `.env` を作ってキーを貼る

```bash
cp .env.example .env      # Windows は  copy .env.example .env
```

`.env` を開いて、次の2つを埋めます。

```env
AWS_BEARER_TOKEN_BEDROCK=コピーしたキー
AWS_REGION=ap-northeast-1
```

`.env` は `.gitignore` で除外済みなので、GitHub には push されません。

### 5. モデルを選ぶ（初回はそのままでOK）

`.env` の `MODEL_ID` には、追加の手続きが不要な `global.amazon.nova-2-lite-v1:0`（Amazon Nova 2 Lite）が既定で入っています。**まずは触らず、次の手順6に進んでかまいません。**

モデルを変えたいとき、あるいはエラーが出たときは、利用できる ID の一覧を取ってください。

```bash
npm run models
```

利用できるモデル ID はアカウントとリージョンで違い、モデル自体も頻繁に入れ替わります。表示された中から1つコピーして、`.env` の `MODEL_ID` に貼り替えます。

このコマンドは動作確認も兼ねています。一覧が取れれば、キーとリージョンは正しいと確認できます。

#### 主なモデルの ID（2026年8月時点）

すべて Converse API に対応しているので、このリポジトリでそのまま使えます。

| モデル | `MODEL_ID` に書く値 | 追加手続き | メモ |
|---|---|---|---|
| **Amazon Nova 2 Lite** | `global.amazon.nova-2-lite-v1:0` | **不要** | Amazon 自前の低コストモデル。**まず試すならこれ** |
| **GPT-5.6 Terra** | `global.openai.gpt-5.6-terra` | プロジェクト権限 | OpenAI のバランス型 |
| **GPT-5.6 Sol** | `global.openai.gpt-5.6-sol` | プロジェクト権限 | OpenAI の最上位。最も高価 |
| **Claude Opus 5** | `global.anthropic.claude-opus-5` | 初回フォーム | Anthropic の最上位。高性能だが高価 |
| **Claude Fable 5** | `global.anthropic.claude-fable-5` | 初回フォーム + 追加設定 | **この体験版には不向き**（下記） |

**最初の1回は Nova 2 Lite を強くおすすめします。** 追加の手続きが何もなく、単価も安いので、「キーを貼るだけで動く」を最短で体験できます。他のモデルは演習6で乗り換える対象にしてください。US 内なら `us.amazon.nova-2-lite-v1:0` も使えます。

`global.` の代わりに地域を絞った版もあります。Opus 5 は `us.` `eu.` `au.`、GPT-5.6 系と Fable 5 は `us.`（Terra はインド向けに `in.` も）。データの置き場所を絞る必要がなければ `global.` がいちばん確実です。

**先頭のプレフィックスは省略できません。** ここに挙げたモデルは In-Region 呼び出しに対応しておらず、素の ID（`anthropic.claude-opus-5` など）では呼べません。

「追加手続き」列の中身を補足します。

- **プロジェクト権限**（GPT-5.6 系）: IAM 側で既定プロジェクト（`project/default`）に対する `bedrock:InvokeModel` 権限が必要です
- **初回フォーム**（Claude 系）: 手順2のとおり、アカウントにつき1回だけ用途フォームの提出が必要です
- **Claude Fable 5** はさらに2つ厄介です。①`temperature` が 1.0 か未指定のみなので、`app.js` の `TEMPERATURE` を `null` にしないとエラーになり、演習3が成立しません ②利用前に Data Retention API でデータ共有のオプトインが必要で、コンソールに設定画面がなく API を直接叩く必要があります。加えて安全性の判定が厳しく、ふつうの質問でも回答を拒否することがあります

Opus 5 と Sol は最上位モデルなので単価が高めです。演習を回すだけなら Nova 2 Lite か Terra、あるいは `npm run models` に出てくる軽量モデル（Haiku、Luna など）で十分です。

> モデルは頻繁に追加・入れ替えされます。上の表が古くなっている可能性があるので、**最終的には `npm run models` の出力を正としてください。**

### 6. 起動する

```bash
npm start
```

`node app.js` でも同じです。表示された `http://localhost:8000` をブラウザで開けば、チャットが始められます。

止めるときは `Ctrl + C`。

---

## カスタマイズ演習

動いたら、次はいじってみましょう。**すべて1〜2行の書き換えで完結**します。

### 演習1: AIの性格を変える ★まずこれ

`app.js` の `SYSTEM_PROMPT` を書き換えます。システムプロンプトは、AIに与える「役割と話し方の指示」です。

```js
const SYSTEM_PROMPT = `あなたは親しみやすい日本語のアシスタントです。
専門用語はできるだけ避け、初心者にもわかる言葉で、簡潔に答えてください。`;
```

試してみる例:

```js
// 関西弁のキャラにする
const SYSTEM_PROMPT = `あなたは大阪出身のフレンドリーなアシスタントです。
必ず関西弁で、ツッコミを入れながら答えてください。`;

// 用途を絞った専門ボットにする
const SYSTEM_PROMPT = `あなたは料理アシスタントです。
料理以外の話題を振られたら「料理の話しかできません」と丁寧に断ってください。
レシピは必ず「材料」と「手順」に分けて答えてください。`;

// 出力の形式を固定する
const SYSTEM_PROMPT = `あなたは要約ボットです。
どんな入力に対しても、必ず箇条書き3点だけで答えてください。前置きは書かないこと。`;
```

**書き換えたら `Ctrl + C` で止めて `npm start` で再起動**してください（`app.js` はサーバ側なので再起動が必要です）。

同じ質問をして、答え方がどう変わるか見比べてみてください。プロンプトを変えるだけで挙動が変わるのが、生成AIアプリ開発の中心的な作業です。

### 演習2: 応答の長さを変える

```js
const MAX_TOKENS = 512;
```

`50` にすると文章が途中でぶつ切りになります。これは「AIが短くまとめた」のではなく「上限に達して打ち切られた」状態です。返答が切れる不具合の原因として実際によくあるので、意図的に体験しておく価値があります。`2000` にすれば長い解説も返ってきます。

### 演習3: 応答のばらつきを変える

```js
const TEMPERATURE = 0.7;
```

`0` にして「桃太郎のあらすじを教えて」を3回送ると、ほぼ同じ文が返ります。`1` にすると毎回表現が変わります。

使い分けの目安は、分類・抽出・要約のように答えが決まっている用途は低く、キャッチコピーや物語の生成のように多様性が欲しい用途は高く、です。

> **エラーが出る場合**: モデルによっては `temperature` の指定が禁止されています（Claude Fable 5 は 1.0 か未指定のみ、思考型モデルも受け付けないことがあります）。その場合は `null` にすると、`temperature` を送らずに呼び出します。この演習が使えるモデルに変えるほうが手軽です。
>
> ```js
> const TEMPERATURE = null;   // temperature を送らない
> ```

### 演習4: 会話の記憶をなくしてみる

```js
const MAX_HISTORY = 20;
```

`0` にして再起動し、次の順で送ってみてください。

1. 「私の名前はタロウです」
2. 「私の名前は何でしたか？」

答えられなくなります。**Bedrock 側は前回の会話を一切覚えていない**からです。会話が続いているように見えるのは、`app.js` が `history` 配列に過去のやりとりを溜めて、毎回まるごと送り直しているだけです。

これは料金にも直結します。会話が長くなるほど毎回送る入力トークンが増えるので、画面下に出る「入力トークン」の数字が往復ごとに増えていくのを確認してみてください。

### 演習5: 見た目を変える

`public/index.html` の先頭にある色定義と、`<h1>` のタイトルを変えます。

```css
:root {
  --accent: #4f46e5;
  --bg: #f6f7fb;
  ...
}
```

こちらはブラウザ側のファイルなので、**保存してブラウザを再読み込みするだけ**。サーバの再起動はいりません。

### 演習6: モデルを乗り換える（発展）

`.env` の `MODEL_ID` を、`npm run models` で出た別の ID に変えます。同じ質問を投げて、返答の質と速度、トークン数を比べてみてください。

コードを1行も変えずにモデルを差し替えられるのは、Converse API がモデル間で共通のインターフェースを提供しているからです（[Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)）。軽量モデルで足りる処理を安く回す、という実運用の判断もここから始まります。

### 演習7: 回答を1文字ずつ表示する（挑戦）

いまは返答が出来上がってからまとめて表示されます。ChatGPT のように少しずつ流したい場合は、`converse` を **`converse-stream`** に変えて、返ってくるイベントを順に読む実装が必要です。`app.js` の `callBedrock` が改造の起点です。

---

## 仕組み

```
ブラウザ                    app.js (あなたのPC)              Amazon Bedrock
   │                            │                                │
   │  POST /api/chat            │                                │
   │  { message: "こんにちは" }  │                                │
   ├───────────────────────────>│                                │
   │                            │ history に追加                  │
   │                            │                                │
   │                            │ POST /model/{id}/converse       │
   │                            │ Authorization: Bearer <キー>    │
   │                            ├───────────────────────────────>│
   │                            │                                │
   │                            │<───────────────────────────────┤
   │                            │ { output: { message: ... } }    │
   │  { reply: "...", usage }   │                                │
   │<───────────────────────────┤                                │
```

ファイルは5つだけです。

| ファイル | 役割 |
|---|---|
| `app.js` | サーバ。画面を配って、Bedrock に中継する。**演習の中心** |
| `public/index.html` | チャット画面。HTML + CSS + JS が1枚に収まっている |
| `models.js` | 使えるモデル ID の一覧表示。動作確認にも使う |
| `env.js` | `.env` を読むだけの小さな部品 |
| `.env` | あなたのキー（Git 管理外） |

### ブラウザから直接 Bedrock を呼ばない理由

「サーバなしで HTML 1枚」のほうが simple に見えますが、2つの理由で成立しません。

- Bedrock のエンドポイントは CORS に対応していないため、ブラウザからの `fetch` はブロックされる
- API キーがブラウザ側のコードに載ると、開発者ツールから誰にでも見える

そこで `app.js` が「キーを持つ薄い中継層」を担います。**キーはサーバ側だけに存在し、ブラウザには一切渡していません。** これは実務でも同じ構成です。

なお `app.js` は認証を持たないため、`127.0.0.1`（自分のPCからのみ）に限定して待ち受けています。同じ Wi-Fi の他人からは触れません。**このまま公開サーバに置かないでください。**

---

## うまく動かないとき

まず `npm run models` を実行してください。ここで一覧が取れるかどうかで、原因が2つに切り分けられます。

- **一覧が取れない** → キーかリージョンの問題
- **一覧は取れるがチャットが失敗する** → モデル ID か、そのモデル固有の条件の問題

いちばん手軽な切り分けは、`.env` の `MODEL_ID` を `global.amazon.nova-2-lite-v1:0` に変えてみることです。これで動けば、原因は元のモデル固有の条件（初回フォームやプロジェクト権限）に絞れます。

| 症状 | 原因と対処 |
|---|---|
| `AccessDeniedException` / 403 | ①キーが失効した（最長12時間）→ 再発行して `.env` を更新。まずこれを疑う ②初回呼び出しの自動サブスクリプション待ち。最大15分かかるので数分待って再試行 ③Claude 系なら初回利用フォームが未提出（手順2） ④GPT-5.6 系なら `project/default` への `bedrock:InvokeModel` 権限が不足 ⑤Fable 5 ならデータ保持のオプトインが未実施 |
| `ValidationException` | モデル ID の形式違い。`global.` などが付いた推論プロファイル ID が必要な可能性。`npm run models` で確認 |
| `temperature` を含むエラー | そのモデルは `temperature` を受け付けません。`app.js` の `TEMPERATURE` を `null` に変更 |
| `ResourceNotFoundException` / 404 | モデル ID の打ち間違い、または `AWS_REGION` とキー発行リージョンの不一致 |
| `ThrottlingException` / 429 | 呼び出しすぎ。数秒待つ |
| `node: command not found` | Node.js が未インストール。[nodejs.org](https://nodejs.org/) から LTS 版を入れる |
| `fetch is not defined` | Node.js が 18 より古い。`node -v` で確認してアップデート |
| ポートが使用中 | `.env` の `PORT` を `8080` などに変更 |
| 昨日は動いたのに今日動かない | ほぼ確実にキーの失効です。再発行してください |

`app.js` はエラーの原因を日本語で表示するようにしてあるので、画面に出たメッセージをそのまま読んでみてください。

### curl で切り分ける

サーバを介さずに Bedrock 単体を叩いて確認したい場合（macOS / Linux）。

```bash
source .env
curl -s -X POST \
  "https://bedrock-runtime.$AWS_REGION.amazonaws.com/model/$MODEL_ID/converse" \
  -H "Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":[{"text":"こんにちは"}]}]}'
```

これが通ればキー・リージョン・モデル ID はすべて正しく、原因はコード側にあります。

---

## 料金とキーの扱い

- Bedrock は**使った分だけ課金**されます。送受信したトークン数が基準で、料金はモデルごとに違います（[料金表](https://aws.amazon.com/jp/bedrock/pricing/)）。軽量モデルで試すぶんには、ごく少額です
- 画面下に出るトークン数が、そのまま課金の単位です。演習4で見たとおり、会話が長引くほど1回あたりの入力トークンが増えます
- **キーを絶対にコミットしないでください。** `.env` は `.gitignore` 済みですが、キーをコード本体に直接書くと流出します
- 短期キーは最長12時間で失効します。この体験版では、長期キーではなく短期キーの利用を前提にしています

---

## 次のステップ

- **AWS SDK に乗り換える** — `npm install @aws-sdk/client-bedrock-runtime`。リトライやストリーミングを自分で書かずに済みます
- **ストリーミング表示** — 演習7。`ConverseStream` を使います
- **ツール利用（Function calling）** — AIに外部の関数や API を呼ばせる。[Tool use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html)
- **Guardrails** — 不適切な入出力をブロックする仕組み
- **本番運用の認証** — 短期キーは学習・検証用です。本番では IAM ロールによる一時認証情報を使ってください（[Securing Amazon Bedrock API keys](https://aws.amazon.com/blogs/security/securing-amazon-bedrock-api-keys-best-practices-for-implementation-and-management/)）

---

## 参考

- [Amazon Bedrock API キー](https://docs.aws.amazon.com/ja_jp/bedrock/latest/userguide/api-keys.html)
- [API キーの使い方](https://docs.aws.amazon.com/ja_jp/bedrock/latest/userguide/api-keys-use.html)
- [Converse API リファレンス](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Bedrock 入門](https://docs.aws.amazon.com/ja_jp/bedrock/latest/userguide/getting-started.html)

モデルごとの ID・対応 API・リージョン・料金は、各モデルカードが一次情報です。

- [Claude Opus 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5.html)
- [Claude Fable 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html)
- [GPT-5.6 Sol](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html)
- [GPT-5.6 Terra](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-terra.html)

AWS ドキュメントの内容は、ライセンス配慮のため要約して記載しています。
