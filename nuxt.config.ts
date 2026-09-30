// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  ssr: process.env.NUXT_STATIC_SITE !== 'true',
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabasePublishableKey: ''
    }
  },
  app: {
    head: {
      title: 'Buildlog',
      meta: [
        {
          name: 'description',
          content: 'Document the work, decisions and story behind a physical build.'
        },
        { name: 'theme-color', content: '#123f36' }
      ]
    }
  },
  typescript: {
    strict: true,
    typeCheck: true
  }
})
