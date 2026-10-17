// Remotion's bundler emits font files as assets and imports their URL.
declare module "*.woff2" {
  const url: string;
  export default url;
}
