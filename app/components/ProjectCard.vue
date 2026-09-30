<script setup lang="ts">
import type { ProjectSummary } from '~/types/domain'

defineProps<{
  project: ProjectSummary
}>()
</script>

<template>
  <NuxtLink
    class="project-card"
    :class="`theme--${project.theme_config.preset}`"
    :style="{
      '--project-accent': project.theme_config.colors.primary,
      '--project-card-surface': project.theme_config.colors.surface,
      '--project-card-ink': project.theme_config.colors.text,
      '--project-card-border': project.theme_config.colors.border
    }"
    :to="`/projects/${project.slug}`"
  >
    <div class="project-card__visual">
      <img v-if="project.heroImageUrl" :src="project.heroImageUrl" :alt="project.name">
      <span v-else class="project-card__initial">{{ project.name.slice(0, 1) }}</span>
      <span class="visibility-pill">{{ project.is_public ? 'Public' : 'Private' }}</span>
    </div>
    <div class="project-card__body">
      <p class="eyebrow">{{ project.currentPhase || 'Ready to begin' }}</p>
      <h2>{{ project.name }}</h2>
      <p>{{ project.subtitle || project.description || 'A build worth documenting.' }}</p>
      <dl class="project-card__stats">
        <div>
          <dt>Logs</dt>
          <dd>{{ project.logCount ?? 0 }}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{{ formatDuration(project.totalMinutes) }}</dd>
        </div>
      </dl>
    </div>
  </NuxtLink>
</template>
