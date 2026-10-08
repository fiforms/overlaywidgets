// The smallest useful widget. Shows the whole contract:
//   - draw into `el` using the width × height coordinate space
//   - read validated `params`
//   - use `api.storage` and `api.locale`
//   - return a cleanup function
//   - follow the manifest's `sizing` even when handed a box outside it:
//     draw in the largest allowed box, centered, or say SIZE TOO SMALL

const SVG_NS = 'http://www.w3.org/2000/svg';

function node(name, attrs, parent, text) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;   // never innerHTML
    parent.appendChild(el);
    return el;
}

// Keep these in step with "sizing" in manifest.json.
const ASPECT = { min: 2, max: 5 };
const MIN_WIDTH = 0.1 * 1920;

// The largest box with an allowed aspect ratio inside width × height,
// centered in it.
function fit(width, height) {
    const w = Math.min(width, height * ASPECT.max);
    const h = Math.min(height, w / ASPECT.min);
    return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

export function mount(el, { width, height, params, api }) {
    const box = fit(width, height);
    if (box.w < MIN_WIDTH) {
        // Too small to lay out: say so, centered, even if the text spills
        // outside the box.
        el.style.overflow = 'visible';
        const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%', style: 'overflow: visible' }, el);
        node('text', {
            x: width / 2, y: height / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': 28, fill: '#ef4444',
        }, svg, 'SIZE TOO SMALL');
        return () => {};
    }

    // Draw into the fitted box only: an SVG nested at its offset.
    const outer = node('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }, el);
    return draw(node('svg', { x: box.x, y: box.y, width: box.w, height: box.h, viewBox: `0 0 ${box.w} ${box.h}` }, outer), box.w, box.h, params, api);
}

function draw(svg, width, height, params, api) {
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
