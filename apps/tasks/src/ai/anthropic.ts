export type AnthropicTextBlock = {
  type: 'text';
  text: string;
};

export type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string; text?: string };

export type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type AnthropicToolHandler = (
  name: string,
  input: Record<string, unknown>
) => Promise<unknown> | unknown;

type MessageParam = {
  role: 'user' | 'assistant';
  content: string | unknown[];
};

async function postAnthropic(input: {
  apiKey: string;
  model: string;
  system: string;
  messages: MessageParam[];
  maxTokens: number;
  tools?: AnthropicTool[];
  fetchImpl: typeof fetch;
}): Promise<AnthropicMessageResponse> {
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: input.messages
  };
  if (input.tools?.length) body.tools = input.tools;

  const response = await input.fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Anthropic ${response.status}: ${detail}`);
  }
  return (await response.json()) as AnthropicMessageResponse;
}

function collectText(content: AnthropicContentBlock[] | undefined): string {
  return (content ?? [])
    .filter((block): block is AnthropicTextBlock => block.type === 'text' && Boolean(block.text))
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function collectToolUses(content: AnthropicContentBlock[] | undefined): AnthropicToolUseBlock[] {
  return (content ?? []).filter(
    (block): block is AnthropicToolUseBlock =>
      block.type === 'tool_use' && typeof (block as AnthropicToolUseBlock).id === 'string'
  );
}

export async function createAnthropicMessage(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const body = await postAnthropic({
    apiKey: input.apiKey,
    model: input.model,
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
    maxTokens: input.maxTokens ?? 800,
    fetchImpl
  });
  return collectText(body.content);
}

/**
 * Multi-turn Messages call with tools. Runs tool handlers until the model
 * returns text (or maxRounds). Returns the final text content.
 */
export async function createAnthropicMessageWithTools(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  tools: AnthropicTool[];
  onTool: AnthropicToolHandler;
  maxTokens?: number;
  maxRounds?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const maxRounds = input.maxRounds ?? 4;
  const maxTokens = input.maxTokens ?? 1800;
  const messages: MessageParam[] = [{ role: 'user', content: input.user }];

  for (let round = 0; round < maxRounds; round += 1) {
    const body = await postAnthropic({
      apiKey: input.apiKey,
      model: input.model,
      system: input.system,
      messages,
      maxTokens,
      tools: input.tools,
      fetchImpl
    });
    const content = body.content ?? [];
    const toolUses = collectToolUses(content);
    if (!toolUses.length) {
      return collectText(content);
    }

    messages.push({ role: 'assistant', content });
    const results: unknown[] = [];
    for (const use of toolUses) {
      let result: unknown;
      try {
        result = await input.onTool(use.name, use.input ?? {});
      } catch (err) {
        result = {
          ok: false,
          note: err instanceof Error ? err.message : 'Tool failed'
        };
      }
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result)
      });
    }
    messages.push({ role: 'user', content: results });
  }

  throw new Error(`Anthropic tool loop exceeded ${maxRounds} rounds`);
}
