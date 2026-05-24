import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { buildSystemPrompt } from "@/lib/prompts";
import type { TopicId, Level } from "@/types";

interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  topicId: TopicId;
  level: Level;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody;
  const { messages, topicId, level } = body;

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured. Add it to your environment variables." },
      { status: 503 }
    );
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const systemPrompt = buildSystemPrompt(topicId, level);

  const stream = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    stream: true,
    temperature: 0.8,
    max_tokens: 300,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
