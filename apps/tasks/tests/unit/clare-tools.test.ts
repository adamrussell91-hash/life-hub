import { describe, expect, it, vi } from 'vitest';
import { createAnthropicMessageWithTools } from '@/ai/anthropic';
import { createClareProposalJudge } from '@/ai/clare-proposal-judge';
import { buildClareDumpDigest } from '@/domain/clare-digest';
import {
  CLARE_CHECK_CLOCK_TOOL,
  CLARE_READ_PROTOCOL_TOOL,
  CLARE_SET_TIMEZONE_TOOL,
  CLARE_UPDATE_PROTOCOL_TOOL,
  createClareToolHandler,
  readClareClock
} from '@/domain/clare-tools';
import { applyProtocolUpdate } from '@/domain/agent-protocol';
import { resolveTimeZoneInput } from '@/domain/hub-prefs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('resolveTimeZoneInput', () => {
  it('maps Sydney shorthand and IANA ids', () => {
    expect(resolveTimeZoneInput('Sydney')).toBe('Australia/Sydney');
    expect(resolveTimeZoneInput('australia/sydney')).toBe('Australia/Sydney');
    expect(resolveTimeZoneInput('NotAPlace')).toBeNull();
  });
});

describe('clare clock tools', () => {
  it('check_clock returns Sunday in Sydney for a UTC Saturday evening', async () => {
    const instant = new Date('2026-08-29T22:05:00.000Z');
    const handler = createClareToolHandler({
      getTimezone: () => 'Australia/Sydney',
      setTimezone: async (timezone) => ({ ok: true, timezone, note: 'ok' }),
      getProtocol: () => '# Clare\n',
      setProtocol: async (markdown) => ({ ok: true, markdown, note: 'ok' }),
      now: () => instant
    });
    const result = (await handler(CLARE_CHECK_CLOCK_TOOL, { reason: 'Adam asked' })) as {
      today: string;
      today_weekday: string;
      timezone: string;
    };
    expect(result.today).toBe('2026-08-30');
    expect(result.today_weekday).toBe('Sunday');
    expect(result.timezone).toBe('Australia/Sydney');
  });

  it('set_timezone persists via runtime and returns a matching clock', async () => {
    let stored = 'UTC';
    const instant = new Date('2026-08-29T22:05:00.000Z');
    const handler = createClareToolHandler({
      getTimezone: () => stored,
      setTimezone: async (timezone) => {
        stored = timezone;
        return { ok: true, timezone, note: `Remembered ${timezone}` };
      },
      getProtocol: () => '# Clare\n',
      setProtocol: async (markdown) => ({ ok: true, markdown, note: 'ok' }),
      now: () => instant
    });
    const result = (await handler(CLARE_SET_TIMEZONE_TOOL, {
      timezone_or_city: 'Sydney'
    })) as { ok: boolean; timezone: string; clock: { today: string } };
    expect(result.ok).toBe(true);
    expect(result.timezone).toBe('Australia/Sydney');
    expect(stored).toBe('Australia/Sydney');
    expect(result.clock.today).toBe('2026-08-30');
    expect(readClareClock(instant, 'UTC').today).toBe('2026-08-29');
  });

  it('update_protocol can replace a ## section and persist', async () => {
    let protocol = '# Clare\n\n## Clock\n\nOld clock rules.\n\n## Voice\n\nFast.\n';
    const handler = createClareToolHandler({
      getTimezone: () => 'Australia/Sydney',
      setTimezone: async (timezone) => ({ ok: true, timezone, note: 'ok' }),
      getProtocol: () => protocol,
      setProtocol: async (markdown) => {
        protocol = markdown;
        return { ok: true, markdown, note: 'Saved' };
      },
      agentSlug: 'clare'
    });
    const result = (await handler(CLARE_UPDATE_PROTOCOL_TOOL, {
      mode: 'replace_section',
      section_heading: 'Clock',
      markdown: 'Always Australia/Sydney. Never invent dates.',
      reason: 'Adam corrected the day'
    })) as { ok: boolean; markdown: string };
    expect(result.ok).toBe(true);
    expect(protocol).toMatch(/Always Australia\/Sydney/);
    expect(protocol).toMatch(/## Voice/);
    expect(applyProtocolUpdate('# X\n', { mode: 'append', markdown: 'More.' }).ok).toBe(true);
    const read = (await handler(CLARE_READ_PROTOCOL_TOOL, {})) as { markdown: string };
    expect(read.markdown).toBe(protocol);
  });
});

describe('createAnthropicMessageWithTools', () => {
  it('runs a tool round then returns the final text', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'tool_1',
                name: CLARE_CHECK_CLOCK_TOOL,
                input: { reason: 'calendar check' }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            stop_reason: 'end_turn',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  voice: "Yep — Sunday the 30th in Sydney. What's the dump?",
                  items: []
                })
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    const onTool = vi.fn(async () => ({
      today: '2026-08-30',
      today_weekday: 'Sunday',
      timezone: 'Australia/Sydney'
    }));

    const text = await createAnthropicMessageWithTools({
      apiKey: 'test-key',
      model: 'claude-haiku-4-5',
      system: 'test',
      user: 'Today is Sunday 30th',
      tools: [
        {
          name: CLARE_CHECK_CLOCK_TOOL,
          description: 'clock',
          input_schema: { type: 'object', properties: {} }
        }
      ],
      onTool,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(onTool).toHaveBeenCalledWith(CLARE_CHECK_CLOCK_TOOL, { reason: 'calendar check' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(text).toMatch(/Sunday the 30th/);
  });
});

describe('createClareProposalJudge with tools', () => {
  it('lets Clare check the clock before answering a calendar correction', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'tool_use',
                id: 'tool_1',
                name: CLARE_CHECK_CLOCK_TOOL,
                input: { reason: 'Adam corrected the day' }
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  voice: "Fair — it's Sunday 30 August in Sydney. Dump when you're ready.",
                  items: []
                })
              }
            ]
          }),
          { status: 200 }
        )
      );

    const judge = createClareProposalJudge({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tools: {
        getTimezone: () => 'Australia/Sydney',
        setTimezone: async (timezone) => ({ ok: true, timezone, note: 'ok' }),
        getProtocol: () => '# Clare\n',
        setProtocol: async (markdown) => ({ ok: true, markdown, note: 'ok' }),
        now: () => new Date('2026-08-29T22:05:00.000Z')
      }
    });

    const digest = buildClareDumpDigest({
      text: 'It is Sunday the 30th. This is Sydney.',
      items: [],
      frameworks: seed.frameworks,
      tasks: [],
      projects: [],
      calibrations: [],
      preferredDomain: 'life',
      now: new Date('2026-08-29T22:05:00.000Z')
    });

    const judgment = await judge(digest);
    expect(judgment.ok).toBe(true);
    expect(judgment.items).toHaveLength(0);
    expect(judgment.voice).toMatch(/Sunday 30/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    expect(firstBody.tools.map((t: { name: string }) => t.name)).toContain(CLARE_CHECK_CLOCK_TOOL);
    expect(firstBody.tools.map((t: { name: string }) => t.name)).toContain(CLARE_UPDATE_PROTOCOL_TOOL);
    expect(firstBody.tools.map((t: { name: string }) => t.name)).toContain('read_repo_file');
  });
});
