// A minimal standalone widget host, about 100 lines. It does what a real
// host has to do:
//
//   1. load manifest.json and apply parameter defaults
//   2. create a box of defaultSize (or the size you pass) and scale it to fit
//   3. import the entry module and call mount(el, { width, height, params, api })
//   4. return dispose(), which runs the widget's cleanup and empties the box
//
// It does NOT validate parameters (a real host should; see README.md) and it
// has no server, so `api.fetch` is answered by whatever function you pass in
// as `fetchEndpoint`. See mock-data.js.

export class WidgetDataError extends Error {
    constructor(reason) {
        super(`Widget data unavailable: ${reason}`);
        this.reason = reason;
    }
}

function createStorage(prefix) {
    return {
        get(key) {
            try {
                const raw = localStorage.getItem(prefix + key);
                return raw === null ? null : JSON.parse(raw);
            } catch { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* unavailable */ }
        },
        remove(key) {
            try { localStorage.removeItem(prefix + key); } catch { /* unavailable */ }
        },
    };
}

/**
 * @param {HTMLElement} container   where to put the widget; it is scaled to fit its width
 * @param {string}      widgetDir   URL of the widget folder, e.g. '../clock'
 * @param {object}      [options]
 * @param {object}      [options.params]        overrides for manifest parameter defaults
 * @param {{w:number,h:number}} [options.size]  defaults to manifest.defaultSize
 * @param {(endpoint:string, args:object, params:object) => Promise<any>} [options.fetchEndpoint]
 *        resolves to the endpoint's data; throw WidgetDataError to simulate failure
 * @param {string}      [options.locale]        defaults to navigator.language
 * @param {object|null} [options.location]      { name, latitude, longitude, source } or null
 * @param {'live'|'editor'} [options.mode]
 * @param {string}      [options.instanceId]    keeps api.storage separate per placement
 * @returns {Promise<{ manifest: object, dispose: () => void }>}
 */
export async function mountWidget(container, widgetDir, options = {}) {
    const base = new URL(widgetDir.replace(/\/?$/, '/'), document.baseURI);
    const manifest = await (await fetch(new URL('manifest.json', base))).json();

    const params = { ...options.params };
    for (const [key, def] of Object.entries(manifest.parameters ?? {})) {
        if (params[key] === undefined) params[key] = def.default ?? (def.type === 'boolean' ? false : '');
    }
    Object.freeze(params);

    const { w, h } = options.size ?? manifest.defaultSize ?? { w: 400, h: 300 };

    // The box is always w × h CSS pixels; a CSS transform scales it to the container.
    const outer = document.createElement('div');
    outer.style.cssText = `position:relative;width:100%;aspect-ratio:${w}/${h};overflow:hidden`;
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform-origin:0 0;overflow:hidden`;
    outer.appendChild(box);
    container.replaceChildren(outer);
    const fit = () => { box.style.transform = `scale(${outer.clientWidth / w})`; };
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    fit();

    const api = Object.freeze({
        mode: options.mode ?? 'live',
        locale: options.locale ?? navigator.language,
        location: options.location ? Object.freeze({ ...options.location }) : null,
        storage: createStorage(`widget:${manifest.id}:${options.instanceId ?? 'default'}:`),
        ready() {},   // this example host doesn't wait for painting
        async fetch(endpoint, args = {}) {
            if (!options.fetchEndpoint) throw new WidgetDataError('not_configured');
            const data = await options.fetchEndpoint(endpoint, args, params);
            return { data, fetched_at: Math.floor(Date.now() / 1000), stale: false };
        },
    });

    let cleanup = null;
    let disposed = false;
    const module = await import(new URL(manifest.entry, base));
    const result = await module.mount(box, { width: w, height: h, params, api });
    cleanup = typeof result === 'function' ? result : null;

    function dispose() {
        if (disposed) return;
        disposed = true;
        observer.disconnect();
        try { cleanup?.(); } catch (err) { console.warn('widget cleanup failed', err); }
        container.replaceChildren();
    }

    return { manifest, dispose };
}
