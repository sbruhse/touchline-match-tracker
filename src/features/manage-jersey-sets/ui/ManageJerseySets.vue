<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  createJerseyIdentityLabels,
  createJerseySetIdentityLabels,
  useJerseySetStore,
} from '../../../entities/jersey-set'
import type { JerseyDetailsInput } from '../../../entities/jersey-set'
import { createPlayerIdentityLabels, usePlayerStore } from '../../../entities/player'
import JerseyForm from './components/JerseyForm.vue'
import JerseyInventoryList from './components/JerseyInventoryList.vue'
import JerseySetForm from './components/JerseySetForm.vue'
import JerseySetList from './components/JerseySetList.vue'
import type { JerseyDraft, PlayerOwnerChoice, UnresolvedOwnerChoice } from './types'
import { parseJerseyNumberDraft } from '../lib/parseJerseyNumberDraft'

const jerseyStore = useJerseySetStore()
const playerStore = usePlayerStore()

const selectedSetId = ref<string | null>(null)
const setEditorMode = ref<'create' | 'edit' | null>(null)
const editingSetId = ref<string | null>(null)
const setDraft = ref('')
const setFormError = ref<string | null>(null)
const jerseyEditorMode = ref<'create' | 'edit' | null>(null)
const editingJerseyId = ref<string | null>(null)
const jerseyDraft = ref<JerseyDraft | null>(null)
const jerseyFormError = ref<string | null>(null)
const jerseyErrorField = ref<'number' | 'size' | 'owner' | null>(null)
const localError = ref<string | null>(null)
const pendingSetRemovalId = ref<string | null>(null)

const selectedSet = computed(() => jerseyStore.sets.value.find((set) => set.id === selectedSetId.value) ?? null)
const selectedJersey = computed(() => selectedSet.value?.jerseys.find((jersey) => jersey.id === editingJerseyId.value) ?? null)
const isBusy = computed(() => jerseyStore.loading.value || jerseyStore.saving.value)
const hasEditor = computed(() => setEditorMode.value !== null || jerseyEditorMode.value !== null)
const setIdentityLabels = computed(() => createJerseySetIdentityLabels(jerseyStore.sets.value))
const jerseyIdentityLabels = computed(() => createJerseyIdentityLabels(selectedSet.value?.jerseys ?? []))

const playerIdentityLabels = computed(() => createPlayerIdentityLabels(playerStore.players.value))
const ownerChoices = computed<readonly PlayerOwnerChoice[]>(() => playerStore.players.value.map((player) => ({
  id: player.id,
  label: `${playerIdentityLabels.value.get(player.id) ?? player.name}${player.archived ? ' (Archived)' : ''}`,
})))
const ownerLabels = computed<ReadonlyMap<string, string>>(() => {
  const labels = new Map<string, string>(ownerChoices.value.map(({ id, label }) => [id, label]))
  const loadedIds = new Set(ownerChoices.value.map(({ id }) => id))
  const unresolvedIds = new Set(jerseyStore.sets.value.flatMap((set) => set.jerseys
    .map((jersey) => jersey.ownerPlayerId)
    .filter((id): id is string => id !== null && !loadedIds.has(id))))
  const unavailableLabels = createPlayerIdentityLabels([...unresolvedIds].map((id) => ({ id, name: 'Unavailable player' })))
  for (const id of unresolvedIds) {
    const label = unavailableLabels.get(id) ?? 'Unavailable player'
    const compactId = id.replace(/[^a-z0-9]/gi, '') || id
    labels.set(id, label.includes(' · ') ? label : `${label} · ${compactId.slice(0, 4)}`)
  }
  return labels
})
const unresolvedOwner = computed<UnresolvedOwnerChoice | null>(() => {
  const id = jerseyDraft.value?.ownerPlayerId
  if (!id || playerStore.players.value.some((player) => player.id === id)) return null
  return { id, label: ownerLabels.value.get(id) ?? 'Unavailable player' }
})
const ownerDirectoryMessage = computed(() => {
  if (playerStore.ready.value) return null
  if (playerStore.loading.value) return 'Loading player choices…'
  if (playerStore.error.value) return 'Player choices are unavailable. Existing owners are kept; choose Team or retry the player directory.'
  return 'Player choices are not ready. Jerseys can still be saved as team-owned.'
})
const currentPendingRemoval = computed(() =>
  jerseyStore.sets.value.find((set) => set.id === pendingSetRemovalId.value) ?? null,
)

watch(jerseyStore.sets, (sets) => {
  if (selectedSetId.value && sets.some((set) => set.id === selectedSetId.value)) return
  selectedSetId.value = sets[0]?.id ?? null
}, { immediate: true })

watch(setEditorMode, (mode) => {
  if (!mode) return
  const inputId = mode === 'create' ? 'create-jersey-set-name' : `edit-jersey-set-${editingSetId.value}-name`
  void nextTick(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null
    input?.focus({ preventScroll: true })
    input?.setSelectionRange(0, input.value.length)
  })
}, { flush: 'post' })

watch(jerseyEditorMode, (mode) => {
  if (!mode) return
  const inputId = mode === 'create'
    ? `create-jersey-${selectedSetId.value}-number`
    : `edit-jersey-${editingJerseyId.value}-number`
  void nextTick(() => document.getElementById(inputId)?.focus({ preventScroll: true }))
}, { flush: 'post' })

watch(pendingSetRemovalId, (setId) => {
  if (!setId) return
  void nextTick(() => document.getElementById(`confirm-remove-jersey-set-${setId}`)?.focus({ preventScroll: true }))
}, { flush: 'post' })

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save jersey inventory changes.'
}

function clearGlobalError(): void {
  localError.value = null
}

function selectSet(setId: string): void {
  selectedSetId.value = setId
  clearGlobalError()
}

function startCreateSet(): void {
  if (isBusy.value) return
  clearGlobalError()
  setFormError.value = null
  setEditorMode.value = 'create'
  editingSetId.value = null
  setDraft.value = ''
}

function startEditSet(setId: string): void {
  const set = jerseyStore.sets.value.find((item) => item.id === setId)
  if (!set || isBusy.value) return
  clearGlobalError()
  setFormError.value = null
  setEditorMode.value = 'edit'
  editingSetId.value = setId
  setDraft.value = set.name
}

function closeSetEditor(): void {
  const mode = setEditorMode.value
  const setId = editingSetId.value
  setEditorMode.value = null
  editingSetId.value = null
  setDraft.value = ''
  setFormError.value = null
  clearGlobalError()
  void nextTick(() => {
    const targetId = mode === 'edit' && setId ? `rename-jersey-set-${setId}` : 'create-jersey-set-button'
    document.getElementById(targetId)?.focus()
  })
}

async function saveSet(): Promise<void> {
  const name = setDraft.value.trim()
  setFormError.value = null
  clearGlobalError()
  if (!name) {
    setFormError.value = 'A jersey set name is required.'
    return
  }
  try {
    if (setEditorMode.value === 'edit' && editingSetId.value) {
      await jerseyStore.renameSet(editingSetId.value, name)
      const editedId = editingSetId.value
      setEditorMode.value = null
      editingSetId.value = null
      setDraft.value = ''
      await nextTick()
      document.getElementById(`rename-jersey-set-${editedId}`)?.focus()
    } else {
      const currentIds = new Set(jerseyStore.sets.value.map((set) => set.id))
      await jerseyStore.createSet(name)
      const createdSet = jerseyStore.sets.value.find((set) => !currentIds.has(set.id))
      setEditorMode.value = null
      setDraft.value = ''
      setFormError.value = null
      selectedSetId.value = createdSet?.id ?? selectedSetId.value
      await nextTick()
      document.getElementById(`select-jersey-set-${createdSet?.id}`)?.focus()
    }
    clearGlobalError()
  } catch (error) {
    localError.value = messageFor(error)
  }
}

function startCreateJersey(): void {
  if (!selectedSet.value || isBusy.value) return
  clearGlobalError()
  jerseyFormError.value = null
  jerseyErrorField.value = null
  jerseyEditorMode.value = 'create'
  editingJerseyId.value = null
  jerseyDraft.value = { number: '', size: '', ownerPlayerId: '' }
}

function startEditJersey(jerseyId: string): void {
  const jersey = selectedSet.value?.jerseys.find((item) => item.id === jerseyId)
  if (!jersey || isBusy.value) return
  clearGlobalError()
  jerseyFormError.value = null
  jerseyErrorField.value = null
  jerseyEditorMode.value = 'edit'
  editingJerseyId.value = jerseyId
  jerseyDraft.value = {
    number: String(jersey.number),
    size: jersey.size,
    ownerPlayerId: jersey.ownerPlayerId ?? '',
  }
}

async function closeJerseyEditor(saved = false): Promise<void> {
  const mode = jerseyEditorMode.value
  const jerseyId = editingJerseyId.value
  jerseyEditorMode.value = null
  editingJerseyId.value = null
  jerseyDraft.value = null
  jerseyFormError.value = null
  jerseyErrorField.value = null
  if (!saved) clearGlobalError()
  await nextTick()
  const targetId = mode === 'edit' && jerseyId
    ? `edit-jersey-${jerseyId}`
    : `add-jersey-${selectedSetId.value}`
  document.getElementById(targetId)?.focus()
}

function validationError(field: 'number' | 'size' | 'owner', message: string): void {
  jerseyErrorField.value = field
  jerseyFormError.value = message
}

async function saveJersey(): Promise<void> {
  const draft = jerseyDraft.value
  const set = selectedSet.value
  if (!draft || !set) return
  clearGlobalError()
  jerseyErrorField.value = null
  jerseyFormError.value = null

  let number: number
  try {
    number = parseJerseyNumberDraft(draft.number)
  } catch (error) {
    validationError('number', messageFor(error))
    return
  }
  if (!draft.size.trim()) {
    validationError('size', 'An actual jersey size is required.')
    return
  }

  const ownerPlayerId = draft.ownerPlayerId.trim() || null
  const committedJersey = jerseyEditorMode.value === 'edit'
    ? set.jerseys.find((jersey) => jersey.id === editingJerseyId.value)
    : null
  if (ownerPlayerId && ownerPlayerId !== committedJersey?.ownerPlayerId) {
    if (!playerStore.ready.value) {
      validationError('owner', 'Load the player directory before choosing a player owner.')
      return
    }
    if (!playerStore.players.value.some((player) => player.id === ownerPlayerId)) {
      validationError('owner', 'Choose a player from the loaded directory or choose Team.')
      return
    }
  }

  const input: JerseyDetailsInput = { number, size: draft.size.trim(), ownerPlayerId }
  try {
    if (jerseyEditorMode.value === 'edit' && editingJerseyId.value) {
      await jerseyStore.updateJersey(set.id, editingJerseyId.value, input)
    } else {
      await jerseyStore.addJersey(set.id, input)
    }
    await closeJerseyEditor(true)
  } catch (error) {
    localError.value = messageFor(error)
  }
}

async function removeJerseyItem(jerseyId: string): Promise<void> {
  if (!selectedSet.value || isBusy.value) return
  clearGlobalError()
  const wasEditing = editingJerseyId.value === jerseyId
  try {
    await jerseyStore.removeJersey(selectedSet.value.id, jerseyId)
    if (wasEditing) {
      jerseyEditorMode.value = null
      editingJerseyId.value = null
      jerseyDraft.value = null
      jerseyFormError.value = null
      jerseyErrorField.value = null
    }
    await nextTick()
    const nextJersey = selectedSet.value?.jerseys[0]
    const focusTarget = nextJersey ? `edit-jersey-${nextJersey.id}` : `add-jersey-${selectedSetId.value}`
    document.getElementById(focusTarget)?.focus()
  } catch (error) {
    localError.value = messageFor(error)
  }
}

function requestRemoveSet(setId: string): void {
  if (isBusy.value || hasEditor.value) return
  pendingSetRemovalId.value = setId
  clearGlobalError()
}

function cancelRemoveSet(): void {
  const setId = pendingSetRemovalId.value
  pendingSetRemovalId.value = null
  void nextTick(() => document.getElementById(`remove-jersey-set-${setId}`)?.focus())
}

async function confirmRemoveSet(): Promise<void> {
  const setId = pendingSetRemovalId.value
  if (!setId || isBusy.value) return
  clearGlobalError()
  try {
    await jerseyStore.removeSet(setId)
    pendingSetRemovalId.value = null
    const nextSelectedId = jerseyStore.sets.value[0]?.id ?? null
    selectedSetId.value = nextSelectedId
    await nextTick()
    if (nextSelectedId) document.getElementById(`select-jersey-set-${nextSelectedId}`)?.focus()
    else document.getElementById('create-jersey-set-button')?.focus()
  } catch (error) {
    localError.value = messageFor(error)
  }
}

async function retryInventoryLoad(): Promise<void> {
  clearGlobalError()
  try {
    await jerseyStore.load()
  } catch {
    // The store retains its retryable load error for the alert below.
  }
}

async function retryPlayerLoad(): Promise<void> {
  try {
    await playerStore.load()
  } catch {
    // Jersey inventory stays available; only player-owner choices remain unavailable.
  }
}
</script>

<template>
  <section class="jersey-management" aria-labelledby="jersey-management-heading">
    <header class="inventory-heading">
      <div>
        <p class="section-kicker">KIT ROOM</p>
        <h2 id="jersey-management-heading">Jersey sets</h2>
        <p class="inventory-intro">Keep a local record of each set and every jersey in it.</p>
      </div>
      <span class="set-count">{{ jerseyStore.sets.value.length }} {{ jerseyStore.sets.value.length === 1 ? 'SET' : 'SETS' }}</span>
    </header>

    <p v-if="jerseyStore.loading.value || (!jerseyStore.ready.value && !jerseyStore.error.value)" class="inventory-state" role="status" aria-live="polite">
      Loading jersey inventory…
    </p>
    <section v-else-if="!jerseyStore.ready.value" class="inventory-load-error" role="alert">
      <p>Your jersey inventory could not be loaded.</p>
      <p>{{ jerseyStore.error.value }}</p>
      <button class="secondary-button" type="button" @click="retryInventoryLoad">Try again</button>
    </section>
    <template v-else>
      <p v-if="ownerDirectoryMessage" class="owner-directory-note" role="status" aria-live="polite">
        {{ ownerDirectoryMessage }}
        <button v-if="playerStore.error.value" type="button" @click="retryPlayerLoad">Try again</button>
      </p>
      <p v-if="localError" class="inventory-error" role="alert" aria-live="assertive">{{ localError }}</p>
      <p v-else-if="jerseyStore.saving.value" class="inventory-saving" role="status" aria-live="polite">Saving jersey inventory…</p>

      <div class="inventory-columns">
        <aside class="set-panel" aria-labelledby="jersey-set-list-heading">
          <div class="panel-heading">
            <h3 id="jersey-set-list-heading">Sets</h3>
            <button
              id="create-jersey-set-button"
              class="secondary-button"
              type="button"
              :disabled="isBusy || hasEditor || pendingSetRemovalId !== null"
              @click="startCreateSet"
            >Create set</button>
          </div>
          <JerseySetForm
            v-if="setEditorMode"
            :id-prefix="setEditorMode === 'create' ? 'create-jersey-set' : `edit-jersey-set-${editingSetId}`"
            v-model="setDraft"
            :mode="setEditorMode"
            :disabled="isBusy"
            :error="setFormError"
            @submit="saveSet"
            @cancel="closeSetEditor"
          />
          <JerseySetList
            :sets="jerseyStore.sets.value"
            :identity-labels="setIdentityLabels"
            :selected-set-id="selectedSetId"
            :disabled="isBusy || hasEditor || pendingSetRemovalId !== null"
            @select="selectSet"
            @edit="startEditSet"
            @remove="requestRemoveSet"
          />
        </aside>

        <section v-if="selectedSet" class="selected-set-panel" :aria-labelledby="`selected-set-${selectedSet.id}`">
          <header class="selected-set-heading">
            <div>
              <p class="selected-set-label">Current set</p>
              <h3 :id="`selected-set-${selectedSet.id}`">{{ setIdentityLabels.get(selectedSet.id) ?? selectedSet.name }}</h3>
            </div>
            <button
              :id="`add-jersey-${selectedSet.id}`"
              class="primary-button"
              type="button"
              :disabled="isBusy || hasEditor || pendingSetRemovalId !== null"
              @click="startCreateJersey"
            >Add jersey</button>
          </header>
          <p v-if="!playerStore.ready.value && selectedSet.jerseys.some((jersey) => jersey.ownerPlayerId)" class="owner-unavailable-note">
            Player names are unavailable until the directory loads. Existing owner IDs are preserved.
          </p>
          <JerseyForm
            v-if="jerseyEditorMode === 'create' && jerseyDraft"
            :id-prefix="`create-jersey-${selectedSet.id}`"
            v-model="jerseyDraft"
            mode="create"
            :disabled="isBusy"
            :owner-choices="ownerChoices"
            :unresolved-owner="unresolvedOwner"
            :error="jerseyFormError"
            :error-field="jerseyErrorField"
            @submit="saveJersey"
            @cancel="closeJerseyEditor()"
          />
          <JerseyInventoryList
            :jerseys="selectedSet.jerseys"
            :identity-labels="jerseyIdentityLabels"
            :owner-labels="ownerLabels"
            :editing-jersey-id="jerseyEditorMode === 'edit' ? editingJerseyId : null"
            :disabled="isBusy || hasEditor || pendingSetRemovalId !== null"
            @edit="startEditJersey"
            @remove="removeJerseyItem"
          >
            <template #editor>
              <JerseyForm
                v-if="jerseyEditorMode === 'edit' && jerseyDraft && selectedJersey"
                :id-prefix="`edit-jersey-${editingJerseyId}`"
                v-model="jerseyDraft"
                mode="edit"
                :disabled="isBusy"
                :owner-choices="ownerChoices"
                :unresolved-owner="unresolvedOwner"
                :error="jerseyFormError"
                :error-field="jerseyErrorField"
                @submit="saveJersey"
                @cancel="closeJerseyEditor()"
              />
            </template>
          </JerseyInventoryList>
        </section>
        <section v-else class="selected-set-empty" aria-label="No selected jersey set">
          <h3>Start a kit set</h3>
          <p>Create a named set first. It will be ready before any jerseys or players are recorded.</p>
          <button class="primary-button" type="button" :disabled="isBusy || hasEditor" @click="startCreateSet">Create first set</button>
        </section>
      </div>

      <section v-if="currentPendingRemoval" class="set-removal-confirm" role="alertdialog" aria-labelledby="set-removal-heading" aria-describedby="set-removal-description">
        <h3 id="set-removal-heading">Remove {{ setIdentityLabels.get(currentPendingRemoval.id) ?? currentPendingRemoval.name }}?</h3>
        <p id="set-removal-description">
          This removes the set, {{ currentPendingRemoval.jerseys.length }} {{ currentPendingRemoval.jerseys.length === 1 ? 'jersey' : 'jerseys' }}, and
          {{ currentPendingRemoval.preferredNumbers.length }} {{ currentPendingRemoval.preferredNumbers.length === 1 ? 'player preference' : 'player preferences' }} together.
          Other sets and player profiles stay unchanged.
        </p>
        <div class="removal-actions">
          <button :id="`confirm-remove-jersey-set-${currentPendingRemoval.id}`" class="danger-button" type="button" :disabled="isBusy" @click="confirmRemoveSet">
            {{ localError ? 'Try removal again' : 'Remove set and its data' }}
          </button>
          <button class="cancel-button" type="button" :disabled="isBusy" @click="cancelRemoveSet">Keep set</button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.jersey-management { max-width: 64rem; margin: 0 auto; padding: 2.7rem 0 3.5rem; }
.inventory-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.35rem; }
.section-kicker { margin: 0 0 0.55rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; }
.inventory-heading h2 { margin: 0; color: var(--ink); font-family: 'Space Grotesk', sans-serif; font-size: 2rem; letter-spacing: -0.05em; }
.inventory-intro { margin: 0.55rem 0 0; color: #6d786f; font-size: 0.83rem; line-height: 1.55; }
.set-count { padding-bottom: 0.25rem; color: #8b958c; font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.1em; white-space: nowrap; }
.inventory-columns { display: grid; grid-template-columns: minmax(15rem, 0.85fr) minmax(0, 1.5fr); align-items: start; gap: 1rem; }
.set-panel, .selected-set-panel, .selected-set-empty { min-width: 0; display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid #e4e8e1; border-radius: 0.5rem; background: rgb(255 255 255 / 72%); }
.panel-heading, .selected-set-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
.panel-heading h3, .selected-set-heading h3, .selected-set-empty h3 { min-width: 0; margin: 0; color: #35493a; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; overflow-wrap: anywhere; }
.selected-set-label { margin: 0 0 0.25rem; color: #859087; font-size: 0.65rem; }
.primary-button, .secondary-button, .cancel-button, .danger-button { min-height: 2.8rem; padding: 0.35rem 0.8rem; border-radius: 0.35rem; font-size: 0.72rem; font-weight: 600; }
.primary-button { border: 0; background: var(--green); color: #fff; }
.secondary-button { border: 1px solid #dfe5dc; background: #fff; color: #405748; }
.cancel-button { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.danger-button { border: 0; background: #8a3d34; color: #fff; }
.primary-button:focus-visible, .secondary-button:focus-visible, .cancel-button:focus-visible, .danger-button:focus-visible, .owner-directory-note button:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
.primary-button:disabled, .secondary-button:disabled, .cancel-button:disabled, .danger-button:disabled { cursor: not-allowed; opacity: 0.5; }
.selected-set-heading .primary-button { flex: 0 0 auto; }
.selected-set-empty { align-content: center; min-height: 14rem; }
.selected-set-empty p { max-width: 24rem; margin: 0; color: #718075; font-size: 0.77rem; line-height: 1.5; }
.selected-set-empty .primary-button { justify-self: start; }
.owner-directory-note, .owner-unavailable-note { margin: 0; color: #718075; font-size: 0.72rem; line-height: 1.5; }
.owner-directory-note button { min-height: 2.4rem; margin-left: 0.4rem; border: 1px solid #dfe5dc; border-radius: 0.3rem; background: #fff; color: #405748; }
.inventory-state { padding: 3.5rem 0; color: #627267; text-align: center; }
.inventory-load-error, .inventory-error { padding: 0.75rem 0.9rem; border-radius: 0.35rem; background: #f8e9e6; color: #8a3d34; font-size: 0.78rem; }
.inventory-load-error p { margin: 0 0 0.6rem; }
.inventory-saving { color: #627267; font-size: 0.76rem; }
.inventory-error { margin: 0; }
.set-removal-confirm { margin-top: 1rem; padding: 1rem; border: 1px solid #dcb9b2; border-radius: 0.45rem; background: #fff8f6; }
.set-removal-confirm h3 { margin: 0 0 0.45rem; color: #783d35; font-family: 'Space Grotesk', sans-serif; font-size: 0.95rem; overflow-wrap: anywhere; }
.set-removal-confirm p { margin: 0; color: #744d48; font-size: 0.76rem; line-height: 1.5; }
.removal-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.8rem; }
@media (max-width: 760px) { .jersey-management { padding: 2.2rem 0 2.8rem; } .inventory-columns { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 520px) {
  .jersey-management { padding: 1.8rem 0 2.5rem; }
  .inventory-heading { align-items: start; }
  .inventory-heading h2 { font-size: 1.65rem; }
  .panel-heading { align-items: stretch; flex-direction: column; }
  .panel-heading .secondary-button { width: 100%; }
  .selected-set-heading { align-items: stretch; flex-direction: column; }
  .selected-set-heading .primary-button { width: 100%; }
  .removal-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
}
</style>
