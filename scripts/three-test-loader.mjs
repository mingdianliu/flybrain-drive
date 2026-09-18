// Resolve the browser import map for headless asset regression tests.
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three')
    return {
      url: new URL('../dist/vendor/three.module.min.js', import.meta.url).href,
      shortCircuit: true,
    };
  return nextResolve(specifier, context);
}
