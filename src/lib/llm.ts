import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiTask } from "./ai-config";
import { resolveRoute } from "./ai-config";

function emptyReplyError(provider: string): Error {
  return new Error(`Leeg antwoord van ${provider}`);
}

export async function chatCompletion(
  task: AiTask,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const route = resolveRoute(task);

  if (route.provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });
    const response = await openai.chat.completions.create({
      model: route.model,
      max_tokens: maxTokens,
      messages,
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw emptyReplyError("OpenAI");
    return text;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: route.model,
    max_tokens: maxTokens,
    ...(systemPrompt.trim() ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw emptyReplyError("Anthropic");
  return text;
}

export async function chatCompletionMulti(
  task: AiTask,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number
): Promise<string> {
  const route = resolveRoute(task);

  if (route.provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const response = await openai.chat.completions.create({
      model: route.model,
      max_tokens: maxTokens,
      messages: apiMessages,
    });
    const text = response.choices[0]?.message?.content;
    if (!text) throw emptyReplyError("OpenAI");
    return text;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: route.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw emptyReplyError("Anthropic");
  return text;
}
