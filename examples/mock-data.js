// Stand-in for the server side of `endpoints`. A real host fetches the
// manifest's endpoint URLs; here we answer with made-up data shaped exactly
// like the real responses (see "expect" in the README).

import { WidgetDataError } from './host.js';

const day = n => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
};
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (n, hour, minute = 0) => {
    const d = day(n);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
};

// expect: "ical" → { name, timezone, events: [...] }
const calendar = {
    name: 'Church Calendar',
    timezone: 'America/New_York',
    events: [
        { uid: '1', title: 'Prayer meeting', location: 'Fellowship hall', description: '', start: at(1, 19), end: at(1, 20), all_day: false },
        { uid: '2', title: 'Community potluck', location: '', description: '', start: at(3, 12, 30), end: at(3, 14), all_day: false },
        // All-day events use plain dates, and `end` is exclusive.
        { uid: '3', title: 'Youth retreat', location: 'Camp Mohaven', description: '', start: ymd(day(5)), end: ymd(day(8)), all_day: true },
        { uid: '4', title: 'Board meeting', location: '', description: '', start: at(9, 18, 30), end: at(9, 20), all_day: false },
    ],
};

// expect: "json" → whatever the upstream API returned (here, Open-Meteo's shapes)
const geocode = { results: [{ name: 'Wilmington', latitude: 34.23, longitude: -77.94, admin1: 'North Carolina' }] };

function forecast() {
    const days = [...Array(7).keys()];
    return {
        current: {
            temperature_2m: 71, apparent_temperature: 73, relative_humidity_2m: 64,
            weather_code: 2, is_day: 1, wind_speed_10m: 14,
        },
        daily: {
            time: days.map(n => ymd(day(n))),
            weather_code: [2, 3, 61, 80, 1, 0, 2],
            temperature_2m_max: [75, 72, 68, 70, 77, 80, 79],
            temperature_2m_min: [58, 57, 55, 56, 59, 62, 61],
            precipitation_probability_max: [10, 25, 80, 60, 5, 0, 10],
        },
    };
}

/** Pass as the host's `fetchEndpoint` option. Set `fail` to see the widgets' error states. */
export function mockEndpoints({ fail = false, delayMs = 300 } = {}) {
    return async (endpoint, args) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        if (fail) throw new WidgetDataError('upstream_status');
        switch (endpoint) {
            case 'events': return calendar;
            case 'geocode': return geocode;
            case 'forecast':
                // The real server rejects bad runtime args with `invalid_args`.
                if (typeof args.lat !== 'number' || typeof args.lon !== 'number') throw new WidgetDataError('invalid_args');
                return forecast();
            default: throw new WidgetDataError('unknown_endpoint');
        }
    };
}
