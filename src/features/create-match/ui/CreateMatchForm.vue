<script setup lang="ts">
import { ref } from 'vue'
import { useMatchStore } from '../../../entities/match'
import { createAndSaveMatch } from '../model/createAndSaveMatch'

const emit = defineEmits<{
  created: [matchId: string]
}>()

const store = useMatchStore()
const homeTeam = ref('')
const awayTeam = ref('')

async function submit(): Promise<void> {
  try {
    const matchId = await createAndSaveMatch(homeTeam.value, awayTeam.value, store)
    homeTeam.value = ''
    awayTeam.value = ''
    emit('created', matchId)
  } catch {
    // Keep both team names available for the user's retry.
  }
}
</script>

<template>
  <form class="new-match-card" @submit.prevent="submit">
    <div class="card-heading">
      <div>
        <p class="section-kicker">THE NEXT 90</p>
        <h2>Set up a match</h2>
      </div>
      <span class="card-icon" aria-hidden="true">＋</span>
    </div>

    <label class="field-label" for="home-team">Home team</label>
    <input
      id="home-team"
      v-model="homeTeam"
      name="homeTeam"
      autocomplete="off"
      maxlength="40"
      placeholder="e.g. North City"
      :disabled="!store.ready.value || store.saving.value"
      required
    />

    <div class="versus-divider"><span>VS</span></div>

    <label class="field-label" for="away-team">Away team</label>
    <input
      id="away-team"
      v-model="awayTeam"
      name="awayTeam"
      autocomplete="off"
      maxlength="40"
      placeholder="e.g. South Town"
      :disabled="!store.ready.value || store.saving.value"
      required
    />

    <button
      class="primary-button start-button"
      type="submit"
      :disabled="!store.ready.value || store.saving.value || !homeTeam.trim() || !awayTeam.trim()"
    >
      Create match <span aria-hidden="true">↗</span>
    </button>
    <p class="form-note">No accounts. No setup. Just football.</p>
  </form>
</template>

<style scoped>
.new-match-card {
  padding: 1.65rem 1.75rem 1.4rem;
  border: 1px solid #e7eae4;
  border-radius: 0.85rem;
  background: var(--paper);
  box-shadow: 0 1.25rem 3.5rem rgb(37 55 42 / 5%);
}

.section-kicker { margin: 0 0 0.55rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.card-heading h2 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 1.35rem; font-weight: 600; letter-spacing: -0.045em; }

.card-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #edf3e7;
  color: var(--green);
  font-size: 1.25rem;
}

.field-label { display: block; margin: 1.4rem 0 0.45rem; color: #49564d; font-size: 0.75rem; font-weight: 600; }

.new-match-card input {
  width: 100%;
  height: 2.85rem;
  padding: 0 0.8rem;
  border: 1px solid #e0e5dd;
  border-radius: 0.35rem;
  background: #fbfcfa;
  color: var(--ink);
  font-size: 0.85rem;
  transition: border-color 120ms ease, background 120ms ease;
}

.new-match-card input::placeholder { color: #aab2aa; }
.new-match-card input:focus { border-color: #6a8d70; background: #fff; }

.versus-divider {
  height: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.45rem;
  color: #a1aaa2;
  font-family: 'DM Mono', monospace;
  font-size: 0.55rem;
}

.primary-button {
  width: 100%;
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.35rem;
  background: var(--green);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  transition: background 140ms ease, transform 140ms ease;
}

.primary-button:not(:disabled):hover { transform: translateY(-1px); background: var(--green-dark); }
.primary-button:disabled { cursor: not-allowed; opacity: 0.48; }
.start-button { margin-top: 1.35rem; }
.start-button span { font-size: 1rem; }
.form-note { margin: 0.75rem 0 0; color: #8a938b; font-size: 0.66rem; text-align: center; }

@media (max-width: 760px) {
  .new-match-card { padding: 1.35rem; }
}
</style>
