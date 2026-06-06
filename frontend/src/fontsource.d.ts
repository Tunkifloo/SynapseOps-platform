// Los paquetes @fontsource exportan CSS (side-effect import) sin tipos.
// Declaración ambiental para permitir `import '@fontsource-variable/...'`
// desde main.tsx y que Vite empaquete los .woff2 localmente (RN-008).
declare module '@fontsource-variable/*'
