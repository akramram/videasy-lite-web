/// <reference types="astro/client" />

// Type the `locals.runtime` object injected by @astrojs/node (SSR request
// context). Only what the app reads is declared; see
// node_modules/@astrojs/node/dist (standalone server wires this per request).
declare namespace App {
  interface Locals {
    runtime?: {
      signal?: AbortSignal;
    };
  }
}
