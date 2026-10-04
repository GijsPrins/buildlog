// Server renders only need the directive to resolve; sizing happens in the client plugin.
export default defineNuxtPlugin(app => { app.vueApp.directive('auto-resize', { getSSRProps: () => ({}) }) })
