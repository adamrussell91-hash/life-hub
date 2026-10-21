import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Media } from '@/schemas/media';
import { uploadMediaFile } from '@/teacher/media-api';
import { applyCreatedMedia } from '@/app/curriculum-state';
import {
  AUDIO_ACCEPT,
  asAudioFile,
  createUploadButton,
  fileMatchesAccept,
  resetSessionUploads,
  withSessionUploads
} from '@/blocks/upload-button';

vi.mock('@/teacher/media-api', () => ({ uploadMediaFile: vi.fn() }));
vi.mock('@/app/curriculum-state', () => ({ applyCreatedMedia: vi.fn() }));

const uploadMock = vi.mocked(uploadMediaFile);
const applyCreatedMediaMock = vi.mocked(applyCreatedMedia);
const ISO = '2026-01-01T00:00:00.000Z';

function mediaFor(file: File, id = `media_${file.name}`): Media {
  const url = `https://api.example/api/media/${id}/file`;
  return {
    id,
    type: 'media',
    title: file.name,
    slug: file.name,
    status: 'active',
    provider: 'direct',
    media_type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other',
    mime_type: file.type,
    file_name: file.name,
    preview_url: url,
    download_url: url,
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  };
}

const png = (name = 'diagram.png') => new File(['png'], name, { type: 'image/png' });
const pdf = (name = 'worksheet.pdf') => new File(['pdf'], name, { type: 'application/pdf' });

function pick(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}

function dropEvent(type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' }
  });
  return event;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  uploadMock.mockReset();
  applyCreatedMediaMock.mockReset();
  resetSessionUploads();
});

describe('fileMatchesAccept', () => {
  it('follows the accept attribute rules', () => {
    expect(fileMatchesAccept(png(), 'image/*')).toBe(true);
    expect(fileMatchesAccept(pdf(), 'image/*')).toBe(false);
    expect(fileMatchesAccept(pdf(), 'application/pdf,.pdf')).toBe(true);
    expect(fileMatchesAccept(new File([''], 'notes.PDF'), '.pdf')).toBe(true);
    expect(fileMatchesAccept(pdf(), undefined)).toBe(true);
  });
});

describe('createUploadButton', () => {
  it('opens the file chooser from a primary Upload from computer button', () => {
    const handle = createUploadButton({ accept: 'image/*', onUploaded: vi.fn() });
    expect(handle.button.textContent).toBe('Upload from computer');
    expect(handle.button.classList.contains('btn--primary')).toBe(true);
    expect(handle.input.type).toBe('file');
    expect(handle.input.hidden).toBe(true);
    expect(handle.input.accept).toBe('image/*');
    const click = vi.spyOn(handle.input, 'click');
    handle.button.click();
    expect(click).toHaveBeenCalled();
  });

  it('uploads through uploadMediaFile and hands back the media URL', async () => {
    const file = png();
    uploadMock.mockResolvedValue(mediaFor(file));
    const onUploaded = vi.fn();
    const handle = createUploadButton({ accept: 'image/*', onUploaded });

    pick(handle.input, [file]);
    await flush();

    expect(uploadMock).toHaveBeenCalledWith(file, { title: 'diagram.png' });
    expect(onUploaded).toHaveBeenCalledWith(
      'https://api.example/api/media/media_diagram.png/file',
      expect.objectContaining({ id: 'media_diagram.png' })
    );
    expect(handle.input.value).toBe('');
  });

  it('shows a busy status while uploading and clears it after', async () => {
    let finish!: (media: Media) => void;
    const file = png();
    uploadMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const handle = createUploadButton({ accept: 'image/*', onUploaded: vi.fn() });
    const status = handle.el.querySelector<HTMLElement>('.block-editor__upload-status')!;

    const done = handle.uploadFiles([file]);
    expect(handle.button.disabled).toBe(true);
    expect(handle.button.getAttribute('aria-busy')).toBe('true');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe('Uploading diagram.png…');

    finish(mediaFor(file));
    await done;
    expect(handle.button.disabled).toBe(false);
    expect(status.hidden).toBe(true);
  });

  it('shows an inline error when the upload fails', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    const onUploaded = vi.fn();
    const handle = createUploadButton({ accept: 'image/*', onUploaded });

    await handle.uploadFiles([png()]);

    const error = handle.el.querySelector<HTMLElement>('.block-editor__upload-error')!;
    expect(error.hidden).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain("Couldn't upload diagram.png");
    expect(onUploaded).not.toHaveBeenCalled();
    expect(handle.button.disabled).toBe(false);
  });

  it('rejects a file that does not match accept without uploading', async () => {
    const handle = createUploadButton({ accept: 'image/*', noun: 'an image', onUploaded: vi.fn() });
    await handle.uploadFiles([pdf()]);
    const error = handle.el.querySelector<HTMLElement>('.block-editor__upload-error')!;
    expect(error.textContent).toBe("worksheet.pdf isn't an image. Choose an image instead.");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects types the server will refuse, and files over 10 MB', async () => {
    const handle = createUploadButton({ onUploaded: vi.fn() });
    const error = handle.el.querySelector<HTMLElement>('.block-editor__upload-error')!;

    await handle.uploadFiles([new File(['x'], 'page.html', { type: 'text/html' })]);
    expect(error.textContent).toContain("can't be uploaded");

    const big = pdf('big.pdf');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await handle.uploadFiles([big]);
    expect(error.textContent).toContain('over 10 MB');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('accepts Word documents', async () => {
    const docx = new File(['d'], 'notes.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    uploadMock.mockResolvedValue(mediaFor(docx));
    const onUploaded = vi.fn();
    await createUploadButton({ onUploaded }).uploadFiles([docx]);
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it('uploads several files in turn when multiple', async () => {
    uploadMock.mockImplementation(async (file) => mediaFor(file));
    const onUploaded = vi.fn();
    const handle = createUploadButton({ accept: 'image/*', multiple: true, onUploaded });
    expect(handle.input.multiple).toBe(true);
    await handle.uploadFiles([png('a.png'), png('b.png')]);
    expect(onUploaded.mock.calls.map((call) => (call[1] as Media).title)).toEqual(['a.png', 'b.png']);
  });

  it('takes only the first file when not multiple', async () => {
    uploadMock.mockImplementation(async (file) => mediaFor(file));
    const onUploaded = vi.fn();
    await createUploadButton({ accept: 'image/*', onUploaded }).uploadFiles([png('a.png'), png('b.png')]);
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it('adds uploads to the library list and the curriculum cache', async () => {
    const file = pdf();
    const media = mediaFor(file);
    uploadMock.mockResolvedValue(media);
    await createUploadButton({ onUploaded: vi.fn() }).uploadFiles([file]);
    await flush();

    expect(applyCreatedMediaMock).toHaveBeenCalledWith(media);
    const existing = mediaFor(png(), 'media_old');
    expect(withSessionUploads([existing]).map((entry) => entry.id)).toEqual([media.id, 'media_old']);
    expect(withSessionUploads([media, existing])).toHaveLength(2);
  });

  it('uploads a file dropped on the drop target and stops the drop reaching outer blocks', async () => {
    const outer = document.createElement('div');
    const target = document.createElement('div');
    outer.append(target);
    const outerDrop = vi.fn();
    outer.addEventListener('drop', outerDrop);
    const file = png();
    uploadMock.mockResolvedValue(mediaFor(file));
    const onUploaded = vi.fn();
    createUploadButton({ accept: 'image/*', onUploaded, dropTarget: target });

    const over = dropEvent('dragover', [file]);
    target.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(target.classList.contains('block-editor__drop-target--active')).toBe(true);

    target.dispatchEvent(dropEvent('drop', [file]));
    await flush();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(outerDrop).not.toHaveBeenCalled();
    expect(target.classList.contains('block-editor__drop-target--active')).toBe(false);
  });
});

describe('asAudioFile', () => {
  it('reads a downloaded .webm that macOS calls video as audio', () => {
    const file = new File(['x'], 'Lesson Explainer.webm', { type: 'video/webm' });
    expect(fileMatchesAccept(file, AUDIO_ACCEPT)).toBe(true);
    expect(asAudioFile(file, AUDIO_ACCEPT).type).toBe('audio/webm');
  });

  it('fills in a missing type from the extension', () => {
    expect(asAudioFile(new File(['x'], 'take.m4a'), AUDIO_ACCEPT).type).toBe('audio/mp4');
  });

  it('leaves audio files, other pickers and other types alone', () => {
    const mp3 = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    expect(asAudioFile(mp3, AUDIO_ACCEPT)).toBe(mp3);
    const video = new File(['x'], 'clip.webm', { type: 'video/webm' });
    expect(asAudioFile(video, 'image/*')).toBe(video);
    const mov = new File(['x'], 'clip.mov', { type: 'video/quicktime' });
    expect(asAudioFile(mov, AUDIO_ACCEPT)).toBe(mov);
  });

  it('uploads a video-typed .webm through an audio button as audio', async () => {
    uploadMock.mockImplementation(async (file) => mediaFor(file));
    const onUploaded = vi.fn();
    const handle = createUploadButton({ accept: AUDIO_ACCEPT, noun: 'an audio file', onUploaded });
    await handle.uploadFiles([new File(['x'], 'Lesson Explainer.webm', { type: 'video/webm' })]);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0]![0].type).toBe('audio/webm');
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});
