<script setup lang="ts">
const route = useRoute()
const { user, initialize, signOut } = useAuth()
const demoMode = useDemoMode()

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
      <nav class="site-nav" aria-label="Main navigation">
        <span v-if="demoMode" class="demo-pill">Local demo</span>
        <NuxtLink :class="{ active: route.path === '/' }" to="/">Projects</NuxtLink>
        <NuxtLink v-if="user" to="/projects/new">New project</NuxtLink>
        <NuxtLink v-if="user && demoMode" to="/account">{{ user.user_metadata?.display_name || 'Account' }}</NuxtLink>
        <button v-if="user" class="button button--ghost button--small" type="button" @click="signOut">
          Sign out
        </button>
        <NuxtLink v-else class="button button--small" to="/login">Sign in</NuxtLink>
      </nav>
      </ClientOnly>
    </div>
  </header>
</template>
