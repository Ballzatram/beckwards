# Beckwards

The static site at [beckwards.com](https://beckwards.com): music, the claw machine,
and interactive notes. HTML, CSS, and browser JavaScript; no production build or
application server is required.

## Develop

Use Node.js 22+ and Python 3:

```sh
npm ci
npm run serve
```

Open `http://127.0.0.1:8765`. Use the HTTP server so ES modules and asset requests
work correctly.

Edit `index.html` for the homepage and root pages such as `contact.html` for the
other routes. Then run:

```sh
npm run sync:pages
```

This updates `home.html` and the corresponding directory pages, adding the root
asset base needed by clean URLs. The standalone `findmyrobot/index.html` is edited
directly. Do not hand-edit generated page copies.

## Verify

```sh
npx playwright install --with-deps chromium webkit
npm run test:static
npm test
```

Checks cover asset paths, script syntax, route consistency, desktop and phone
layouts, coin dragging, secret codes, clipboard success/failure, note submission,
loading failures, keyboard navigation, background pauses, and arcade rewards.
Browser tests intercept external requests: they never send real notes or analytics.
FormSubmit responses are simulated; actual email delivery requires the configured
FormSubmit account to be working.

GitHub Actions runs these checks on pull requests and before deploying `master`
to GitHub Pages. A failed check blocks that workflow's deployment.
