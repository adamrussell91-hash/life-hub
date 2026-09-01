export function createSurfaceWidgetLibrary({ widgetsApi } = {}) {
  let state = { status: 'idle', widgets: [] };

  async function ensureLoaded({ force = false } = {}) {
    if (!widgetsApi?.list) return state;
    if (!force && (state.status === 'ready' || state.status === 'loading')) return state;
    state = { ...state, status: 'loading' };
    try {
      const data = await widgetsApi.list();
      state = { status: 'ready', widgets: data.widgets };
    } catch {
      state = { status: 'error', widgets: [] };
    }
    return state;
  }

  function getState() {
    return state;
  }

  return { ensureLoaded, getState };
}
