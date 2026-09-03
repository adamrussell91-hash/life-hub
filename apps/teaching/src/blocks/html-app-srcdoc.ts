export type HtmlAppSrcdocOptions =
  | { injectAi: false }
  | {
      injectAi: true;
      lessonId: string;
      blockId: string;
      apiBaseUrl: string;
    };

function looksLikeFullDocument(html: string): boolean {
  const head = html.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

function aiBootstrapScript(lessonId: string, blockId: string, apiBaseUrl: string): string {
  const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/html-app-ai`;
  return `<script>(function(){
var ENDPOINT=${JSON.stringify(endpoint)};
var LESSON_ID=${JSON.stringify(lessonId)};
var BLOCK_ID=${JSON.stringify(blockId)};
window.TeachingHubAI={
  complete:function(messages){
    return fetch(ENDPOINT,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({lesson_id:LESSON_ID,block_id:BLOCK_ID,messages:messages||[]})
    }).then(function(r){return r.json().then(function(body){
      if(!r.ok||!body||body.ok===false){
        var msg=(body&&body.error&&body.error.message)||('AI request failed ('+r.status+')');
        return Promise.reject(new Error(msg));
      }
      var text=body.data&&body.data.text;
      if(typeof text!=='string') return Promise.reject(new Error('AI response missing text'));
      return {text:text};
    });});
  }
};
})();</script>`;
}

export function buildHtmlAppSrcdoc(html: string, options: HtmlAppSrcdocOptions): string {
  const bootstrap =
    options.injectAi === true
      ? aiBootstrapScript(options.lessonId, options.blockId, options.apiBaseUrl)
      : '';
  if (looksLikeFullDocument(html)) {
    if (!bootstrap) return html;
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bootstrap}</body>`);
    return `${html}${bootstrap}`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}${bootstrap}</body></html>`;
}
