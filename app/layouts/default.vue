<template>
  <div class="app-shell">
    <AppHeader />
    <main class="page-shell">
      <slot />
    </main>
    <footer class="site-footer">
      <p>Buildlog · Built for the workshop, not the spreadsheet.</p>
    </footer>
  </div>
</template>
