// Minimal URL.parse polyfill for browsers that lack it (e.g., Safari).
type URLConstructorWithOptionalParse = typeof URL & {
  parse?: (input: string, base?: string | URL | LocationLike) => URL;
};

type LocationLike = { href: string };

const urlConstructor = (globalThis.URL as URLConstructorWithOptionalParse) ?? undefined;

if (urlConstructor && typeof urlConstructor.parse !== "function") {
  urlConstructor.parse = (input: string, base?: string | URL | LocationLike) => {
    let resolvedBase: string | URL | undefined;

    if (typeof base === "string" || base instanceof URL) {
      resolvedBase = base;
    } else if (base && typeof base === "object" && "href" in base) {
      resolvedBase = base.href;
    } else if (typeof globalThis.location !== "undefined") {
      resolvedBase = globalThis.location.href;
    }

    return new urlConstructor(input, resolvedBase);
  };
}
