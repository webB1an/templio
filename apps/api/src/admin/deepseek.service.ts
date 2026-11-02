import { Injectable, Logger } from "@nestjs/common";

export interface AiSuggestion {
  title: string;
  categoryKey: string;
  tags: string[];
  summary: string;
  confidence: number;
  safe: boolean;
}

interface SuggestInput {
  titleGuess?: string | null;
  text: {
    title?: string;
    outline?: string[];
    firstPagesText?: string[];
  };
  categories: Array<{ key: string; name: string }>;
}

const SYSTEM_PROMPT = [
  "你是「模板宝」的模板库内容运营助手，负责给 PPT/Word 模板生成上架信息。",
  "根据模板抽取出的文字（标题、大纲、前几页内容）判断它最适合的分类，生成简洁中文标题、标签和简介。",
  "只输出一个 JSON 对象，不要输出 Markdown。",
  "要求：标题不超过 20 个汉字；标签 2-4 个；简介不超过 60 个汉字；标题和简介客观描述模板用途，不要夸大。",
].join("\n");

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  private readonly baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  readonly model = (process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async suggest(input: SuggestInput): Promise<{
    suggestion: AiSuggestion;
    raw: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
  }> {
    if (!this.apiKey) throw new Error("服务端未配置 DEEPSEEK_API_KEY");

    const text = input.text || {};
    const categories = input.categories.map((item) => `${item.key}=${item.name}`).join("，");
    const userPrompt = [
      `可选分类（只能选一个 key）：${categories}`,
      `文件名兜底标题：${input.titleGuess || "(无)"}`,
      `文档标题：${text.title || "(无)"}`,
      `大纲：${(text.outline || []).slice(0, 20).join(" / ") || "(无)"}`,
      `前几页文字：${(text.firstPagesText || []).join("\n").slice(0, 6000) || "(无)"}`,
      '请输出 JSON：{"title":"标题","categoryKey":"分类 key","tags":["标签1","标签2"],"summary":"简介","confidence":0.9,"safe":true}',
    ].join("\n\n");

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(40_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`DeepSeek 调用失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content || "";
    this.logger.log(`DeepSeek 标注完成，输出 ${content.length} 字符`);

    return {
      suggestion: parseSuggestion(content),
      raw: content,
      model: this.model,
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
    };
  }
}

function parseSuggestion(content: string): AiSuggestion {
  const cleaned = String(content || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 返回内容不是有效 JSON");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("AI 返回内容 JSON 解析失败");
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 200) : "";
  const categoryKey = typeof parsed.categoryKey === "string" ? parsed.categoryKey.trim() : "";
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
    : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : "";
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

  if (!title) throw new Error("AI 未返回有效标题");

  return {
    title,
    categoryKey,
    tags,
    summary,
    confidence,
    safe: parsed.safe !== false,
  };
}
