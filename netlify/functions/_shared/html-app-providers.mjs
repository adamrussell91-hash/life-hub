export class ProviderConfigError extends Error {
  constructor(provider) {
    super(`Missing API key for ${provider}`);
    this.name = 'ProviderConfigError';
    this.provider = provider;
  }
}

export class ProviderUpstreamError extends Error {
  constructor(provider, status, message = `Upstream ${provider} failed (${status})`) {
    super(message);
    this.name = 'ProviderUpstreamError';
    this.provider = provider;
    this.status = status;
  }
}

export async function completeWithProvider(lane, messages, env) {
  if (lane.provider === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) throw new ProviderConfigError('openai');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: lane.model,
        max_tokens: lane.max_tokens,
        messages: [{ role: 'system', content: lane.system }, ...messages]
      })
    });
    if (!response.ok) {
      throw new ProviderUpstreamError('openai', response.status);
    }
    const body = await response.json();
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new ProviderUpstreamError('openai', response.status);
    return text;
  }

  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderConfigError('anthropic');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: lane.model,
      max_tokens: lane.max_tokens,
      system: lane.system,
      messages: messages.map(message => ({ role: message.role, content: message.content }))
    })
  });
  if (!response.ok) {
    throw new ProviderUpstreamError('anthropic', response.status);
  }
  const body = await response.json();
  const text = body.content?.find(part => part.type === 'text')?.text;
  if (typeof text !== 'string') throw new ProviderUpstreamError('anthropic', response.status);
  return text;
}
