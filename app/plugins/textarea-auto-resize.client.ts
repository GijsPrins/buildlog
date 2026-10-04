import type { ObjectDirective } from 'vue'

function resize(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
}

const observers = new WeakMap<HTMLTextAreaElement, ResizeObserver>()
const directive: ObjectDirective<HTMLTextAreaElement> = {
  mounted(element) {
    element.style.overflowY = 'hidden'
    element.addEventListener('input', () => resize(element))
    let width = 0
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next !== width) { width = next; resize(element) }
    })
    observer.observe(element); observers.set(element, observer)
    resize(element)
    document.fonts.ready.then(() => { if (element.isConnected) resize(element) })
  },
  updated: resize,
  unmounted(element) { observers.get(element)?.disconnect(); observers.delete(element) }
}

export default defineNuxtPlugin(app => { app.vueApp.directive('auto-resize', directive) })
