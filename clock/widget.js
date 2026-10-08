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

// Keep in step with "sizing" in manifest.json.
const SIZING = {
    digital: { aspect: { min: 2, max: 5 }, minWidth: 0.12 },
    analog: { aspect: { min: 0.8, max: 1.25 }, minWidth: 0.08 },
};

export function mount(el, { width: areaW, height: areaH, params, api }) {
    // Outside our allowed shapes, draw in the largest allowed box, centered
    // in the area we were given; if that is too narrow, just say so.
    const rule = SIZING[params.style] ?? SIZING.digital;
    const width = Math.min(areaW, areaH * rule.aspect.max);
    const height = Math.min(areaH, width / rule.aspect.min);
    if (width < rule.minWidth * 1920) {
        el.style.overflow = 'visible';
        const warn = node('svg', { viewBox: `0 0 ${areaW} ${areaH}`, width: '100%', height: '100%', style: 'overflow: visible' }, el);
        node('text', {
            x: areaW / 2, y: areaH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': 28, fill: '#ef4444',
        }, warn, 'SIZE TOO SMALL');
        return () => {};
    }

    const color = params.color || '#ffffff';
    const outer = node('svg', { viewBox: `0 0 ${areaW} ${areaH}`, width: '100%', height: '100%' }, el);
    const svg = node('svg', {
        x: (areaW - width) / 2, y: (areaH - height) / 2, width, height, viewBox: `0 0 ${width} ${height}`,
    }, outer);
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

// Width, per 1px of font size, of the widest of `samples`. Measured in the
// real font where the browser can (the clock's digits are tabular, so this is
// stable), with a generous estimate where it can't.
function widest(svg, samples, bold) {
    const probe = node('text', {
        'font-family': 'sans-serif', 'font-size': 100, 'font-weight': bold ? 'bold' : 'normal',
        style: 'font-variant-numeric: tabular-nums', visibility: 'hidden',
    }, svg);
    let max = 0;
    let chars = 0;
    for (const sample of samples) {
        probe.textContent = sample;
        chars = Math.max(chars, sample.length);
        try { max = Math.max(max, probe.getComputedTextLength() / 100); } catch { /* not rendered yet */ }
    }
    probe.remove();
    return max || chars * 0.65;
}

function digital(svg, width, height, params, color, locale) {
    const hasDate = params.show_date;
    const pad = Math.min(width, height) * 0.06;
    const timeFormat = new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', second: params.show_seconds ? '2-digit' : undefined,
        hour12: params.hours !== '24',
    });
    const dateFormat = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' });

    // Size the text from the widest string it will ever show, so it always
    // fits the box and doesn't change size as the digits change.
    const timeWidth = widest(svg, [0, 1, 10, 12, 13, 22].map(h => timeFormat.format(new Date(2000, 0, 1, h, 8, 8))), true);
    const days = Array.from({ length: 92 }, (_, i) => dateFormat.format(new Date(2000, 0, 1 + i * 4)));
    const dateWidth = hasDate ? widest(svg, days, false) : 0;

    const room = width - pad * 2;
    const timeSize = Math.min(height * (hasDate ? 0.42 : 0.6), room / timeWidth);
    const dateSize = Math.min(height * 0.14, room / dateWidth, timeSize * 0.45);
    // Centre the block (time, then date) in the box.
    const blockH = hasDate ? timeSize * 1.05 + dateSize * 1.2 : timeSize;
    const timeY = (height - blockH) / 2 + timeSize * 0.5;

    const time = node('text', {
        x: width / 2, y: timeY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': timeSize, fill: color,
        style: 'font-variant-numeric: tabular-nums',
    }, svg);
    const date = hasDate ? node('text', {
        x: width / 2, y: timeY + timeSize * 0.55 + dateSize, 'text-anchor': 'middle',
        'font-family': 'sans-serif', 'font-size': dateSize, fill: color, opacity: 0.85,
    }, svg) : null;

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
