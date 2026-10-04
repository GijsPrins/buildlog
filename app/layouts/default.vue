<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <AppHeader />
    <main id="main-content" class="page-shell" tabindex="-1">
      <slot />
    </main>
    <footer class="site-footer">
      <p>Buildlog · Built for the workshop, not the spreadsheet.</p>
    </footer>
  </div>
</template>
