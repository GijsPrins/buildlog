<script setup lang="ts">
import type { LogItemUsageDetail, ProjectImage, ProjectLog } from '~/types/domain'
import type { WorkshopSummary } from '~/utils/workshopSocial'

const props = defineProps<{
  log: ProjectLog
  authorName?: string
  phaseName?: string
  images?: Array<ProjectImage & { signedUrl?: string }>
  itemUsages?: LogItemUsageDetail[]
  projectSlug?: string
  social?: WorkshopSummary
}>()
const viewable = computed(() => (props.images ?? []).filter(image => image.signedUrl))
const cover = computed(() => viewable.value[0])
const morePhotos = computed(() => Math.max(0, viewable.value.length - 1))
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

    <!-- The card is a preview; full notes, findings and every photo live on the session page. -->
    <p v-if="log.summary" class="log-card__summary">{{ log.summary }}</p>
    <p v-else-if="log.content" class="log-card__content">{{ log.content }}</p>

    <figure v-if="cover" class="photo-frame log-card__cover">
      <img :src="cover.signedUrl" :alt="cover.caption || log.title">
      <figcaption v-if="cover.caption || cover.role !== 'gallery'" :class="{ 'is-role': !cover.caption }">{{ cover.caption || cover.role }}</figcaption>
      <span v-if="morePhotos" class="log-card__more">+{{ morePhotos }} {{ morePhotos === 1 ? 'photo' : 'photos' }}</span>
    </figure>

    <p v-if="log.finding_decisions?.length" class="log-card__findings">
      {{ log.finding_decisions.length }} {{ log.finding_decisions.length === 1 ? 'finding & decision' : 'findings & decisions' }}
    </p>

    <WorkshopSocial v-if="projectSlug" :project-id="log.project_id" :log-id="log.id" compact :summary="social" :discussion-to="`/projects/${projectSlug}/logs/${log.slug}#workshop-notes`" />
    <footer v-if="itemUsages?.length || projectSlug" class="log-card__footer">
      <div v-if="itemUsages?.length" class="log-card__parts"><span>Issued from stores</span><strong v-for="usage in itemUsages" :key="usage.id">{{ usage.projectItem.item.name }}<small v-if="usage.usage_amount"> × {{ usage.usage_amount }}</small></strong></div>
      <NuxtLink v-if="projectSlug" :to="`/projects/${projectSlug}/logs/${log.slug}`">Open session →</NuxtLink>
    </footer>
  </article>
</template>
