# Overlay widgets

A widget is a small JavaScript program that draws live content (a clock, a calendar, a forecast) inside a box on top of a slide. This repository holds the widget format, its API documentation, a few complete widgets and a minimal host you can run in a plain browser page.

- [Quick start](#quick-start)
- [How it fits together](#how-it-fits-together)
- [Package layout](#package-layout)
- [manifest.json](#manifestjson) — [fields](#fields), [parameters](#parameters), [settings](#settings), [endpoints](#endpoints-getting-outside-data)
- [widget.js](#widgetjs) — [`mount`](#mountel-options), [`api`](#the-api-object), [errors](#fetch-errors)
- [Rules for widget code](#rules-for-widget-code)
- [Running widgets in your own page](#running-widgets-in-your-own-page)
- [Examples](#examples)

## Quick start

A widget is a folder with three files:

```
hello/
  manifest.json
  widget.js
  icon.png
```

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "entry": "widget.js",
  "icon": "icon.png",
  "parameters": {
    "name": { "type": "string", "label": "Who to greet", "default": "world" }
  }
}
```

```js
export function mount(el, { width, height, params, api }) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', width / 2);
    text.setAttribute('y', height / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', height / 3);
    text.setAttribute('fill', 'white');
    text.textContent = `Hello, ${params.name}!`;   // textContent, never innerHTML

    svg.appendChild(text);
    el.appendChild(svg);

    return () => {};   // cleanup: stop anything you started
}
```

[hello/](hello/) is a fuller version of this, and [examples/](examples/) shows how to run it in a page.

## How it fits together

There are three parties:

| Party | Does |
|---|---|
| **Widget author** (you) | Writes `manifest.json` and `widget.js`. Declares which parameters the widget takes and which outside data it needs. |
| **Host** | The program that shows the widget. It validates parameter values, creates and scales the box, imports your module and calls `mount`. It also answers `api.fetch` calls by making the requests your manifest declares. |
| **Slide editor** (the end user) | Chooses a widget, sizes and positions it, and fills in its parameters. They never write or upload code. |

The widget code is deliberately small and does only three things: read `params`, call `api`, and draw into `el`. Everything else (validation, network access, caching, positioning) belongs to the host. That separation is what lets a widget run unchanged on a web page, on a kiosk that is offline, or inside a sandbox.

## Package layout

```
my-widget/
  manifest.json   required
  widget.js       the ES module named by "entry"
  icon.png        required: shown in editors and in static thumbnails (.png, .webp or .jpg)
  preview.png     optional: used in static thumbnails and exports instead of the icon
  …               other .js/.css/.json/images/fonts the module imports
```

- Keep every file the widget needs inside the package, and import them with relative paths. Do not load scripts, fonts or images from a CDN. Hosts such as offline kiosks can't reach one.
- Hosts commonly distribute a widget as a zip of its folder. A single wrapping folder inside the zip is fine.
- Suggested file types: `.js .mjs .json .css .png .webp .jpg .jpeg .gif .svg .woff .woff2 .txt .md`. A host may reject others.

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

### Fields

| field | required | meaning |
|---|---|---|
| `id` | yes | 1–40 characters: lowercase letters, digits or dashes, starting with a letter or digit. Identifies the widget. A host that receives a package with an `id` it already has treats it as an upgrade. |
| `name` | yes | Display name, up to 80 characters. |
| `version` | yes | `major.minor.patch`, each part 0–99999 (`1.2.3`). An optional suffix such as `-beta.1` is allowed. |
| `description` | no | Up to 1000 characters. |
| `entry` | yes | Path of the ES module, ending in `.js` or `.mjs`. Must be a file in the package. |
| `icon` | yes | Path of a `.png`, `.webp` or `.jpg` in the package. |
| `preview` | no | Path of a `.png`, `.webp` or `.jpg`. Used instead of the icon wherever a host can only show a still image. |
| `defaultSize` | no | `{ "w", "h" }` in pixels, integers. `w` is 10–1920 and `h` is 10–1080. Default `{ "w": 400, "h": 300 }`. The size a new placement starts with. |
| `aspectLocked` | no | `true` asks editors to keep the width:height ratio when resizing. Default `false`. |
| `usesLocation` | no | `true` declares that the widget reads [`api.location`](#apilocation) (the screen's own location). Hosts that export a widget's placement as static data, rather than running it live, use this to know they must supply a location with it. Default `false`. |
| `parameters` | no | Values slide editors fill in. See below. |
| `settings` | no | Values the host's administrator fills in once for everyone, such as an API key. See below. |
| `endpoints` | no | Outside data requests the host may make for the widget. See below. |

The coordinate space is the slide's, 1920 × 1080, so `defaultSize` is in slide pixels. A placement can be any size and position within it.

### Parameters

Parameters are what slide editors fill in. A host builds the form from this list. It validates every value and fills in defaults before your code runs, so widget code only ever receives values that already passed.

`parameters` is an object keyed by parameter name. Names are lowercase and start with a letter: `^[a-z][a-z0-9_]{0,39}$`.

```json
"parameters": {
  "units":  { "type": "enum", "label": "Units", "options": ["fahrenheit", "celsius"], "default": "fahrenheit" },
  "opacity": { "type": "number", "label": "Opacity", "min": 0, "max": 1, "step": 0.05, "default": 0.7 }
}
```

Every parameter has a `type` and may have:

| key | meaning |
|---|---|
| `label` | Text beside the form field, up to 200 characters. |
| `help` | A longer hint, up to 200 characters. |
| `default` | The value used when the editor leaves it empty. Must satisfy the parameter's own rules. |
| `required` | `true` rejects an empty value. |

The types:

| type | value your code gets | extra keys |
|---|---|---|
| `string` | single-line text | `maxLength` (1–5000, default 500). `pattern`: a regular expression the **whole** value must match, written without delimiters or anchors. |
| `text` | multi-line text | `maxLength` (1–5000, default 5000) |
| `url` | an absolute `https://` address, as a string. `webcal://` is accepted and converted. | `allow`: a list of `https://` URL prefixes (no query string) that the address must start with. Without `allow`, any public https address passes. |
| `enum` | one of the `options` (a string or integer) | `options`: required, a non-empty list of strings or integers. A value is matched by its string form. |
| `color` | lowercased `#rgb`, `#rrggbb` or `#rrggbbaa` | |
| `number` | a number (integer or float) | `min`, `max`, `step`. `step` is a hint for editor controls. |
| `boolean` | `true` or `false` | |

When a value is empty (not given, `null` or `""`) and not `required`, your code receives:

- `false` for `boolean`;
- `null` for `number`;
- `""` for every other type.

That happens after `default` has been applied, so a parameter with a default is never empty. Check for emptiness with `if (!params.title)` for text, and `params.size ?? 6` for numbers.

### Settings

Settings are values an administrator enters once, in the host, for every placement of the widget. Their purpose is to keep an API key out of slide data and out of the browser.

```json
"settings": {
  "api_key": { "label": "API key", "help": "From your provider's dashboard", "secret": true }
}
```

Keys follow the same naming rule as parameters. `label` and `help` are shown to the administrator, and `secret: true` asks the host to hide the value once saved. Widget code never sees settings: they can only be used inside an endpoint URL with `{secret:name}`.

### Endpoints: getting outside data

Browsers usually can't fetch other sites directly (CORS), and a widget must not be able to turn the host into an open proxy. So a widget declares the requests it needs in `endpoints`, the **host** makes them, and the widget asks for the result by name with `api.fetch(name)`.

An endpoint is keyed by name (same rule as parameters) and has:

| key | meaning |
|---|---|
| `url` | Required. A template, either [a whole-URL](#whole-url-endpoints) or [a fixed-host](#fixed-host-endpoints) one. |
| `expect` | Required. `ical`, `json` or `text`. What the response must be, and what your code receives. |
| `ttl` | Optional. How long the host may cache a response, in seconds (0–86400). Hosts may enforce a minimum. |
| `days` | Optional, for `ical`: how far ahead to expand recurring events (1–366). |
| `args` | Optional. Declares [runtime args](#runtime-args). |

#### Whole-URL endpoints

```json
"events": { "url": "{ics}", "expect": "ical" }
```

The template is a single `{name}` that refers to a `url` parameter. The host fetches whatever address the editor entered. Give that parameter an `allow` list wherever you can, so an editor can only point at the services you expect.

#### Fixed-host endpoints

```json
"geocode": { "url": "https://geocoding-api.open-meteo.com/v1/search?name={zip}&count=1", "expect": "json", "ttl": 86400 }
```

The host (everything before the first `/`) is written out in the template and can't change. Placeholders may appear only in the path or query:

| placeholder | filled with |
|---|---|
| `{name}` | the value of the parameter `name`. |
| `{secret:name}` | the value of the [setting](#settings) `name`. It is substituted by the host, so it never reaches the browser. |
| `{arg:name}` | a [runtime arg](#runtime-args) your code passes to `api.fetch`. |

Every substituted value is percent-encoded, so a value can't add path segments, extra query parameters or change the host.

#### Runtime args

Some values aren't known when the slide is saved. For example, the weather widget geocodes a ZIP code, then asks for a forecast at the coordinates it found. Declare such a value as an arg on the endpoint, then pass it from code:

```json
"forecast": {
  "url": "https://api.open-meteo.com/v1/forecast?latitude={arg:lat}&longitude={arg:lon}",
  "expect": "json",
  "ttl": 1800,
  "args": {
    "lat": { "type": "number", "min": -90, "max": 90 },
    "lon": { "type": "number", "min": -180, "max": 180 }
  }
}
```

```js
const { data } = await api.fetch('forecast', { lat: 34.07, lon: -118.4 });
```

- An arg may be `number`, `enum`, `boolean` or `string`, with the same extra keys as a parameter of that type. A `string` arg **must** have a `pattern`. `url` and free-text args don't exist.
- Args are allowed only in fixed-host templates.
- A missing or invalid arg is rejected with `invalid_args`, unless the arg declares a `default`.
- A host caches each distinct set of args separately. Round values where you can, as the weather widget does with two decimal places, so nearby screens share one cached response.

#### What `expect` returns

`api.fetch` resolves to `{ data, fetched_at, stale }`. What `data` holds depends on `expect`:

- **`json`**: the response must be valid JSON. `data` is the parsed value.
- **`text`**: `data` is the response body as a string.
- **`ical`**: the response must be an iCalendar feed, which the host parses for you. `data` is:

  ```ts
  {
    name: string,               // the calendar's name, "" if it has none
    timezone: string,           // "" if the feed has none
    events: Array<{
      uid: string,
      title: string,
      location: string,
      description: string,
      start: string,            // see below
      end: string,
      all_day: boolean
    }>
  }
  ```

  Recurring events are expanded into individual events within `days` of now (default 60). For an all-day event, `start` and `end` are `YYYY-MM-DD` dates and `end` is **exclusive** (a one-day event on the 5th has `end` on the 6th). For a timed event they are ISO-8601 instants (`2026-10-05T19:00:00Z`).

## widget.js

The `entry` file is an ES module that exports a function named `mount`.

### mount(el, options)

```js
export function mount(el, { width, height, params, api }) {
    // draw into el
    return cleanup;
}
```

| argument | meaning |
|---|---|
| `el` | An empty `HTMLElement`, already positioned on the slide, sized `width × height` and scaled to fit. Append your content to it. You may use `el.style`, but don't touch its position or size, and don't reach outside it. |
| `width`, `height` | The size of your drawing space in pixels. This is the size of the placement, not the size on screen: the host scales `el`, so you always draw in `width × height` units. Usually draw one `<svg viewBox="0 0 width height" width="100%" height="100%">`. |
| `params` | The validated parameter values, with defaults filled in. A frozen object with one key for each declared parameter. |
| `api` | Everything else the host provides. See below. |

`mount` may be `async`; the host waits for it.

**Return a cleanup function.** The host calls it when the widget is removed: when the slide advances, a lightbox closes, a preview changes, or the page is torn down. Stop every timer, interval, listener and pending request there. Slideshows run all day, so a leaked timer per slide adds up. Returning nothing is allowed if you started nothing. A returned object with a `destroy()` method is also accepted. The host empties `el` after cleanup, so you needn't remove your own nodes.

Parameter or size changes never reach a running widget. The host unmounts it (running the cleanup) and mounts a fresh one, so you never need an "update" path.

If `mount` throws or rejects, the host logs a warning and shows nothing. A widget should catch its own errors and draw a friendly message instead.

### The api object

`api` is frozen. All of it is optional to use.

#### `api.fetch(endpointName, args?)`

```js
const { data, fetched_at, stale } = await api.fetch('events');
const { data } = await api.fetch('forecast', { lat: 34.07, lon: -118.4 });
```

Asks the host for the data of an endpoint you declared in the manifest. `args` is an object of [runtime args](#runtime-args).

Resolves to:

| key | meaning |
|---|---|
| `data` | The response, shaped by the endpoint's [`expect`](#what-expect-returns). |
| `fetched_at` | When the host got this copy from the upstream server, as a Unix timestamp in seconds. |
| `stale` | `true` if the upstream server failed and the host is serving an older copy it kept. |

Responses are cached and shared by the host, so calling again is cheap. Refresh at a sensible interval (the calendar re-fetches every few minutes), not every second.

#### Fetch errors

If a request can't be answered, `api.fetch` rejects with an `Error` that has a `.reason` string (and sometimes `.status`). Reasons you can expect from a host:

| reason | meaning |
|---|---|
| `unknown_endpoint` | There is no endpoint with that name in the manifest. |
| `not_configured` | A needed value is empty: a `url` parameter that is blank, or a `{secret:…}` setting the administrator hasn't filled in. |
| `invalid_args` | A runtime arg is missing, has the wrong type or is out of range. |
| `blocked_url` | The address isn't allowed (not https, not on the `allow` list, or not public). |
| `rate_limited`, `upstream_busy` | The host is limiting requests. Try again later. |
| `invalid_response` | The upstream answered, but not with what `expect` requires. |
| `upstream_status` | The upstream server returned an error status. |
| `upstream_unreachable`, `dns_failed`, `too_large`, `too_many_redirects`, `blocked_redirect`, `blocked_address` | The upstream request failed or was refused by the host's safety checks. |

Hosts may use further reasons, so treat the list as open. A good widget:

1. never shows the reason to viewers: draw a short friendly message;
2. keeps showing the last data it already has through a transient failure;
3. retries after a delay (the weather widget tries again sooner after a failure than after a success).

#### `api.storage`

```js
const visits = (api.storage.get('visits') ?? 0) + 1;
api.storage.set('visits', visits);
api.storage.remove('visits');
```

| method | |
|---|---|
| `get(key)` | Returns the stored JSON value, or `null` if there is none or storage is unavailable. |
| `set(key, value)` | Stores any JSON-serializable value. Failures (quota, private browsing) are silently ignored. |
| `remove(key)` | Deletes the value. |

Synchronous, backed by the browser's `localStorage`, and kept separate for each placement of each widget. It lives only in that browser and may disappear, so use it for conveniences (a counter, a remembered position), never for anything that matters.

#### `api.location`

```js
if (api.location) {
    const { name, latitude, longitude, source } = api.location;
}
```

Where the screen is, or `null` when the host doesn't know. A frozen object:

| key | |
|---|---|
| `name` | A display name such as `"Wilmington, NC"`. |
| `latitude`, `longitude` | Decimal degrees. |
| `source` | Where the host got it from. The values are defined by the host (this project uses `'entity'` for the screen's own church, and `'default'` for a site-wide fallback). |

Use it so one slide can show local information on every screen: the weather widget does this when its ZIP code is blank, passing the coordinates to an endpoint as runtime args. If it's `null` on a live screen, consider drawing nothing rather than an error message.

#### `api.locale`

A string, the viewer's interface language (`'en'`, `'es'`, `'en-US'`). Use it for `Intl.DateTimeFormat` and `Intl.NumberFormat`, and to pick between translations you ship in the widget. Don't assume the value is a bare two-letter code: compare with `api.locale.startsWith('es')`.

#### `api.mode`

- `'live'`: a real screen. Show data, run timers.
- `'editor'`: a live preview inside a slide editor. Use it to show hints that only help the person placing the widget, for example the weather widget explains in the editor what a blank ZIP code will do. The host's `api.fetch` may behave differently in the editor, but results have the same shape.

### Other things a host does for you

- Widgets are drawn above the other layers of the slide.
- Where a host can only show a still image (thumbnails, slide-deck exports), it shows your `preview` image, or `icon` if there is none, scaled into the widget's box. Make `preview.png` look like the widget at its `defaultSize`.
- `el` clips its contents (`overflow: hidden`), and the placement may be partly transparent.
- A host may run your module again on each page load, so keep top-level code free of side effects. Do all the work in `mount`.

## Rules for widget code

A widget runs in the page of every viewer. Whoever installs it is vouching for it.

- **Treat `params` and fetched data as untrusted text.** They come from slide editors and outside servers. Use `textContent`, `setAttribute` and `createElementNS`. Never use `innerHTML`, `outerHTML` or `insertAdjacentHTML` with them. Don't build SVG or CSS by concatenating them into a string either.
- **Get outside data only through `api.fetch` and declared endpoints.** Don't call `fetch()`, `XMLHttpRequest` or `WebSocket` to other sites. Don't read cookies, the page outside `el`, or the host application's own APIs.
- **Clean up.** Stop every timer and request in the returned function.
- **Keep CPU use low.** Screens are often small, low-power devices. Prefer timers aligned to the second or minute over `requestAnimationFrame` loops, and re-render only what changed.
- **Draw in `width × height`.** Don't assume the slide's size or the screen's size, and don't read `window.innerWidth`.
- **Be self-contained.** Package everything you need, and don't rely on CDN scripts or web fonts. Use generic font families (`sans-serif`) or ship a `.woff2` in the package.
- **Be kind to translators.** Look at `api.locale`, and put visible text in one place so it's easy to add a language.

## Running widgets in your own page

You can use widgets without any server, in any web page. A host has to do four things:

1. Fetch `manifest.json` and fill in parameter defaults.
2. Create a box of the placement's size (`defaultSize` by default) and scale it to fit with CSS.
3. `import()` the entry module and call `mount(box, { width, height, params, api })`, supplying `api.fetch`, `api.storage`, `api.location`, `api.locale` and `api.mode`.
4. Keep the function `mount` returns and call it when you remove the widget.

```js
import { mountWidget } from './examples/host.js';

const handle = await mountWidget(document.getElementById('here'), './clock', {
    params: { style: 'analog' },
});
// …later
handle.dispose();
```

[examples/host.js](examples/host.js) is a complete, readable implementation in about 100 lines. Two things it leaves to you:

- **Validating parameters.** The reference host rejects anything that doesn't satisfy the manifest (see [Parameters](#parameters)). If values come from untrusted people, do the same before passing them in. If you only use values you wrote, skip it.
- **Endpoints.** Browsers can't call most outside APIs directly, so a server has to make those requests. `host.js` takes a `fetchEndpoint(endpoint, args, params)` function, and [examples/mock-data.js](examples/mock-data.js) shows one answering with made-up data. In production, implement it as a small server that reads the manifest, substitutes placeholders, applies the safety rules below, and returns the shapes in [What `expect` returns](#what-expect-returns).

Serve the files over http(s). Browsers refuse to `import()` modules from `file://`.

### Safety rules for an endpoint server

If you write the server side, the manifest's promises only hold if you enforce them:

- Take the URL from the manifest template. Never from the browser.
- Percent-encode every substituted value, and validate parameters and args against their declarations first.
- Allow only `https` on the default port, and require that every address the host resolves to is public (not loopback, private, link-local or metadata addresses). Re-check after every redirect.
- Cap response size and time, and cap the number of requests per caller.
- Keep `{secret:…}` values on the server.
- Check that the response matches `expect` before returning it.

## Examples

The folders next to this file are complete widgets:

| widget | shows |
|---|---|
| [hello/](hello/) | The smallest useful widget: parameters, `api.storage`, `api.locale`, cleanup. |
| [clock/](clock/) | Parameters of many types, SVG drawing, a timer aligned to the second, cleanup. No outside data. |
| [calendar/](calendar/) | A whole-URL `ical` endpoint with an `allow` list, `api.locale`, an error state. |
| [weather/](weather/) | Fixed-host `json` endpoints, runtime args, `api.location`, `api.mode`, retry timing. |

And [examples/](examples/) shows how to use them in a standalone page:

| file | shows |
|---|---|
| [examples/minimal.html](examples/minimal.html) | The bare contract: import a widget and call `mount`, with no helper library. |
| [examples/index.html](examples/index.html) | A gallery. Mounts several widgets with [host.js](examples/host.js), changes parameters live (unmount, then mount), and simulates an outage. |
| [examples/host.js](examples/host.js) | A minimal, reusable host. |
| [examples/mock-data.js](examples/mock-data.js) | Fake endpoint data in each `expect` shape. |

To run them, serve this folder with any static file server and open `examples/`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/examples/
```
