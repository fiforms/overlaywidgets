// Weather widget for AnnouncementSlides overlays — data from Open-Meteo
// (https://open-meteo.com, CC BY 4.0; the credit is drawn in the corner).
//
// Two server-fetched endpoints (see manifest.json): `geocode` turns the
// saved ZIP code into a place and coordinates, then `forecast` is called
// with those coordinates as runtime args. With the ZIP left blank, the
// coordinates come from api.location instead — the screen's own church, or
// the site's default location — so one global slide shows each church its
// local weather. Everything is drawn as SVG built
// with createElementNS/textContent — never innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRESH_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

const TEXT = {
    en: {
        today: 'Today', feels: 'Feels like', humidity: 'Humidity', wind: 'Wind',
        notFound: 'Location not found', unavailable: 'Weather unavailable',
        screenHint: name => `Blank ZIP: each screen shows its church's weather · preview: ${name}`,
        noLocation: 'Blank ZIP: each screen will show its own church\'s weather. This page has no location to preview.',
        conditions: {
            clear: 'Clear', mostlyClear: 'Mostly clear', partly: 'Partly cloudy', overcast: 'Overcast',
            fog: 'Fog', drizzle: 'Drizzle', freezingDrizzle: 'Freezing drizzle', rain: 'Rain',
            heavyRain: 'Heavy rain', freezingRain: 'Freezing rain', snow: 'Snow', showers: 'Showers',
            snowShowers: 'Snow showers', storm: 'Thunderstorms', hail: 'Thunderstorms with hail',
        },
    },
    es: {
        today: 'Hoy', feels: 'Sensación', humidity: 'Humedad', wind: 'Viento',
        notFound: 'Ubicación no encontrada', unavailable: 'Clima no disponible',
        screenHint: name => `Sin código postal: cada pantalla muestra el clima de su iglesia · vista previa: ${name}`,
        noLocation: 'Sin código postal: cada pantalla mostrará el clima de su iglesia. Esta página no tiene ubicación para la vista previa.',
        conditions: {
            clear: 'Despejado', mostlyClear: 'Mayormente despejado', partly: 'Parcialmente nublado', overcast: 'Nublado',
            fog: 'Niebla', drizzle: 'Llovizna', freezingDrizzle: 'Llovizna helada', rain: 'Lluvia',
            heavyRain: 'Lluvia fuerte', freezingRain: 'Lluvia helada', snow: 'Nieve', showers: 'Chubascos',
            snowShowers: 'Chubascos de nieve', storm: 'Tormentas', hail: 'Tormentas con granizo',
        },
    },
};

// WMO weather interpretation codes → [condition label key, symbol].
function classify(code) {
    if (code === 0) return ['clear', 'clear'];
    if (code === 1) return ['mostlyClear', 'partly'];
    if (code === 2) return ['partly', 'partly'];
    if (code === 3) return ['overcast', 'overcast'];
    if (code === 45 || code === 48) return ['fog', 'fog'];
    if (code >= 51 && code <= 55) return ['drizzle', 'drizzle'];
    if (code === 56 || code === 57) return ['freezingDrizzle', 'drizzle'];
    if (code === 61 || code === 63) return ['rain', 'rain'];
    if (code === 65) return ['heavyRain', 'rain'];
    if (code === 66 || code === 67) return ['freezingRain', 'rain'];
    if (code >= 71 && code <= 77) return ['snow', 'snow'];
    if (code >= 80 && code <= 82) return ['showers', 'rain'];
    if (code === 85 || code === 86) return ['snowShowers', 'snow'];
    if (code === 95) return ['storm', 'storm'];
    if (code === 96 || code === 99) return ['hail', 'storm'];
    return ['overcast', 'overcast'];
}

function node(name, attrs = {}, parent = null, text = null) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    if (text !== null) el.textContent = text;
    parent?.appendChild(el);
    return el;
}

// Average sans-serif glyph width ≈ 0.52 em.
const GLYPH = 0.52;

function fit(text, size, maxWidth) {
    const max = Math.max(1, Math.floor(maxWidth / (size * GLYPH)));
    return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
}

// ── Symbols ──────────────────────────────────────────────────────────────
// Drawn in a 100×100 box, then placed with a transform.

let uidCounter = 0;

function defs(svg, uid) {
    const d = node('defs', {}, svg);
    const grad = (id, stops, attrs = { x1: 0, y1: 0, x2: 0, y2: 1 }) => {
        const g = node('linearGradient', { id: `${uid}-${id}`, ...attrs }, d);
        stops.forEach(([offset, color]) => node('stop', { offset, 'stop-color': color }, g));
    };
    grad('sun', [[0, '#fde047'], [1, '#f59e0b']], { x1: 0, y1: 0, x2: 1, y2: 1 });
    grad('moon', [[0, '#f8fafc'], [1, '#cbd5e1']], { x1: 0, y1: 0, x2: 1, y2: 1 });
    grad('cloud', [[0, '#ffffff'], [1, '#dbe4ee']]);
    grad('grey', [[0, '#cbd5e1'], [1, '#94a3b8']]);
    grad('dark', [[0, '#94a3b8'], [1, '#475569']]);
    const shadow = node('filter', { id: `${uid}-shadow`, x: '-20%', y: '-20%', width: '140%', height: '150%' }, d);
    node('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2, 'flood-color': '#000', 'flood-opacity': 0.25 }, shadow);
}

function sun(g, uid, cx, cy, r) {
    const rays = node('g', { stroke: '#fbbf24', 'stroke-width': r * 0.16, 'stroke-linecap': 'round' }, g);
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        node('line', {
            x1: cx + Math.cos(a) * r * 1.35, y1: cy + Math.sin(a) * r * 1.35,
            x2: cx + Math.cos(a) * r * 1.75, y2: cy + Math.sin(a) * r * 1.75,
        }, rays);
    }
    node('circle', { cx, cy, r, fill: `url(#${uid}-sun)` }, g);
}

function moon(g, uid, cx, cy, r) {
    // Crescent: a disc with an offset disc cut away.
    const id = `${uid}-cut-${uidCounter++}`;
    const mask = node('mask', { id }, g);
    node('rect', { x: cx - r * 2, y: cy - r * 2, width: r * 4, height: r * 4, fill: '#fff' }, mask);
    node('circle', { cx: cx + r * 0.55, cy: cy - r * 0.4, r: r * 0.85, fill: '#000' }, mask);
    node('circle', { cx, cy, r, fill: `url(#${uid}-moon)`, mask: `url(#${id})` }, g);
    // Two stars in the cut-away part of the sky.
    node('circle', { cx: cx + r * 0.62, cy: cy - r * 0.38, r: r * 0.09, fill: '#e2e8f0' }, g);
    node('circle', { cx: cx + r * 1.05, cy: cy - r * 0.95, r: r * 0.06, fill: '#e2e8f0' }, g);
}

function cloud(g, uid, x, y, s, fill = 'cloud') {
    // A union of discs on a rounded base, with its top-left at (x, y),
    // 60 × 34 units at s = 1.
    const c = node('g', { fill: `url(#${uid}-${fill})`, filter: `url(#${uid}-shadow)` }, g);
    node('circle', { cx: x + 18 * s, cy: y + 20 * s, r: 12 * s }, c);
    node('circle', { cx: x + 33 * s, cy: y + 14 * s, r: 14 * s }, c);
    node('circle', { cx: x + 47 * s, cy: y + 21 * s, r: 10 * s }, c);
    node('rect', { x: x + 6 * s, y: y + 18 * s, width: 50 * s, height: 16 * s, rx: 8 * s }, c);
}

function symbol(parent, uid, kind, night, x, y, size) {
    const g = node('g', { transform: `translate(${x} ${y}) scale(${size / 100})` }, parent);
    const sky = (cx, cy, r) => (night ? moon(g, uid, cx, cy, r) : sun(g, uid, cx, cy, r));

    switch (kind) {
        case 'clear':
            sky(50, 50, night ? 30 : 24);
            break;
        case 'partly':
            sky(38, 36, night ? 22 : 17);
            cloud(g, uid, 28, 44, 1.05);
            break;
        case 'overcast':
            cloud(g, uid, 10, 22, 0.95, 'grey');
            cloud(g, uid, 26, 38, 1.1);
            break;
        case 'fog': {
            cloud(g, uid, 18, 16, 1.05, 'grey');
            const lines = node('g', { stroke: '#cbd5e1', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
            [[16, 64, 76], [26, 76, 86], [12, 88, 66]].forEach(([x1, yy, x2]) => node('line', { x1, y1: yy, x2, y2: yy }, lines));
            break;
        }
        case 'drizzle':
        case 'rain': {
            cloud(g, uid, 18, 14, 1.1, kind === 'rain' ? 'grey' : 'cloud');
            const drops = node('g', { stroke: '#60a5fa', 'stroke-width': kind === 'rain' ? 5 : 4, 'stroke-linecap': 'round' }, g);
            const len = kind === 'rain' ? 14 : 5;
            [[34, 60], [50, 66], [66, 60], ...(kind === 'rain' ? [[42, 80], [58, 84]] : [[42, 78], [58, 80]])]
                .forEach(([dx, dy]) => node('line', { x1: dx, y1: dy, x2: dx - len * 0.35, y2: dy + len }, drops));
            break;
        }
        case 'snow': {
            cloud(g, uid, 18, 12, 1.1, 'grey');
            const flakes = node('g', { stroke: '#ffffff', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
            [[34, 66], [52, 74], [70, 66], [43, 86], [61, 88]].forEach(([fx, fy]) => {
                for (let i = 0; i < 3; i++) {
                    const a = (i * Math.PI) / 3;
                    node('line', { x1: fx - Math.cos(a) * 5, y1: fy - Math.sin(a) * 5, x2: fx + Math.cos(a) * 5, y2: fy + Math.sin(a) * 5 }, flakes);
                }
            });
            break;
        }
        case 'storm':
            cloud(g, uid, 18, 12, 1.1, 'dark');
            node('polygon', { points: '52,52 38,76 50,76 44,94 66,66 53,66 60,52', fill: '#facc15', stroke: '#f59e0b', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
            break;
    }
}

// ── Widget ───────────────────────────────────────────────────────────────

// Tell the host we paint after slow fetches: it calls api.ready() below
// instead of treating us as ready when mount returns.
export const manualReady = true;

export function mount(el, { width, height, params, api }) {
    const text = TEXT[(api.locale || 'en').slice(0, 2)] ?? TEXT.en;
    const fahrenheit = params.units !== 'celsius';
    const color = params.color || '#ffffff';
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }, el);
    const uid = `wx${Math.random().toString(36).slice(2, 8)}`;
    const pad = Math.min(width, height) * 0.06;
    // Blank ZIP = use the screen's location (api.location).
    const useScreen = !params.zip;
    const editor = api.mode === 'editor';

    let place = null;
    let weather = null;
    let message = null;
    let disposed = false;
    let timer = null;

    function render() {
        svg.replaceChildren();
        // Nothing to say on a live screen (e.g. a global slide on a page with
        // no church and no default location): draw nothing at all.
        if (!weather && !message) return;
        defs(svg, uid);
        const opacity = Number(params.background_opacity ?? 0.7);
        if (opacity > 0) {
            node('rect', { width, height, rx: Math.min(width, height) * 0.06, fill: params.background || '#0c4a6e', 'fill-opacity': opacity }, svg);
        }

        if (!weather) {
            // Word-wrapped, centred.
            const size = Math.min(height * 0.1, width * 0.05);
            const perLine = Math.max(8, Math.floor((width - pad * 2) / (size * GLYPH)));
            const lines = [];
            for (const word of message.split(' ')) {
                const last = lines[lines.length - 1];
                if (last && `${last} ${word}`.length <= perLine) lines[lines.length - 1] = `${last} ${word}`;
                else lines.push(word);
            }
            lines.forEach((line, i) => node('text', {
                x: width / 2, y: height / 2 + (i - (lines.length - 1) / 2) * size * 1.3,
                'text-anchor': 'middle', 'dominant-baseline': 'central',
                'font-family': 'sans-serif', 'font-size': size, fill: color, opacity: 0.85,
            }, svg, line));
            return;
        }

        if (params.mode === 'current') current(0, height);
        else forecast(params.mode === '7-day' ? 7 : 3);

        // CC BY 4.0 attribution for Open-Meteo's data.
        const credit = Math.max(10, Math.min(height * 0.035, 18));
        node('text', {
            x: width - pad * 0.6, y: height - pad * 0.45, 'text-anchor': 'end', 'font-family': 'sans-serif',
            'font-size': credit, fill: color, opacity: 0.45,
        }, svg, 'Weather data: Open-Meteo.com');

        // Editor preview only: make the blank-ZIP behaviour explicit.
        if (editor && useScreen) {
            node('text', {
                x: pad * 0.6, y: height - pad * 0.45, 'font-family': 'sans-serif', 'font-size': credit,
                fill: '#fde68a',
            }, svg, fit(text.screenHint(place.name), credit, width - pad * 1.2 - credit * GLYPH * 30));
        }
    }

    function degrees(value) {
        return `${Math.round(value)}°`;
    }

    function placeLabel() {
        if (params.place_name) return params.place_name;
        if (!place) return '';
        if (place.fromScreen) return place.name;
        return [place.name, place.country_code === 'US' ? place.admin1 : place.country].filter(Boolean).join(', ');
    }

    // Current conditions in the band [top, top + bandH]. Full-height
    // (current-only mode): place name, then temperature + condition, then
    // details. Compact (above a forecast): place name in the top-right
    // corner instead, details under the temperature.
    function current(top, bandH) {
        const c = weather.current;
        const [label, kind] = classify(c.weather_code);
        const night = c.is_day === 0;
        const compact = bandH < height;

        const iconSize = Math.min(bandH - pad * 2, width * 0.3);
        symbol(svg, uid, kind, night, pad, top + (bandH - iconSize) / 2, iconSize);

        const x = pad * 1.6 + iconSize;
        const avail = width - x - pad;
        const name = placeLabel();
        const lineSize = Math.min(bandH * (compact ? 0.13 : 0.1), avail / 18);
        const tempSize = Math.min(bandH * (compact ? 0.42 : 0.34), avail * 0.3);

        // Vertical stack, centred in the band.
        const nameH = name && !compact ? lineSize * 1.5 : 0;
        const stackH = nameH + tempSize + lineSize * 1.6;
        let y = top + (bandH - stackH) / 2;

        if (name && !compact) {
            node('text', { x, y: y + lineSize, 'font-family': 'sans-serif', 'font-size': lineSize, fill: color, opacity: 0.8 }, svg, fit(name, lineSize, avail));
            y += nameH;
        }

        const baseline = y + tempSize * 0.85;
        node('text', { x, y: baseline, 'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': tempSize, fill: color }, svg, degrees(c.temperature_2m));
        const condX = x + tempSize * (Math.abs(Math.round(c.temperature_2m)) >= 100 ? 2.2 : 1.75);
        const condSize = Math.min(lineSize * 1.4, tempSize * 0.42);
        node('text', {
            x: condX, y: baseline - tempSize * 0.32, 'dominant-baseline': 'central', 'font-family': 'sans-serif',
            'font-size': condSize, fill: color,
        }, svg, fit(text.conditions[label], condSize, width - condX - pad - (compact && name ? width * 0.42 : 0)));

        const wind = fahrenheit ? `${Math.round(c.wind_speed_10m * 0.621371)} mph` : `${Math.round(c.wind_speed_10m)} km/h`;
        const details = `${text.feels} ${degrees(c.apparent_temperature)}  ·  ${text.humidity} ${Math.round(c.relative_humidity_2m)}%  ·  ${text.wind} ${wind}`;
        // Shrinks to fit its line rather than losing the end of it.
        const detailsSize = Math.max(lineSize * 0.6, Math.min(lineSize, avail / (details.length * GLYPH)));
        node('text', {
            x, y: baseline + lineSize * 1.5, 'font-family': 'sans-serif', 'font-size': detailsSize, fill: color, opacity: 0.8,
            'xml:space': 'preserve',
        }, svg, fit(details, detailsSize, avail));

        if (name && compact) {
            node('text', {
                x: width - pad, y: top + pad + lineSize * 0.6, 'text-anchor': 'end', 'font-family': 'sans-serif',
                'font-size': lineSize, fill: color, opacity: 0.7,
            }, svg, fit(name, lineSize, width * 0.42));
        }
    }

    function forecast(days) {
        const bandH = height * 0.42;
        current(0, bandH);

        const d = weather.daily;
        const count = Math.min(days, d.time.length);
        const top = bandH + pad * 0.2;
        const colW = (width - pad * 2) / count;
        const colH = height - top - pad * 1.1;
        node('line', {
            x1: pad, y1: top, x2: width - pad, y2: top, stroke: color, 'stroke-opacity': 0.25, 'stroke-width': Math.max(1, height * 0.004),
        }, svg);

        const dayFormat = new Intl.DateTimeFormat(api.locale, { weekday: 'short' });
        const nameSize = Math.min(colH * 0.13, colW * 0.2);
        const tempSize = Math.min(colH * 0.14, colW * 0.18);
        const iconSize = Math.min(colH * 0.42, colW * 0.62);

        for (let i = 0; i < count; i++) {
            const cx = pad + colW * i + colW / 2;
            const [y, m, dd] = d.time[i].split('-').map(Number);
            const name = i === 0 ? text.today : dayFormat.format(new Date(y, m - 1, dd));
            node('text', {
                x: cx, y: top + colH * 0.2, 'text-anchor': 'middle', 'font-family': 'sans-serif',
                'font-weight': 'bold', 'font-size': nameSize, fill: color,
            }, svg, fit(name, nameSize, colW * 0.95));

            symbol(svg, uid, classify(d.weather_code[i])[1], false, cx - iconSize / 2, top + colH * 0.25, iconSize);

            // High and low as separate texts either side of the column
            // centre, so they never run together.
            const tempY = top + colH * 0.25 + iconSize + tempSize * 1.05;
            const gap = tempSize * 0.2;
            node('text', {
                x: cx - gap, y: tempY, 'text-anchor': 'end', 'font-family': 'sans-serif',
                'font-weight': 'bold', 'font-size': tempSize, fill: color,
            }, svg, degrees(d.temperature_2m_max[i]));
            node('text', {
                x: cx + gap, y: tempY, 'text-anchor': 'start', 'font-family': 'sans-serif',
                'font-size': tempSize, fill: color, opacity: 0.65,
            }, svg, degrees(d.temperature_2m_min[i]));

            const pop = d.precipitation_probability_max?.[i];
            if (pop !== null && pop !== undefined && pop >= 10) {
                node('text', {
                    x: cx, y: top + colH * 0.25 + iconSize + tempSize * 2.2, 'text-anchor': 'middle',
                    'font-family': 'sans-serif', 'font-size': tempSize * 0.8, fill: '#7dd3fc',
                }, svg, `${Math.round(pop)}%`);
            }
        }
    }

    async function load() {
        timer = null;
        try {
            if (!place && useScreen) {
                if (!api.location) {
                    message = editor ? text.noLocation : null;
                    return;
                }
                place = { name: api.location.name, latitude: api.location.latitude, longitude: api.location.longitude, fromScreen: true };
            }
            if (!place) {
                const geo = await api.fetch('geocode');
                place = geo.data?.results?.[0] ?? null;
                if (!place) {
                    message = text.notFound;
                    return;
                }
            }
            // Rounded so nearby screens share the server's cached forecast.
            const result = await api.fetch('forecast', {
                lat: Math.round(place.latitude * 100) / 100,
                lon: Math.round(place.longitude * 100) / 100,
            });
            if (disposed) return;
            weather = result.data;
            message = null;
        } catch (err) {
            if (disposed) return;
            // Keep showing the last forecast through a transient failure.
            if (!weather) message = text.unavailable;
        } finally {
            if (!disposed) {
                render();
                api.ready?.();
                timer = setTimeout(load, weather ? REFRESH_MS : RETRY_MS);
            }
        }
    }

    render();
    load();

    return () => {
        disposed = true;
        clearTimeout(timer);
    };
}
