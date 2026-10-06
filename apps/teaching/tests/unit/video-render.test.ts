import { describe, expect, it } from 'vitest';
import { renderVideoBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

type VideoBlock = Extract<Block, { block_type: 'video' }>;

function video(content: VideoBlock['content']): VideoBlock {
  return {
    id: 'v1',
    type: 'block',
    block_type: 'video',
    variant: 'large',
    visibility: 'student_teacher',
    content
  } as VideoBlock;
}

describe('renderVideoBlock', () => {
  it('plays a direct MP4 in a native player, including blocks saved before files were understood', () => {
    const url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    const el = renderVideoBlock(video({ provider: 'youtube', external_id: '', url }), 'student');
    const player = el.querySelector('video');
    expect(player?.getAttribute('src')).toBe(url);
    expect(player?.controls).toBe(true);
    expect(el.textContent).not.toContain('Video unavailable');
  });

  it('starts a YouTube embed at the pasted timestamp', () => {
    const el = renderVideoBlock(
      video({ provider: 'youtube', external_id: 'aircAruvnKk', url: 'https://youtu.be/aircAruvnKk?t=90' }),
      'student'
    );
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/aircAruvnKk?start=90'
    );
  });
});
