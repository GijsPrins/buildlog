<script setup lang="ts">
const demo = useDemoStore()

function resetDemo() {
  demo.reset()
  reloadNuxtApp({ force: true })
}
</script>

<template>
  <section class="notice" role="status">
    <div class="notice__icon" aria-hidden="true">✓</div>
    <div>
      <strong>Local demo mode is active</strong>
      <p>
        Explore the example build or create your own. Changes stay in this browser;
        no account or Supabase project is needed yet.
      </p>
      <button class="notice__reset" type="button" @click="resetDemo">Reset example data</button>
    </div>
  </section>
</template>
