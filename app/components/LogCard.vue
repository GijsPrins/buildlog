<script setup lang="ts">
import type { LogItemUsageDetail, ProjectImage, ProjectLog } from '~/types/domain'
import type { WorkshopSummary } from '~/utils/workshopSocial'

defineProps<{
  log: ProjectLog
  authorName?: string
  phaseName?: string
  images?: Array<ProjectImage & { signedUrl?: string }>
  itemUsages?: LogItemUsageDetail[]
  projectSlug?: string
  social?: WorkshopSummary
}>()
</script>

<template>
  <article class="log-card">
    <header class="log-card__header">
      <div>
        <p class="eyebrow">{{ phaseName || 'Project update' }}</p>
        <h2><NuxtLink v-if="projectSlug" :to="`/projects/${projectSlug}/logs/${log.slug}`">{{ log.title }}</NuxtLink><template v-else>{{ log.title }}</template></h2>
      </div>
      <div class="log-card__meta">
        <time :datetime="log.work_date">{{ formatProjectDate(log.work_date) }}</time>
        <span>{{ formatDuration(log.duration_minutes) }}</span>
        <span>Recorded by {{ authorName || (log.created_by_user_id ? 'Workshop member' : 'Former member') }}</span>
      </div>
    </header>

    <p v-if="log.summary" class="log-card__summary">{{ log.summary }}</p>
    <p v-if="log.content" class="log-card__content">{{ log.content }}</p>

    <div v-if="images?.length" class="photo-grid">
      <figure v-for="image in images" :key="image.id" class="photo-frame">
        <img v-if="image.signedUrl" :src="image.signedUrl" :alt="image.caption || log.title">
        <figcaption v-if="image.caption || image.role !== 'gallery'">
          {{ image.caption || image.role }}
        </figcaption>
      </figure>
    </div>

    <div v-if="log.finding_decisions?.length" class="finding-list">
      <div v-for="(entry, index) in log.finding_decisions" :key="index" class="finding-decision">
        <div>
          <span>Finding</span>
          <p>{{ entry.finding }}</p>
        </div>
        <div>
          <span>Decision</span>
          <p>{{ entry.decision }}</p>
        </div>
      </div>
    </div>

    <WorkshopSocial v-if="projectSlug" :project-id="log.project_id" :log-id="log.id" compact :summary="social" :discussion-to="`/projects/${projectSlug}/logs/${log.slug}#workshop-notes`" />
    <footer v-if="itemUsages?.length || projectSlug" class="log-card__footer">
      <div v-if="itemUsages?.length" class="log-card__parts"><span>Issued from stores</span><strong v-for="usage in itemUsages" :key="usage.id">{{ usage.projectItem.item.name }}<small v-if="usage.usage_amount"> × {{ usage.usage_amount }}</small></strong></div>
      <NuxtLink v-if="projectSlug" :to="`/projects/${projectSlug}/logs/${log.slug}`">Open work order →</NuxtLink>
    </footer>
  </article>
</template>
