/** Invoke the background runner on the same API host, carrying the session. */
export function lessonJobRunUrl(request) {
  return new URL('/api/ai/job-run', request.url);
}

export async function kickLessonJobRun(request, jobId, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(lessonJobRunUrl(request), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-job-id': jobId,
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
        ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(5000)
    });
    return response.status === 202 || response.ok;
  } catch {
    return false;
  }
}
