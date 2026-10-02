// The smallest useful widget. Shows the whole contract:
//   - draw into `el` using the width × height coordinate space
//   - read validated `params`
//   - use `api.storage` and `api.locale`
//   - return a cleanup function

const SVG_NS = 'http://www.w3.org/2000/svg';

function node(name, attrs, parent, text) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;   // never innerHTML
    parent.appendChild(el);
    return el;
}

export function mount(el, { width, height, params, api }) {
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }, el);
    node('rect', { width, height, rx: height * 0.1, fill: params.background }, svg);

    const greeting = api.locale?.startsWith('es') ? 'Hola' : 'Hello';
    node('text', {
        x: width / 2, y: height * 0.45, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': height * 0.28, fill: params.color,
    }, svg, `${greeting}, ${params.name}!`);

    let timer = null;
    if (params.show_visits) {
        const visits = (api.storage.get('visits') ?? 0) + 1;
        api.storage.set('visits', visits);

        const label = node('text', {
            x: width / 2, y: height * 0.8, 'text-anchor': 'middle',
            'font-family': 'sans-serif', 'font-size': height * 0.11, fill: params.color, opacity: 0.8,
        }, svg);
        const started = Date.now();
        const tick = () => {
            const s = Math.floor((Date.now() - started) / 1000);
            label.textContent = `Shown ${visits} time${visits === 1 ? '' : 's'} · on screen for ${s}s`;
        };
        tick();
        timer = setInterval(tick, 1000);
    }

    return () => clearInterval(timer);
}
