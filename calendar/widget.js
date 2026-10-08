// Calendar widget for AnnouncementSlides overlays.
//
// The server fetches and parses the ICS feed (api.fetch('events') returns
// { data: { name, timezone, events: [{ title, location, start, end,
// all_day }] } }); this file only lays the events out. All text goes in
// through textContent — event titles come from an outside calendar.

const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRESH_MS = 15 * 60 * 1000;
const REDRAW_MS = 5 * 60 * 1000;

function node(name, attrs = {}, parent = null, text = null) {
    const el = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    if (text !== null) el.textContent = text;
    parent?.appendChild(el);
    return el;
}

// Shortens text to roughly fit `maxWidth` at `size` (average glyph width).
function fit(text, size, maxWidth) {
    const max = Math.max(1, Math.floor(maxWidth / (size * 0.54)));
    return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;
}

// All-day events arrive as YYYY-MM-DD dates (local, end exclusive); timed
// events as ISO instants.
function parseStart(event) {
    if (event.all_day) {
        const [y, m, d] = event.start.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(event.start);
}
function parseEnd(event) {
    if (event.all_day) {
        const [y, m, d] = event.end.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(event.end);
}
// Last calendar day an event touches (all-day ends are exclusive, and a timed
// event ending exactly at midnight doesn't reach into that day).
function lastDay(event) {
    return new Date(parseEnd(event).getTime() - 1);
}
const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Tell the host we paint after a slow fetch: it calls api.ready() below
// instead of treating us as ready when mount returns.
export const manualReady = true;

// Keep in step with "sizing" in manifest.json.
const SIZING = {
    list: { aspect: { min: 0.75, max: 2.2 }, minWidth: 0.2 },
    month: { aspect: { min: 1.1, max: 1.8 }, minWidth: 0.3 },
    today: { aspect: { min: 0.75, max: 1.8 }, minWidth: 0.25 },
};

export function mount(el, { width: areaW, height: areaH, params, api }) {
    // Outside our allowed shapes, draw in the largest allowed box, centered
    // in the area we were given; if that is too narrow, just say so.
    const rule = SIZING[params.mode] ?? SIZING.list;
    const width = Math.min(areaW, areaH * rule.aspect.max);
    const height = Math.min(areaH, width / rule.aspect.min);
    if (width < rule.minWidth * 1920) {
        el.style.overflow = 'visible';
        const warn = node('svg', { viewBox: `0 0 ${areaW} ${areaH}`, width: '100%', height: '100%', style: 'overflow: visible' }, el);
        node('text', {
            x: areaW / 2, y: areaH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': 28, fill: '#ef4444',
        }, warn, 'SIZE TOO SMALL');
        api.ready?.();
        return () => {};
    }

    const outer = node('svg', { viewBox: `0 0 ${areaW} ${areaH}`, width: '100%', height: '100%' }, el);
    const svg = node('svg', {
        x: (areaW - width) / 2, y: (areaH - height) / 2, width, height, viewBox: `0 0 ${width} ${height}`,
    }, outer);
    const color = params.color || '#ffffff';
    const accent = params.accent || '#fbbf24';
    const pad = Math.min(width, height) * 0.05;
    let payload = null;
    let message = null;
    let disposed = false;

    function render() {
        svg.replaceChildren();
        const opacity = Number(params.background_opacity ?? 0.75);
        if (opacity > 0) {
            node('rect', { width, height, rx: Math.min(width, height) * 0.04, fill: params.background || '#0f172a', 'fill-opacity': opacity }, svg);
        }

        const titleSize = Math.min(height * 0.09, width * 0.06);
        const title = params.title || payload?.name || '';
        if (title) {
            node('text', {
                x: pad, y: pad + titleSize * 0.85, 'font-family': 'sans-serif', 'font-weight': 'bold',
                'font-size': titleSize, fill: accent,
            }, svg, fit(title, titleSize, width - pad * 2));
        }
        const top = title ? pad + titleSize * 1.5 : pad;

        if (message) {
            const size = Math.min(height * 0.06, width * 0.045);
            node('text', {
                x: width / 2, y: (top + height) / 2, 'text-anchor': 'middle', 'font-family': 'sans-serif',
                'font-size': size, fill: color, opacity: 0.8,
            }, svg, message);
            return;
        }
        if (!payload) return;

        if (params.mode === 'month') month(top);
        else if (params.mode === 'today') today(top);
        else list(top);
    }

    function list(top) {
        const now = new Date();
        const events = payload.events.filter(e => parseEnd(e) > now).slice(0, Number(params.max_events) || 6);
        if (!events.length) {
            message = api.locale?.startsWith('es') ? 'No hay eventos próximos' : 'No upcoming events';
            render();
            message = null;
            return;
        }

        const rowH = (height - top - pad) / events.length;
        const size = Math.min(rowH * 0.36, width * 0.045);
        const dateW = size * 7.4;
        const dateFormat = new Intl.DateTimeFormat(api.locale, { weekday: 'short', month: 'short', day: 'numeric' });
        const timeFormat = new Intl.DateTimeFormat(api.locale, { hour: 'numeric', minute: '2-digit' });

        events.forEach((event, i) => {
            const y = top + rowH * i;
            const start = parseStart(event);
            node('text', {
                x: pad, y: y + rowH * 0.42, 'font-family': 'sans-serif', 'font-weight': 'bold',
                'font-size': size, fill: accent,
            }, svg, cap(dateFormat.format(start)));
            const end = lastDay(event);
            if (dayKey(end) !== dayKey(start)) {
                node('text', {
                    x: pad, y: y + rowH * 0.42 + size * 1.15, 'font-family': 'sans-serif', 'font-weight': 'bold',
                    'font-size': size, fill: accent,
                }, svg, `- ${cap(dateFormat.format(end))}`);
            } else if (!event.all_day) {
                node('text', {
                    x: pad, y: y + rowH * 0.42 + size * 1.15, 'font-family': 'sans-serif',
                    'font-size': size * 0.8, fill: color, opacity: 0.75,
                }, svg, timeFormat.format(start));
            }
            node('text', {
                x: pad + dateW, y: y + rowH * 0.42, 'font-family': 'sans-serif', 'font-size': size, fill: color,
            }, svg, fit(event.title || '—', size, width - pad * 2 - dateW));
            if (event.location) {
                node('text', {
                    x: pad + dateW, y: y + rowH * 0.42 + size * 1.15, 'font-family': 'sans-serif',
                    'font-size': size * 0.8, fill: color, opacity: 0.7,
                }, svg, fit(event.location, size * 0.8, width - pad * 2 - dateW));
            }
        });
    }

    // Everything happening today. All-day events (and ones that began
    // before today) are inverted banners at the top, then the timed events
    // in order. The text size is chosen so that however many there are, from
    // none to a screenful, they fill the space without overflowing; past
    // that, the rest becomes "+N more".
    function today(top) {
        const es = api.locale?.startsWith('es');
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        // Date header: beside the heading when there is one, else its own row.
        const headerSize = Math.min(height * 0.06, width * 0.04);
        const hasTitle = top > pad;
        node('text', {
            x: hasTitle ? width - pad : pad, y: hasTitle ? top - headerSize * 0.9 : top + headerSize,
            'text-anchor': hasTitle ? 'end' : 'start', 'font-family': 'sans-serif', 'font-size': headerSize,
            'font-weight': hasTitle ? 'normal' : 'bold', fill: hasTitle ? color : accent, opacity: hasTitle ? 0.8 : 1,
        }, svg, cap(new Intl.DateTimeFormat(api.locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(now)));
        if (!hasTitle) top += headerSize * 1.7;

        const events = payload.events
            .filter(e => parseStart(e) < dayEnd && parseEnd(e) > dayStart)
            .sort((a, b) => parseStart(a) - parseStart(b));
        const banners = events.filter(e => e.all_day || parseStart(e) < dayStart);
        const timed = events.filter(e => !banners.includes(e));
        const area = height - top - pad;

        if (!events.length) {
            const size = Math.min(height * 0.07, width * 0.05);
            node('text', {
                x: width / 2, y: top + area / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
                'font-family': 'sans-serif', 'font-size': size, fill: color, opacity: 0.7,
            }, svg, es ? 'No hay eventos hoy' : 'No events today');
            return;
        }

        // Row heights in units of the text size.
        const BANNER = 1.9;
        const rows = [...banners.map(e => ({ e, banner: true })), ...timed.map(e => ({ e, banner: false }))];
        const maxSize = Math.min(width * 0.05, height * 0.075);
        const minSize = width * 0.028;
        let twoLine = true;
        const units = two => banners.length * BANNER + timed.length * (two ? 2.5 : 1.55);
        let size = Math.min(maxSize, area / units(true));
        if (size < minSize) {
            twoLine = false;
            size = Math.min(maxSize, area / units(false));
        }
        let shown = rows;
        let more = 0;
        if (size < minSize) {
            // Too many for a readable size: show what fits, then a count.
            size = minSize;
            const rowH = r => size * (r.banner ? BANNER : 1.55);
            let used = 0;
            shown = [];
            for (const r of rows) {
                if (used + rowH(r) > area - size * 1.55) break;
                used += rowH(r);
                shown.push(r);
            }
            more = rows.length - shown.length;
        }

        const timeFormat = new Intl.DateTimeFormat(api.locale, { hour: 'numeric', minute: '2-digit' });
        const timeW = size * 0.62 * Math.max(...[10, 22].map(h => timeFormat.format(new Date(2000, 0, 1, h, 30)).length)) + size * 0.8;
        const innerW = width - pad * 2;
        const dark = params.background || '#0f172a';
        let y = top;

        for (const { e, banner } of shown) {
            const ended = !banner && parseEnd(e) <= now;
            if (banner) {
                const h = size * 1.6;
                const until = e.all_day ? '' : ` · ${es ? 'hasta' : 'until'} ${timeFormat.format(parseEnd(e))}`;
                node('rect', { x: pad, y, width: innerW, height: h, rx: h * 0.3, fill: color }, svg);
                node('text', {
                    x: pad + size * 0.6, y: y + h / 2, 'dominant-baseline': 'central', 'font-family': 'sans-serif',
                    'font-weight': 'bold', 'font-size': size, fill: dark,
                }, svg, fit(`${e.title || '—'}${until}`, size, innerW - size * 1.2));
                y += size * BANNER;
                continue;
            }

            const rowH = size * (twoLine ? 2.5 : 1.55);
            const base = y + size * (twoLine ? 1.0 : 1.05);
            const titleX = pad + timeW;
            const g = node('g', { opacity: ended ? 0.45 : 1 }, svg);
            node('text', {
                x: pad, y: base, 'font-family': 'sans-serif', 'font-weight': 'bold', 'font-size': size, fill: accent,
            }, g, timeFormat.format(parseStart(e)));
            if (twoLine) {
                node('text', {
                    x: titleX, y: base, 'font-family': 'sans-serif', 'font-size': size, fill: color,
                }, g, fit(e.title || '—', size, width - pad - titleX));
                node('text', {
                    x: pad, y: base + size * 1.15, 'font-family': 'sans-serif', 'font-size': size * 0.8, fill: color, opacity: 0.7,
                }, g, `– ${timeFormat.format(parseEnd(e))}`);
                if (e.location) {
                    node('text', {
                        x: titleX, y: base + size * 1.15, 'font-family': 'sans-serif', 'font-size': size * 0.8, fill: color, opacity: 0.7,
                    }, g, fit(e.location, size * 0.8, width - pad - titleX));
                }
            } else {
                node('text', {
                    x: titleX, y: base, 'font-family': 'sans-serif', 'font-size': size, fill: color,
                }, g, fit(e.location ? `${e.title || '—'} · ${e.location}` : (e.title || '—'), size, width - pad - titleX));
            }
            y += rowH;
        }

        if (more) {
            node('text', {
                x: pad, y: y + size * 1.05, 'font-family': 'sans-serif', 'font-size': size, fill: accent, opacity: 0.9,
            }, svg, es ? `+${more} más` : `+${more} more`);
        }
    }

    // Spanish (and some other locales) return lowercase day/month names;
    // capitalize each word except connectors like "de".
    function cap(text) {
        return text.replace(/(^|[\s.,])(\p{L})(\p{L}*)/gu, (m, sep, first, rest) =>
            ['de', 'del'].includes(first + rest) && sep !== '' ? m : sep + first.toUpperCase() + rest);
    }

    function month(top) {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const gridStart = new Date(first);
        gridStart.setDate(1 - first.getDay());
        const weeks = Math.ceil((first.getDay() + new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) / 7);

        // Month name: beside the heading when there is one, else its own row.
        const headerSize = Math.min(height * 0.05, width * 0.03);
        const hasTitle = top > pad;
        node('text', {
            x: hasTitle ? width - pad : pad, y: hasTitle ? top - headerSize * 0.9 : top + headerSize,
            'text-anchor': hasTitle ? 'end' : 'start',
            'font-family': 'sans-serif', 'font-size': headerSize, fill: color, opacity: 0.8,
        }, svg, cap(new Intl.DateTimeFormat(api.locale, { month: 'long', year: 'numeric' }).format(now)));
        if (!hasTitle) top += headerSize * 1.6;

        const dowH = headerSize * 1.6;
        const cellW = (width - pad * 2) / 7;
        const cellH = (height - top - pad - dowH) / weeks;
        const dow = new Intl.DateTimeFormat(api.locale, { weekday: 'short' });
        for (let d = 0; d < 7; d++) {
            const sample = new Date(gridStart);
            sample.setDate(gridStart.getDate() + d);
            node('text', {
                x: pad + cellW * d + cellW / 2, y: top + headerSize, 'text-anchor': 'middle',
                'font-family': 'sans-serif', 'font-size': headerSize * 0.9, fill: accent,
            }, svg, cap(dow.format(sample)));
        }

        // Each event appears on every day it spans.
        const byDay = new Map();
        for (const event of payload.events) {
            const start = parseStart(event);
            const end = parseEnd(event);
            const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            do {
                const key = dayKey(cursor);
                if (!byDay.has(key)) byDay.set(key, []);
                byDay.get(key).push(event);
                cursor.setDate(cursor.getDate() + 1);
            } while (cursor < end);
        }

        const daySize = Math.min(cellH * 0.22, cellW * 0.2);
        const eventSize = Math.min(cellH * 0.16, cellW * 0.13);
        const perCell = Math.max(0, Math.floor((cellH - daySize * 1.5) / (eventSize * 1.25)));

        for (let i = 0; i < weeks * 7; i++) {
            const date = new Date(gridStart);
            date.setDate(gridStart.getDate() + i);
            const x = pad + cellW * (i % 7);
            const y = top + dowH + cellH * Math.floor(i / 7);
            const inMonth = date.getMonth() === now.getMonth();
            const today = dayKey(date) === dayKey(now);

            node('rect', {
                x: x + 1, y: y + 1, width: cellW - 2, height: cellH - 2, rx: 4,
                fill: today ? accent : color, 'fill-opacity': today ? 0.25 : 0.06,
            }, svg);
            node('text', {
                x: x + daySize * 0.4, y: y + daySize * 1.1, 'font-family': 'sans-serif', 'font-weight': today ? 'bold' : 'normal',
                'font-size': daySize, fill: color, opacity: inMonth ? 1 : 0.4,
            }, svg, String(date.getDate()));

            const events = byDay.get(dayKey(date)) ?? [];
            events.slice(0, perCell).forEach((event, n) => {
                const more = n === perCell - 1 && events.length > perCell;
                node('text', {
                    x: x + daySize * 0.4, y: y + daySize * 1.5 + eventSize * 1.25 * (n + 1) - eventSize * 0.2,
                    'font-family': 'sans-serif', 'font-size': eventSize, fill: color, opacity: inMonth ? 0.9 : 0.4,
                }, svg, more ? `+${events.length - n}` : fit(event.title || '—', eventSize, cellW - daySize * 0.8));
            });
        }
    }

    async function load() {
        try {
            const result = await api.fetch('events');
            if (disposed) return;
            payload = result.data;
            message = null;
        } catch (err) {
            if (disposed) return;
            // Keep showing the last good data through a transient failure.
            if (!payload) {
                message = err.reason === 'not_configured'
                    ? (api.locale?.startsWith('es') ? 'Agrega la dirección del calendario' : 'Add a calendar feed address')
                    : (api.locale?.startsWith('es') ? 'Calendario no disponible' : 'Calendar unavailable');
            }
        }
        render();
        api.ready?.();
    }

    render();
    load();
    const refresh = setInterval(load, REFRESH_MS);
    // Redraw periodically so past events drop off and "today" moves on.
    const redraw = setInterval(render, REDRAW_MS);

    return () => {
        disposed = true;
        clearInterval(refresh);
        clearInterval(redraw);
    };
}
