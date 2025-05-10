# SDLE

SDLE = Service Delivery Locator Engine

Query the Aggregator server and find the service body that seems to cover a geopolitical location.

To test locally, you can do the following (this requires you to have ngrok and python installed):

```shell
> npm run dev -- --open
```

in separate shell

```shell
> ngrok http 5173
```

**You must use ngrok to test the KML layering feature because Google Maps needs to be able to pull the data from a public server.**

Bootstrapped using [SvelteKit](https://kit.svelte.dev/). Powered by [Svelte](https://svelte.dev/) and [Vite](https://vitejs.dev/)

## Developing

Once you've installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Deploying

New deploys are done with every push to the main branch.
