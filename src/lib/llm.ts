import Anthropic, { APIError as AnthropicAPIError } from "@anthropic-ai/sdk";
import OpenAI, { APIError as OpenAIAPIError } from "openai";
import type { AiTask } from "./ai-config";
import { resolveRoute } from "./ai-config";

function emptyReplyError(provider: string): Error {
  return new Error(`Leeg antwoord van ${provider}`);
}

function anthropicIsOverloaded(err: AnthropicAPIError): boolean {
  if (err.status === 529) return true;
  const raw = err.error as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return false;
  if (raw.type === "overloaded_error") return true;
  const inner = raw.error as { type?: string } | undefined;
  return inner?.type === "overloaded_error";
}

/** Korte, Nederlandse fouttekst voor UI en API-responses (geen ruwe provider-JSON). */
export function userMessageForLlmFailure(err: unknown): string {
  if (err instanceof AnthropicAPIError) {
    if (anthropicIsOverloaded(err)) {
      return "De AI-dienst is tijdelijk overbelast. Wacht even en probeer het opnieuw.";
    }
    if (err.status === 429) {
      return "Te veel verzoeken bij de AI-provider. Probeer het over een paar minuten opnieuw.";
    }
    if (err.status === 401) {
      return "Ongeldige of ontbrekende Anthropic API-sleutel.";
    }
    if (typeof err.status === "number" && err.status >= 500) {
      return "De AI-dienst heeft een tijdelijke storing. Probeer het later opnieuw.";
    }
  }
  if (err instanceof OpenAIAPIError) {
    if (err.status === 429) {
      return "Te veel verzoeken bij OpenAI. Probeer het over een paar minuten opnieuw.";
    }
    if (err.status === 401) {
      return "Ongeldige of ontbrekende OpenAI API-sleutel.";
    }
    if (typeof err.status === "number" && err.status >= 500) {
      return "De AI-dienst heeft een tijdelijke storing. Probeer het later opnieuw.";
    }
  }
  if (err instanceof Error) {
    const m = err.message.trim();
    if (/^\d{3}\s*\{/.test(m)) {
      return "Er ging iets mis bij het aanroepen van de AI. Probeer het later opnieuw.";
    }
    return m;
  }
  return "Onbekende fout bij de AI.";
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

/**
 * Streamt token-voor-token tekst voor het notities-endpoint (Anthropic of OpenAI).
 * Roept `onDelta` aan voor elk stukje nieuwe tekst; retourneert het volledige antwoord voor parsing.
 */
export async function chatCompletionNotesStream(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  onDelta: (text: string) => void
): Promise<string> {
  const route = resolveRoute("notes");

  if (route.provider === "openai") {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });
    const stream = await openai.chat.completions.create({
      model: route.model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    });
    let full = "";
    for await (const chunk of stream) {
      const c = chunk.choices[0]?.delta?.content;
      if (typeof c === "string" && c.length > 0) {
        full += c;
        onDelta(c);
      }
    }
    if (!full.trim()) throw emptyReplyError("OpenAI");
    return full;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msgStream = anthropic.messages.stream({
    model: route.model,
    max_tokens: maxTokens,
    ...(systemPrompt.trim() ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: userPrompt }],
  });
  msgStream.on("text", (delta: string) => {
    if (delta.length > 0) onDelta(delta);
  });
  const text = await msgStream.finalText();
  if (!text.trim()) throw emptyReplyError("Anthropic");
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
