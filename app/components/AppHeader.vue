<script setup lang="ts">
const route = useRoute()
const { user, ready, initialize, signOut } = useAuth()
const demoMode = useDemoMode()
const menuOpen = ref(false)

watch(() => route.fullPath, () => { menuOpen.value = false })
onMounted(initialize)
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <NuxtLink class="brand" to="/" aria-label="Buildlog home">
        <span class="brand__mark" aria-hidden="true">B</span>
        <span>
          <strong>Buildlog</strong>
          <small>Make it. Remember it.</small>
        </span>
      </NuxtLink>

      <ClientOnly>
        <button class="site-menu-toggle" type="button" :aria-expanded="menuOpen" aria-controls="site-nav" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Close' : 'Menu' }}</button>
        <!-- Wait for the session so signed-in visitors never see the signed-out links first. -->
        <nav v-if="ready" id="site-nav" class="site-nav" :class="{ 'is-open': menuOpen }" aria-label="Main navigation">
          <span v-if="demoMode" class="demo-pill">Local demo</span>
          <NuxtLink :class="{ active: route.path === '/' }" to="/">Projects</NuxtLink>
          <NuxtLink v-if="user" to="/projects/new">New project</NuxtLink>
          <NuxtLink v-if="user" to="/themes">Themes</NuxtLink>
          <NuxtLink v-if="user" to="/purchases">Purchases</NuxtLink>
          <NuxtLink v-if="user" to="/account" :title="user.user_metadata?.display_name ? `Signed in as ${user.user_metadata.display_name}` : undefined">Account</NuxtLink>
          <button v-if="user" class="button button--ghost button--small" type="button" @click="signOut">
            Sign out
          </button>
          <NuxtLink v-else class="button button--small" to="/login">Sign in</NuxtLink>
        </nav>
      </ClientOnly>
    </div>
  </header>
</template>
