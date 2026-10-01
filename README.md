# Writing an overlay widget

A widget is a small JavaScript program that draws live content (a clock, a calendar, a forecast) on top of a slide. A site admin installs it. Slide editors then place it on an overlay, set its size and position, and fill in its parameters. They never upload code.

The two folders next to this file, [clock/](clock/) and [calendar/](calendar/), are complete working examples. Install them with:

```bash
php artisan widget:install resources/widgets/clock resources/widgets/calendar
```

You can also zip a widget's folder and upload it at **Admin → Widgets**.

## Package layout

```
my-widget/
  manifest.json   required
  widget.js       the ES module named by "entry"
  icon.png        required: shown in the editor and in thumbnails (.png, .webp or .jpg)
  preview.png     optional: used in thumbnails and exports instead of the icon
  …               other .js/.css/.json/images/fonts the module imports
```

- Only these file types are accepted: `.js .mjs .json .css .png .webp .jpg .jpeg .gif .svg .woff .woff2 .txt .md`.
- A package is limited to 500 files and 20 MB unpacked.
- A single wrapping folder is fine. "Compress this folder" output works as is.

## manifest.json

```json
{
  "id": "calendar",
  "name": "Calendar",
  "version": "1.0.0",
  "description": "Upcoming events from a public calendar feed.",
  "entry": "widget.js",
  "icon": "icon.png",
  "defaultSize": { "w": 800, "h": 600 },
  "aspectLocked": false,
  "parameters": {
    "ics":  { "type": "url", "label": "Feed address", "allow": ["https://calendar.google.com/calendar/ical/"] },
    "mode": { "type": "enum", "options": ["list", "month"], "default": "list" }
  },
  "settings": {
    "api_key": { "label": "API key", "help": "From your provider's dashboard", "secret": true }
  },
  "endpoints": {
    "events": { "url": "{ics}", "expect": "ical", "ttl": 900, "days": 62 }
  }
}
```

- **`id`**: 1–40 characters, lowercase letters, digits or dashes. Installing a package with the same `id` upgrades the installed widget, and every slide using it gets the new version.
- **`version`**: in `1.2.3` form.

### `parameters`

Parameters are what slide editors fill in. The editor builds the form for them automatically. The server validates every value on save, and widget code only ever receives validated values.

| type | value | options |
|---|---|---|
| `string` | single-line text | `maxLength` (default 500), `pattern` (a regex the **whole** value must match) |
| `text` | multi-line text | `maxLength` (default 5000) |
| `url` | an `https://` address (`webcal://` is accepted and converted) | `allow`: a list of URL prefixes. Admins can add more prefixes on the Widgets page. |
| `enum` | one of `options` | `options` (required) |
| `color` | `#rgb`, `#rrggbb` or `#rrggbbaa` | |
| `number` | a number | `min`, `max`, `step` |
| `boolean` | true or false | |

Every parameter can have a `label`, `help`, `default` and `required`.

### `endpoints`: getting outside data

Browsers usually can't fetch other sites directly, because of CORS. The server also must not act as an open proxy. So a widget declares the requests it needs here, and the server makes them:

- **A whole-URL endpoint**, `"url": "{ics}"`, fetches the address in a `url` parameter. Give that parameter an `allow` list wherever you can.
- **A fixed-host endpoint**, such as `"url": "https://api.weather.gov/points/{lat},{lon}"`:
  - The host is fixed when the widget is installed.
  - Parameter values are percent-encoded into the path or query, so they can't change the host.
  - `{secret:api_key}` inserts an admin-entered setting. Secrets are filled in on the server and never reach the browser.
- **`expect`** sets what the response must be and what your widget receives:
  - `ical`: the feed is parsed on the server, and you get `{ name, timezone, events: [{ uid, title, location, description, start, end, all_day }] }`. Recurring events are expanded within `days` (default 60). All-day `start`/`end` values are `YYYY-MM-DD` with an exclusive end. Timed events are ISO-8601 instants.
  - `json`: the response must be valid JSON, and you get the parsed value.
  - `text`: you get a string.
- **`ttl`**: how long a response is cached on the server, in seconds (minimum 60). The cache is shared by every screen showing the widget. If the upstream fails, the last good copy keeps being served for up to 24 hours, marked `stale: true`.

Every fetch is also checked on the server:

- https on the default port only;
- every address the host resolves to must be public;
- each redirect is re-checked, and must match the allowlist or stay on the same host;
- response size and time are capped.

## widget.js

```js
export function mount(el, { width, height, params, api }) {
    // `el` is an empty box, already positioned on the slide and scaled.
    // Draw in a width × height coordinate space; usually one <svg viewBox="0 0 width height">.
    const timer = setInterval(draw, 1000);
    draw();

    return () => clearInterval(timer);   // cleanup, required if you start anything
}
```

- **Cleanup is required.** The host calls the function you return when the slide advances, the lightbox closes or the editor preview changes. Stop every timer, interval and pending request there. Slideshows run all day, so leaked timers add up.
- `params` holds the validated parameter values, with defaults filled in. It is frozen.
- `api` provides:
  - `api.fetch(endpointName)` resolves to `{ data, fetched_at, stale }`. If it fails, it rejects with an error whose `.reason` is one of `not_configured`, `rate_limited`, `invalid_response`, `blocked_url`, `upstream_status` and similar. Show a friendly message, and keep showing the last data you had.
  - `api.storage.get(key)`, `.set(key, value)` and `.remove(key)` store JSON values in localStorage, kept separate for each placement.
  - `api.locale` is the viewer's UI locale (for example `en` or `es`), for `Intl` formatting.
  - `api.mode` is `'live'` on screens and `'editor'` in the overlay editor's live preview.
- Widgets always appear above the overlay's other layers.
- Static thumbnails and PowerPoint exports show your `preview` image, or your `icon`, in the widget's box.
- Slide Announcer devices run widgets too. They keep a local copy of your package, so it keeps working through internet outages. `api.fetch` goes through the device to the server, and the device serves the last good response while offline, with `stale: true`. Don't count on anything outside your package loading on a device, such as CDN scripts or web fonts: list everything you need in the package.

## Rules for widget code

Your code runs in the page of every viewer, with their signed-in session. The admin who installs it is vouching for it.

- **Treat `params` and fetched data as untrusted text.** They come from slide editors and outside servers. Use `textContent`, `setAttribute` and `createElementNS`, never `innerHTML` or `insertAdjacentHTML` with them.
- Get outside data only through `api.fetch` and declared endpoints. Don't call `fetch()` to other sites, and don't read cookies, the page DOM outside your `el`, or app APIs.
- Keep CPU use low. Prefer timers aligned to the second or minute over `requestAnimationFrame` loops, because screens are often small, low-power devices.
