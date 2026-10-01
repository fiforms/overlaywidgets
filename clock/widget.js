// Clock widget for AnnouncementSlides overlays.
//
// Draws into a width × height SVG; the host positions and scales the box.
// Builds DOM nodes with textContent only (never innerHTML) — parameters
// come from slide editors and must be treated as untrusted text.

const SVG_NS = 'http://www.w3.org/2000/svg';

function node(name, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    parent?.appendChild(el);
    return el;
}

export function mount(el, { width, height, params, api }) {
    const color = params.color || '#ffffff';
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }, el);
    const opacity = Number(params.background_opacity ?? 0.4);
    if (opacity > 0) {
        node('rect', {
            x: 0, y: 0, width, height, rx: Math.min(width, height) * 0.08,
            fill: params.background || '#000000', 'fill-opacity': opacity,
        }, svg);
    }

    const draw = params.style === 'analog'
        ? analog(svg, width, height, params, color, api.locale)
        : digital(svg, width, height, params, color, api.locale);

    let timer = null;
    function tick() {
        const now = new Date();
        draw(now);
        // Re-arm on the next second (or minute) boundary so the display
        // never drifts from the wall clock.
        const step = params.show_seconds || params.style === 'analog' ? 1000 : 60000;
        timer = setTimeout(tick, step - (now.getTime() % step) + 5);
    }
    tick();

    return () => clearTimeout(timer);
}

function digital(svg, width, height, params, color, locale) {
    const hasDate = params.show_date;
    const timeSize = Math.min(height * (hasDate ? 0.42 : 0.6), width / (params.show_seconds ? 5.2 : 3.6));
    const dateSize = Math.min(height * 0.14, width / 12);
    const timeY = hasDate ? height / 2 - dateSize * 0.2 : height / 2;

    const time = node('text', {
        x: width / 2, y: timeY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': timeSize, fill: color,
        style: 'font-variant-numeric: tabular-nums',
    }, svg);
    const date = hasDate ? node('text', {
        x: width / 2, y: timeY + timeSize * 0.55 + dateSize, 'text-anchor': 'middle',
        'font-family': 'sans-serif', 'font-size': dateSize, fill: color, opacity: 0.85,
    }, svg) : null;

    const timeFormat = new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', second: params.show_seconds ? '2-digit' : undefined,
        hour12: params.hours !== '24',
    });
    const dateFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' });

    return now => {
        time.textContent = timeFormat.format(now);
        if (date) date.textContent = dateFormat.format(now);
    };
}

function analog(svg, width, height, params, color, locale) {
    const dateSize = params.show_date ? Math.min(height * 0.1, width / 10) : 0;
    const r = Math.min(width, height - dateSize * 1.6) / 2 * 0.9;
    const cx = width / 2;
    const cy = (height - dateSize * 1.6) / 2;

    node('circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': r * 0.04 }, svg);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const inner = i % 3 === 0 ? 0.78 : 0.86;
        node('line', {
            x1: cx + Math.sin(a) * r * inner, y1: cy - Math.cos(a) * r * inner,
            x2: cx + Math.sin(a) * r * 0.94, y2: cy - Math.cos(a) * r * 0.94,
            stroke: color, 'stroke-width': r * (i % 3 === 0 ? 0.045 : 0.025), 'stroke-linecap': 'round',
        }, svg);
    }

    const hand = (len, w) => node('line', {
        x1: cx, y1: cy, x2: cx, y2: cy - r * len, stroke: color, 'stroke-width': r * w, 'stroke-linecap': 'round',
    }, svg);
    const hourHand = hand(0.5, 0.07);
    const minuteHand = hand(0.75, 0.045);
    const secondHand = params.show_seconds ? hand(0.85, 0.015) : null;
    secondHand?.setAttribute('stroke', '#ef4444');
    node('circle', { cx, cy, r: r * 0.05, fill: color }, svg);

    const date = params.show_date ? node('text', {
        x: width / 2, y: height - dateSize * 0.6, 'text-anchor': 'middle',
        'font-family': 'sans-serif', 'font-size': dateSize, fill: color, opacity: 0.85,
    }, svg) : null;
    const dateFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });

    const rotate = (line, deg) => line.setAttribute('transform', `rotate(${deg} ${cx} ${cy})`);

    return now => {
        const s = now.getSeconds();
        const m = now.getMinutes() + s / 60;
        const h = (now.getHours() % 12) + m / 60;
        rotate(hourHand, h * 30);
        rotate(minuteHand, m * 6);
        if (secondHand) rotate(secondHand, s * 6);
        if (date) date.textContent = dateFormat.format(now);
    };
}
