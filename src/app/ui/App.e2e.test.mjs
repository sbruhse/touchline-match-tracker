import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { after, before, test } from 'node:test'
import { Builder, Browser, By, Key, Select, until } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'

let serverProcess
let baseUrl

function availableFirefoxBinary() {
  if (process.env.FIREFOX_BINARY) return process.env.FIREFOX_BINARY
  return [
    '/snap/firefox/current/usr/lib/firefox/firefox',
    '/usr/lib/firefox-esr/firefox-esr',
    '/usr/lib/firefox/firefox',
  ].find((path) => existsSync(path))
}

async function availablePort() {
  const reservation = createServer()
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const { port } = reservation.address()
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error('Vite server exited before becoming ready.')
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Vite server did not become ready at ${baseUrl}.`)
}

async function waitForText(driver, selector, expected) {
  const element = await driver.wait(until.elementLocated(By.css(selector)), 10_000)
  try {
    await driver.wait(
      async () => (await element.getText()).trim() === expected,
      10_000,
      `Expected ${selector} to show ${JSON.stringify(expected)}.`,
    )
  } catch (error) {
    const actual = (await element.getText()).trim()
    throw new Error(`Expected ${selector} to show ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`, { cause: error })
  }
  return element
}

async function click(driver, selector) {
  const element = await driver.wait(until.elementLocated(By.css(selector)), 10_000)
  await driver.wait(until.elementIsVisible(element), 10_000)
  await element.click()
  return element
}

async function createMatchInPreparation(driver, homeTeam, awayTeam) {
  await driver.findElement(By.id('home-team')).sendKeys(homeTeam)
  await driver.findElement(By.id('away-team')).sendKeys(awayTeam)
  await click(driver, '.start-button')
  await waitForText(driver, '#preparation-heading', 'Match squad')
  await waitForTextContaining(driver, '.step-optional', 'Optional')
}

async function skipPlayerTrackingAndOpenMatch(driver, homeTeam = 'North City') {
  await click(driver, '.squad-setup .quiet-button')
  await waitForText(driver, '#match-heading', homeTeam)
  assert.equal(await driver.executeScript(() => document.activeElement.id), 'match-heading',
    'Skipping player tracking should move focus to the Match heading.')
}

async function openPreparationJerseys(driver) {
  await scrollMatchControlIntoReachableArea(driver, '.prepare-match-button')
  await click(driver, '.prepare-match-button')
  await waitForText(driver, '#preparation-heading', 'Match squad')
  await click(driver, '.preparation-steps button[data-step="jerseys"]')
  await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
}

async function waitForTextContaining(driver, selector, expected) {
  const element = await driver.wait(until.elementLocated(By.css(selector)), 10_000)
  await driver.wait(
    async () => (await element.getText()).includes(expected),
    10_000,
    `Expected ${selector} to contain ${JSON.stringify(expected)}.`,
  )
  return element
}

async function dismissAutomaticGoalDetails(driver) {
  const dialog = await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
  await click(driver, '.focused-editor__close')
  await driver.wait(until.stalenessOf(dialog), 10_000)
}

async function scrollMatchControlIntoReachableArea(driver, selector) {
  await driver.executeScript((targetSelector) => {
    const target = document.querySelector(targetSelector)
    const header = document.querySelector('.match-sticky-header')
    const recording = document.querySelector('.match-action-area')
    if (!target || !header || !recording) return
    const targetRect = target.getBoundingClientRect()
    const headerBottom = header.getBoundingClientRect().bottom
    const actionTop = recording.getBoundingClientRect().top
    let visibleTop = headerBottom + 8
    let visibleBottom = actionTop - 8
    if (visibleBottom - visibleTop < targetRect.height) {
      visibleTop = headerBottom
      visibleBottom = actionTop
    }
    const correction = targetRect.bottom > visibleBottom
      ? targetRect.bottom - visibleBottom
      : targetRect.top < visibleTop ? targetRect.top - visibleTop : 0
    if (correction !== 0) document.scrollingElement.scrollTop += correction
  }, selector)
}

async function openViewportFrame(driver, width, matchSelector, height = 844) {
  await driver.switchTo().defaultContent()
  await driver.executeScript((viewportWidth, viewportHeight) => {
    document.querySelector('#viewport-check-frame')?.remove()
    const frame = document.createElement('iframe')
    frame.id = 'viewport-check-frame'
    frame.title = `${viewportWidth}×${viewportHeight}px Match viewport check`
    frame.style.position = 'fixed'
    frame.style.zIndex = '10000'
    frame.style.top = '0'
    frame.style.left = '0'
    frame.style.width = `${viewportWidth}px`
    frame.style.height = `${viewportHeight}px`
    frame.style.border = '0'
    frame.src = window.location.href
    document.body.append(frame)
  }, width, height)
  const frame = await driver.wait(until.elementLocated(By.id('viewport-check-frame')), 10_000)
  await driver.switchTo().frame(frame)
  await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
  await driver.executeScript((selector) => document.querySelector(selector)?.click(), matchSelector)
  try {
    await driver.wait(until.elementLocated(By.css('#match-heading')), 10_000)
  } catch (error) {
    const body = await driver.findElement(By.css('body')).getText()
    throw new Error(`The viewport frame did not open its match. Body text: ${body}`, { cause: error })
  }
  return frame
}

async function openPlayersViewportFrame(driver, width, height) {
  await driver.switchTo().defaultContent()
  await driver.executeScript((viewportWidth, viewportHeight) => {
    document.querySelector('#viewport-check-frame')?.remove()
    const frame = document.createElement('iframe')
    frame.id = 'viewport-check-frame'
    frame.title = `${viewportWidth}×${viewportHeight}px My players viewport check`
    frame.style.position = 'fixed'
    frame.style.zIndex = '10000'
    frame.style.top = '0'
    frame.style.left = '0'
    frame.style.width = `${viewportWidth}px`
    frame.style.height = `${viewportHeight}px`
    frame.style.border = '0'
    frame.src = window.location.href
    document.body.append(frame)
  }, width, height)
  const frame = await driver.wait(until.elementLocated(By.id('viewport-check-frame')), 10_000)
  await driver.switchTo().frame(frame)
  await driver.wait(until.elementLocated(By.css('[data-nav="players"]')), 10_000)
  await click(driver, '[data-nav="players"]')
  await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)
  return frame
}

async function openJerseySetsViewportFrame(driver, width, height) {
  await driver.switchTo().defaultContent()
  await driver.executeScript((viewportWidth, viewportHeight) => {
    document.querySelector('#viewport-check-frame')?.remove()
    const frame = document.createElement('iframe')
    frame.id = 'viewport-check-frame'
    frame.title = `${viewportWidth}×${viewportHeight}px Jersey sets viewport check`
    frame.style.position = 'fixed'
    frame.style.zIndex = '10000'
    frame.style.top = '0'
    frame.style.left = '0'
    frame.style.width = `${viewportWidth}px`
    frame.style.height = `${viewportHeight}px`
    frame.style.border = '0'
    frame.src = window.location.href
    document.body.append(frame)
  }, width, height)
  const frame = await driver.wait(until.elementLocated(By.id('viewport-check-frame')), 10_000)
  await driver.switchTo().frame(frame)
  await driver.wait(until.elementLocated(By.css('[data-nav="jersey-sets"]')), 10_000)
  await click(driver, '[data-nav="jersey-sets"]')
  await driver.wait(until.elementLocated(By.css('#jersey-management-heading')), 10_000)
  return frame
}

async function closeViewportFrame(driver) {
  await driver.switchTo().defaultContent()
  await driver.executeScript(() => document.querySelector('#viewport-check-frame')?.remove())
}

async function seedJerseyPreparationData(driver, {
  players,
  sets,
  squad,
  starterIds,
  ownSide = 'home',
  assignment = null,
  otherMatches = [],
  matchTeams = { home: 'North City', away: 'South Town' },
}) {
  const error = await driver.executeAsyncScript((playerPayload, setPayload, participation, jerseyAssignment, historyFixtures, teams, done) => {
    localStorage.setItem('touchline.player-store', playerPayload)
    localStorage.setItem('touchline.jersey-set-store', setPayload)
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`Could not open matches: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readwrite')
      const finish = (result) => {
        database.close()
        done(result)
      }
      const records = transaction.objectStore('matches')
      const list = records.getAll()
      list.onerror = () => finish(`Could not read matches: ${list.error?.message}`)
      list.onsuccess = () => {
        const match = list.result.find((record) => record.homeTeam === teams.home && record.awayTeam === teams.away)
        if (!match) {
          transaction.abort()
          return
        }
        match.participation = participation
        match.jerseyAssignment = jerseyAssignment
        match.firstKickoffAt = null
        for (const fixture of historyFixtures) {
          const historical = structuredClone(match)
          historical.id = fixture.id
          historical.homeTeam = fixture.homeTeam
          historical.awayTeam = fixture.awayTeam
          historical.createdAt = fixture.updatedAt
          historical.updatedAt = fixture.updatedAt
          historical.clock = {
            period: 1,
            elapsedMs: 0,
            status: fixture.status,
            startedAt: fixture.status === 'running' ? fixture.firstKickoffAt : null,
          }
          historical.firstKickoffAt = fixture.firstKickoffAt
          historical.participation = fixture.participation
          historical.jerseyAssignment = fixture.jerseyAssignment
          historical.goals = []
          records.put(historical)
        }
        records.put(match)
      }
      transaction.oncomplete = () => finish(null)
      transaction.onerror = () => finish(`Could not save the jersey-preparation fixture: ${transaction.error?.message}`)
      transaction.onabort = () => finish(`Could not save the jersey-preparation fixture: ${transaction.error?.message ?? 'transaction aborted'}`)
    }
  }, JSON.stringify({ version: 3, players }), JSON.stringify({ version: 1, sets }), {
    ownSide,
    squad,
    starterIds,
    substitutions: [],
  }, assignment, otherMatches, matchTeams)
  if (error) throw new Error(error)
}

async function setSavedRunningClockElapsed(driver, elapsedMs) {
  await setSavedClock(driver, { period: 1, elapsedMs, status: 'running' })
}

async function setSavedClock(driver, { period, elapsedMs, status = 'paused' }) {
  await driver.executeAsyncScript((elapsed, period, status, done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`Could not open the match database: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readwrite')
      const records = transaction.objectStore('matches')
      const listRequest = records.getAll()
      listRequest.onsuccess = () => {
        const match = listRequest.result.find((record) => record.homeTeam === 'North City' && record.awayTeam === 'South Town')
        if (!match) {
          transaction.abort()
          database.close()
          done('No saved match was found before setting the test clock.')
          return
        }

        const now = Date.now()
        match.clock.period = period
        match.clock.elapsedMs = elapsed
        match.clock.status = status
        match.clock.startedAt = status === 'running' ? now : null
        match.updatedAt = now
        records.put(match)
      }
      transaction.oncomplete = () => {
        database.close()
        done()
      }
      transaction.onabort = () => {
        const message = transaction.error?.message ?? 'IndexedDB transaction aborted.'
        database.close()
        done(message)
      }
      transaction.onerror = () => {
        const message = transaction.error?.message ?? 'IndexedDB transaction failed.'
        database.close()
        done(message)
      }
    }
  }, elapsedMs, period, status)
}

async function setSavedTeamNames(driver, previousHome, previousAway, homeTeam, awayTeam) {
  await driver.executeAsyncScript((previousHome, previousAway, homeTeam, awayTeam, done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(`Could not open the match database: ${request.error?.message}`)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readwrite')
      const records = transaction.objectStore('matches')
      const listRequest = records.getAll()
      listRequest.onsuccess = () => {
        const match = listRequest.result.find((record) => record.homeTeam === previousHome && record.awayTeam === previousAway)
        if (!match) {
          transaction.abort()
          database.close()
          done('No saved match was found before setting test team names.')
          return
        }

        match.homeTeam = homeTeam
        match.awayTeam = awayTeam
        match.updatedAt = Date.now()
        records.put(match)
      }
      transaction.oncomplete = () => {
        database.close()
        done()
      }
      transaction.onabort = () => {
        const message = transaction.error?.message ?? 'IndexedDB transaction aborted.'
        database.close()
        done(message)
      }
      transaction.onerror = () => {
        const message = transaction.error?.message ?? 'IndexedDB transaction failed.'
        database.close()
        done(message)
      }
    }
  }, previousHome, previousAway, homeTeam, awayTeam)
}

async function readSavedMatch(driver, homeTeam = 'North City', awayTeam = 'South Town') {
  return driver.executeAsyncScript((homeTeam, awayTeam, done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(null)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readonly')
      const listRequest = transaction.objectStore('matches').getAll()
      listRequest.onsuccess = () => {
        const match = listRequest.result.find((record) => record.homeTeam === homeTeam && record.awayTeam === awayTeam)
        done(match ?? null)
        database.close()
      }
      listRequest.onerror = () => {
        database.close()
        done(null)
      }
    }
  }, homeTeam, awayTeam)
}

before(async () => {
  const port = await availablePort()
  baseUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: 'ignore' },
  )
  await waitForServer()
})

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return
  serverProcess.kill('SIGTERM')
  await new Promise((resolve) => serverProcess.once('exit', resolve))
})

test('creates, tracks, completes, finishes, and reopens a match', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    const legacyPayload = JSON.stringify({
      version: 1,
      matches: [{ id: 'legacy-match', homeTeam: 'Old Harbor', awayTeam: 'Old Valley' }],
    })
    await driver.executeScript((payload) => localStorage.setItem('touchline.match-store', payload), legacyPayload)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await driver.wait(until.elementLocated(By.css('.empty-archive')), 10_000)
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.match-store')), legacyPayload)
    assert.ok(!(await driver.findElement(By.css('body')).getText()).includes('Old Harbor'))

    const desktopArchive = await driver.executeScript(() => {
      const welcome = document.querySelector('.welcome-panel').getBoundingClientRect()
      const copy = document.querySelector('.welcome-copy').getBoundingClientRect()
      const form = document.querySelector('.new-match-card').getBoundingClientRect()
      return { width: window.innerWidth, sideBySide: form.left >= copy.right - 1, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, welcomeWidth: welcome.width }
    })
    assert.ok(desktopArchive.width > 760, `Expected a desktop viewport, got ${desktopArchive.width}px.`)
    assert.ok(desktopArchive.sideBySide, 'The archive creation form should sit beside the welcome copy on desktop.')
    assert.ok(!desktopArchive.overflow, 'The archive should not overflow horizontally on desktop.')

    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowArchive = await driver.executeScript(() => {
      const copy = document.querySelector('.welcome-copy').getBoundingClientRect()
      const form = document.querySelector('.new-match-card').getBoundingClientRect()
      return { width: window.innerWidth, stacked: form.top >= copy.bottom - 1, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }
    })
    assert.ok(narrowArchive.width <= 520, `Expected a narrow viewport, got ${narrowArchive.width}px.`)
    assert.ok(narrowArchive.stacked, 'The archive creation form should stack below the welcome copy on narrow screens.')
    assert.ok(!narrowArchive.overflow, 'The archive should not overflow horizontally on narrow screens.')
    await createMatchInPreparation(driver, 'North City', 'South Town')
    const skippedCreation = await readSavedMatch(driver)
    assert.equal(skippedCreation.clock.status, 'not-started')
    assert.equal(skippedCreation.firstKickoffAt, null)
    assert.equal(skippedCreation.participation, null)
    await skipPlayerTrackingAndOpenMatch(driver)
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    const desktopDetail = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      controlsDirection: getComputedStyle(document.querySelector('.clock-actions')).flexDirection,
      feedbackVisible: document.querySelector('.save-feedback')?.getBoundingClientRect().height > 0,
      feedbackOverflow: document.querySelector('.save-feedback')?.getBoundingClientRect().right > window.innerWidth,
      recordingTeams: document.querySelectorAll('.match-action-area__inner > .goal-button').length,
    }))
    assert.ok(desktopDetail.width > 760, `Expected a desktop viewport, got ${desktopDetail.width}px.`)
    assert.ok(!desktopDetail.overflow, 'The detail view should not overflow horizontally on desktop.')
    assert.equal(desktopDetail.controlsDirection, 'row')
    assert.ok(desktopDetail.feedbackVisible, 'Committed-save feedback should be visible on desktop.')
    assert.ok(!desktopDetail.feedbackOverflow, 'Committed-save feedback should fit on desktop.')
    assert.equal(desktopDetail.recordingTeams, 2, 'Both team goal actions should remain discoverable on desktop.')

    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowDetail = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      controlsDirection: getComputedStyle(document.querySelector('.clock-actions')).flexDirection,
      feedbackVisible: document.querySelector('.save-feedback')?.getBoundingClientRect().height > 0,
      feedbackOverflow: document.querySelector('.save-feedback')?.getBoundingClientRect().right > window.innerWidth,
    }))
    assert.ok(narrowDetail.width <= 520, `Expected a narrow viewport, got ${narrowDetail.width}px.`)
    assert.ok(!narrowDetail.overflow, 'The detail view should not overflow horizontally on narrow screens.')
    assert.equal(narrowDetail.controlsDirection, 'row')
    assert.ok(narrowDetail.feedbackVisible, 'Committed-save feedback should be visible on narrow screens.')
    assert.ok(!narrowDetail.feedbackOverflow, 'Committed-save feedback should fit on narrow screens.')

    const longHome = 'North City Athletic SupercalifragilisticexpialidociousHomeTeam'
    const longAway = 'South Town United PneumonoultramicroscopicsilicovolcanoconiosisAwayTeam'
    await setSavedTeamNames(driver, 'North City', 'South Town', longHome, longAway)
    await driver.navigate().refresh()
    await click(driver, `[aria-label="Open ${longHome} versus ${longAway}"]`)
    await waitForText(driver, '#match-heading', longHome)
    for (const width of [320, 390]) {
      await openViewportFrame(driver, width, `[aria-label="Open ${longHome} versus ${longAway}"]`)
      const workspace = await driver.executeScript(() => {
        window.scrollTo(0, document.body.scrollHeight)
        const header = document.querySelector('.match-sticky-header').getBoundingClientRect()
        const actionArea = document.querySelector('.match-action-area').getBoundingClientRect()
        const targets = [...document.querySelectorAll('.match-panel-tabs button, .match-action-area button')]
        const goalTiles = [...document.querySelectorAll('.match-action-area .goal-button')].map((button) => {
          const buttonRect = button.getBoundingClientRect()
          const team = button.querySelector('.goal-button__team')
          const teamRange = document.createRange()
          teamRange.selectNodeContents(team)
          const teamLines = [...teamRange.getClientRects()].map((line) => ({
            left: line.left,
            right: line.right,
            top: line.top,
            bottom: line.bottom,
          }))
          const action = button.querySelector('.goal-button__action')
          const iconRect = action.querySelector('svg').getBoundingClientRect()
          const labelNode = [...action.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          const labelRange = document.createRange()
          labelRange.selectNodeContents(labelNode)
          return {
            width: buttonRect.width,
            text: team.textContent.trim(),
            teamFits: team.scrollWidth <= team.clientWidth + 1,
            linesInsideButton: teamLines.every((line) => line.left >= buttonRect.left && line.right <= buttonRect.right && line.top >= buttonRect.top && line.bottom <= buttonRect.bottom),
            iconGap: labelRange.getBoundingClientRect().left - iconRect.right,
            cssGap: Number.parseFloat(getComputedStyle(action).columnGap),
          }
        })
        const clockAction = document.querySelector('.clock-primary .app-icon')?.parentElement
        const clockIconRect = clockAction?.querySelector('svg').getBoundingClientRect()
        const clockLabelNode = [...(clockAction?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        const clockLabelRange = document.createRange()
        if (clockLabelNode) clockLabelRange.selectNodeContents(clockLabelNode)
        const goalButtonStyle = getComputedStyle(document.querySelector('.goal-button'))
        const selectedTabStyle = getComputedStyle(document.querySelector('.match-panel-tabs button[aria-selected="true"]'))
        const luminance = (color) => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
            const normalized = channel / 255
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
        }
        const contrast = (foreground, background) => {
          const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
          return (values[0] + 0.05) / (values[1] + 0.05)
        }
        return {
          width: window.innerWidth,
          viewportHeight: window.innerHeight,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          compactChrome: document.querySelector('.topbar--match').getBoundingClientRect().height <= 56,
          appFooterHidden: document.querySelector('.page-footer') === null,
          stickyTop: getComputedStyle(document.querySelector('.match-sticky-header')).position,
          headerTop: header.top,
          actionPosition: getComputedStyle(document.querySelector('.match-action-area')).position,
          actionBottom: actionArea.bottom,
          actionHeights: targets.map((target) => target.getBoundingClientRect().height),
          longNames: [...document.querySelectorAll('.match-header__team')].map((team) => team.textContent.trim()),
          goalTiles,
          clockIconGap: clockLabelNode && clockIconRect ? clockLabelRange.getBoundingClientRect().left - clockIconRect.right : 0,
          clockCssGap: clockAction ? Number.parseFloat(getComputedStyle(clockAction).gap) : 0,
          goalContrast: contrast(goalButtonStyle.color, goalButtonStyle.backgroundColor),
          selectedTabContrast: contrast(selectedTabStyle.color, selectedTabStyle.backgroundColor),
        }
      })
      assert.equal(workspace.width, width)
      assert.ok(!workspace.overflow, `The Match workspace should not overflow at ${width}px.`)
      assert.ok(workspace.compactChrome, 'The app chrome should remain compact on the Match page.')
      assert.ok(workspace.appFooterHidden, 'The app footer should not add redundant Match-page chrome.')
      assert.equal(workspace.stickyTop, 'sticky')
      assert.ok(workspace.headerTop >= -1 && workspace.headerTop < 4, 'The match header should remain at the top while scrolling.')
      assert.equal(workspace.actionPosition, 'fixed')
      assert.ok(Math.abs(workspace.actionBottom - workspace.viewportHeight) < 16,
         `Recording actions should stay at the viewport bottom (${workspace.actionBottom}/${workspace.viewportHeight}).`)
       assert.ok(workspace.actionHeights.every((height) => height >= 48), 'Tabs and action buttons should have 48px touch targets.')
       assert.deepEqual(workspace.longNames, [longHome, longAway])
       assert.deepEqual(workspace.goalTiles.map((tile) => tile.text), [longHome, longAway], 'Each whole goal button should contain its full team name.')
       assert.ok(Math.abs(workspace.goalTiles[0].width - workspace.goalTiles[1].width) <= 1, 'Phone goal buttons should be equal width.')
       assert.ok(workspace.goalTiles.every((tile) => tile.teamFits && tile.linesInsideButton), 'Every wrapped or unbroken team-name line should remain visible inside its button.')
       assert.ok(workspace.goalTiles.every((tile) => tile.iconGap >= 6 && tile.cssGap >= 8), 'Goal icons should have visible separation from their labels.')
       assert.ok(workspace.clockIconGap >= 6 && workspace.clockCssGap >= 8, 'Clock icons should have visible separation from their labels.')
      assert.ok(workspace.goalContrast >= 4.5, `Goal-button text contrast should be at least 4.5:1, got ${workspace.goalContrast}.`)
      assert.ok(workspace.selectedTabContrast >= 4.5, `Selected-tab contrast should be at least 4.5:1, got ${workspace.selectedTabContrast}.`)
      await driver.findElement(By.id('events-tab')).sendKeys(Key.ARROW_RIGHT)
      await driver.wait(async () => await driver.findElement(By.id('player-times-tab')).getAttribute('aria-selected') === 'true', 10_000)
      assert.equal(await driver.executeScript(() => document.activeElement.id), 'player-times-tab')
      await driver.findElement(By.id('player-times-tab')).sendKeys(Key.ARROW_LEFT)
      await driver.wait(async () => await driver.findElement(By.id('events-tab')).getAttribute('aria-selected') === 'true', 10_000)
      assert.equal(await driver.executeScript(() => document.activeElement.id), 'events-tab')
      await closeViewportFrame(driver)
    }

    await setSavedTeamNames(driver, 'North City', 'South Town', longHome, longAway)
    await driver.navigate().refresh()
    await setSavedTeamNames(driver, longHome, longAway, 'North City', 'South Town')
    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '#match-heading', 'North City')
    assert.equal(await driver.findElement(By.css('#events-tab')).getAttribute('aria-selected'), 'true')
    await click(driver, '#player-times-tab')
    assert.match(await driver.findElement(By.css('.untracked-player-times')).getText(), /can be set up before kickoff/i)
    assert.ok(await driver.findElement(By.css('[aria-label="Record goal for North City"]')).isDisplayed())
    await click(driver, '#events-tab')

    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    const stoppageOffset = 45 * 60_000 + 61_000
    await setSavedRunningClockElapsed(driver, stoppageOffset)
    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '[data-testid="match-minute"]', '45+2′')

    await click(driver, '#player-times-tab')
    assert.match(await driver.findElement(By.css('.untracked-player-times')).getText(), /tracking was not enabled/i)
    assert.equal(await driver.findElements(By.css('.squad-setup')).then((items) => items.length), 0)
    const beforeDelayedGoal = await readSavedMatch(driver)
    await driver.executeScript(() => {
      const originalNow = Date.now.bind(Date)
      const originalPut = IDBObjectStore.prototype.put
      let held = false
      let release = false
      window.__realDateNow = originalNow
      document.querySelector('[aria-label="Record goal for North City"]').addEventListener('click', () => {
        window.__acceptedGoalTimestamp = Date.now()
      }, { capture: true, once: true })
      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args)
        if (!held) {
          held = true
          const store = this
          window.__pendingGoalCandidate = structuredClone(args[0])
          const keepTransactionActive = () => {
            if (release) return
            const keepAliveRequest = store.get('__hold-goal-transaction__')
            keepAliveRequest.onsuccess = keepTransactionActive
          }
          keepTransactionActive()
          window.__releaseGoalWrite = () => {
            release = true
            Date.now = () => window.__commitTimestamp
          }
        }
        return request
      }
    })
    await click(driver, '[aria-label="Record goal for North City"]')
    await waitForText(driver, '.match-save-feedback', 'Saving changes…')
    assert.equal(await driver.findElements(By.css('[role="dialog"]')).then((items) => items.length), 0,
      'Goal details must not open before the initial IndexedDB commit.')
    await driver.wait(async () => await driver.executeScript(() => typeof window.__releaseGoalWrite === 'function'), 10_000)
    const pendingGoal = await driver.executeScript(() => {
      const match = window.__pendingGoalCandidate
      return {
        acceptedAt: window.__acceptedGoalTimestamp,
        goal: match.goals.at(-1),
      }
    })
    assert.ok(pendingGoal.goal.createdAt >= pendingGoal.acceptedAt
      && pendingGoal.goal.createdAt - pendingGoal.acceptedAt < 100,
    'The candidate goal timestamp should be captured at the recording action, before the delayed commit.')
    const commitTimestamp = pendingGoal.goal.createdAt + 60_000
    await driver.executeScript((timestamp) => { window.__commitTimestamp = timestamp }, commitTimestamp)
    await driver.executeScript(() => window.__releaseGoalWrite())
    await waitForText(driver, '[data-testid="home-score"]', '1')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    const committedGoal = await readSavedMatch(driver)
    assert.equal(committedGoal.goals.length, 1, 'One accepted recording action should persist exactly one goal.')
    assert.equal(committedGoal.goals[0].createdAt, pendingGoal.goal.createdAt)
    assert.equal(committedGoal.goals[0].elapsedMs, pendingGoal.goal.elapsedMs,
      'The goal timestamp should reflect the accepted action time, not the later transaction commit.')
    assert.ok(committedGoal.goals[0].createdAt < commitTimestamp - 30_000,
      'The persisted goal should retain its pre-commit timestamp after the transaction delay.')
    await driver.executeScript(() => { Date.now = window.__realDateNow })
    assert.equal(await driver.findElements(By.css('.timeline-event[data-event-type="goal"]')).then((items) => items.length), 1)
    assert.equal(
      await driver.findElement(By.css('.timeline-event[data-event-type="goal"]')).getAttribute('data-event-id'),
      committedGoal.goals[0].id,
      'The automatically opened editor should belong to the exact committed goal.',
    )
    assert.equal(await driver.findElements(By.css('.app-save-feedback')).then((items) => items.length), 0)
    const narrowGoalEditor = await driver.executeScript(() => getComputedStyle(document.querySelector('.goal-editor-grid')).gridTemplateColumns.split(' ').length)
    assert.equal(narrowGoalEditor, 1, 'The goal editor should use one column on narrow screens.')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    const desktopGoalEditor = await driver.executeScript(() => getComputedStyle(document.querySelector('.goal-editor-grid')).gridTemplateColumns.split(' ').length)
    assert.equal(desktopGoalEditor, 2, 'The goal editor should use two columns on desktop.')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    assert.equal(await driver.findElement(By.css('.goal-editor input[name="scorer"]')).getAttribute('value'), '')
    assert.equal(await driver.findElement(By.css('.goal-editor input[name="assist"]')).getAttribute('value'), '')
    const initialGoalDialog = await driver.findElement(By.css('[role="dialog"]'))
    const closeEditor = driver.findElement(By.css('.focused-editor__close'))
    assert.equal(await driver.executeScript(() => document.activeElement?.className), 'focused-editor__close')
    await closeEditor.sendKeys(Key.TAB)
    assert.equal(await driver.executeScript(() => document.activeElement?.getAttribute('name')), 'side')
    await driver.actions().keyDown(Key.SHIFT).sendKeys(Key.TAB).keyUp(Key.SHIFT).perform()
    assert.equal(await driver.executeScript(() => document.activeElement?.className), 'focused-editor__close')
    await closeEditor.sendKeys(Key.ESCAPE)
    await driver.wait(until.stalenessOf(initialGoalDialog), 10_000)
    assert.equal(await driver.executeScript(() => document.activeElement?.id), 'player-times-tab')
    assert.equal((await readSavedMatch(driver)).goals.length, 1, 'Dismissing blank details must not undo the recorded goal.')
    await click(driver, '#events-tab')
    await waitForText(driver, '.goal-event-time', '45+2′')

    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '[data-testid="match-minute"]', '45+2′')
    await click(driver, '[aria-label^="Add details for North City goal"]')
    await driver.findElement(By.css('.goal-editor input[name="scorer"]')).sendKeys('A. Player')
    await driver.findElement(By.css('.goal-editor textarea[name="description"]')).sendKeys(
      'A finish from the edge of the box',
    )
    const editedGoalDialog = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await driver.wait(until.stalenessOf(editedGoalDialog), 10_000)

    await click(driver, '[aria-label^="Edit details for North City goal"]')
    assert.equal(await driver.findElement(By.css('.goal-editor input[name="scorer"]')).getAttribute('value'), 'A. Player')
    await click(driver, '.focused-editor__close')

    await click(driver, '.secondary-button')
    await waitForText(driver, '.clock-status', 'HALF TIME')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-period', 'SECOND HALF')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await click(driver, '.secondary-button')
    await waitForText(driver, '.clock-status', 'FULL TIME')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await click(driver, '.back-button')
    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '.clock-status', 'FULL TIME')

    await waitForText(driver, '[data-testid="match-minute"]', '46′')
    await waitForText(driver, '[data-testid="home-score"]', '1')
    await waitForText(driver, '.goal-event-time', '45+2′')
    assert.ok(await driver.findElement(By.css('.goal-button')).isDisplayed())
    assert.ok(await driver.findElement(By.css('[data-testid="match-minute"]')).isDisplayed())
    await click(driver, '[aria-label^="Edit details for North City goal"]')
    assert.equal(await driver.findElement(By.css('.goal-editor input[name="scorer"]')).getAttribute('value'), 'A. Player')
    assert.equal(
      await driver.findElement(By.css('.goal-editor textarea[name="description"]')).getAttribute('value'),
      'A finish from the edge of the box',
    )

    await driver.executeScript(() => {
      const originalPut = IDBObjectStore.prototype.put
      let failNextWrite = true
      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args)
        if (failNextWrite) {
          failNextWrite = false
          request.addEventListener('success', () => this.transaction.abort(), { once: true })
        }
        return request
      }
    })
    await driver.findElement(By.css('.goal-editor input[name="assist"]')).sendKeys('J. Midfielder')
    const retriedGoalDialog = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.elementLocated(By.css('.goal-editor .editor-error[role="alert"]')), 10_000)
    assert.equal(await driver.findElements(By.css('.match-save-feedback')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.app-save-feedback')).then((items) => items.length), 0)
    assert.equal(await driver.findElement(By.css('.goal-editor input[name="assist"]')).getAttribute('value'), 'J. Midfielder')
    await click(driver, '.save-goal-button')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await driver.wait(until.stalenessOf(retriedGoalDialog), 10_000)

    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.executeScript(() => {
      const originalPut = IDBObjectStore.prototype.put
      let failNextWrite = true
      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args)
        if (failNextWrite) {
          failNextWrite = false
          request.addEventListener('success', () => this.transaction.abort(), { once: true })
        }
        return request
      }
    })
    await click(driver, '[aria-label="Record goal for South Town"]')
    await waitForText(driver, '[data-testid="away-score"]', '0')
    await driver.wait(until.elementLocated(By.css('.save-feedback[role="alert"]')), 10_000)
    assert.match(await driver.findElement(By.css('.save-feedback[role="alert"]')).getText(), /Could not save changes/)
    const desktopFailureFeedback = await driver.executeScript(() => {
      const feedback = document.querySelector('.save-feedback').getBoundingClientRect()
      return { right: feedback.right, width: window.innerWidth, visible: feedback.height > 0 }
    })
    assert.ok(desktopFailureFeedback.visible, 'Failure feedback should be visible on desktop.')
    assert.ok(desktopFailureFeedback.right <= desktopFailureFeedback.width, 'Failure feedback should fit on desktop.')
    await click(driver, '[aria-label="Record goal for South Town"]')
    await waitForText(driver, '[data-testid="away-score"]', '1')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await dismissAutomaticGoalDetails(driver)

    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowCommittedFeedback = await driver.executeScript(() => {
      const feedback = document.querySelector('.save-feedback').getBoundingClientRect()
      return { right: feedback.right, width: window.innerWidth, visible: feedback.height > 0 }
    })
    assert.ok(narrowCommittedFeedback.visible, 'Committed feedback should be visible after retry on a narrow viewport.')
    assert.ok(narrowCommittedFeedback.right <= narrowCommittedFeedback.width, 'Committed feedback should fit on a narrow viewport.')

    await driver.executeScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      window.fetch = () => Promise.reject(new Error('Network access is disabled for this loaded-page check.'))
      window.XMLHttpRequest = class {
        constructor() { throw new Error('Network access is disabled for this loaded-page check.') }
      }
    })
    await click(driver, '[aria-label="Record goal for South Town"]')
    await waitForText(driver, '[data-testid="away-score"]', '2')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await dismissAutomaticGoalDetails(driver)
    assert.equal(await driver.executeScript(() => navigator.onLine), false)
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.match-store')), legacyPayload)

    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 === 0 ? 'home' : 'away'
      const score = side === 'home' ? 2 + Math.floor(index / 2) : 3 + Math.floor(index / 2)
      await click(driver, `[aria-label="Record goal for ${side === 'home' ? 'North City' : 'South Town'}"]`)
      await waitForText(driver, `[data-testid="${side}-score"]`, String(score))
      await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
      await dismissAutomaticGoalDetails(driver)
    }

    for (const width of [320, 390]) {
      await openViewportFrame(driver, width, '[aria-label="Open North City versus South Town"]')
      const bottomReachability = await driver.executeScript(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        const actionArea = document.querySelector('.match-action-area').getBoundingClientRect()
        const header = document.querySelector('.match-sticky-header').getBoundingClientRect()
        const events = document.querySelectorAll('.timeline-event')
        const lastEvent = events[events.length - 1].getBoundingClientRect()
        const firstEvent = events[0].getBoundingClientRect()
        const eventAction = events[0].querySelector('.timeline-event-actions button').getBoundingClientRect()
        return {
          width: window.innerWidth,
          viewportHeight: window.innerHeight,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          actionBottom: actionArea.bottom,
          actionTop: actionArea.top,
          headerTop: header.top,
          lastEventTop: lastEvent.top,
          lastEventBottom: lastEvent.bottom,
          eventActionInsets: {
            left: eventAction.left - firstEvent.left,
            right: firstEvent.right - eventAction.right,
            bottom: firstEvent.bottom - eventAction.bottom,
          },
          targetHeights: [...document.querySelectorAll('.match-panel-tabs button, .match-action-area button')]
            .map((target) => target.getBoundingClientRect().height),
        }
      })
      assert.equal(bottomReachability.width, width)
      assert.ok(!bottomReachability.overflow, `The Match page should not scroll horizontally at ${width}px.`)
      assert.ok(Math.abs(bottomReachability.actionBottom - bottomReachability.viewportHeight) < 16)
      assert.ok(bottomReachability.headerTop >= -1 && bottomReachability.headerTop < 4)
      assert.ok(bottomReachability.targetHeights.every((height) => height >= 48))
      assert.ok(bottomReachability.lastEventTop >= 0)
      assert.ok(bottomReachability.lastEventBottom <= bottomReachability.actionTop + 1,
        `The oldest event should be fully reachable above the recording actions at ${width}px.`)
      assert.ok(Object.values(bottomReachability.eventActionInsets).every((inset) => inset >= 9),
        `Event editor focus rings should fit inside their padded card actions at ${width}px.`)
      await closeViewportFrame(driver)
    }

    await openViewportFrame(driver, 844, '[aria-label="Open North City versus South Town"]', 390)
    const landscape = await driver.executeScript(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      const header = document.querySelector('.match-sticky-header').getBoundingClientRect()
      const actions = document.querySelector('.match-action-area').getBoundingClientRect()
      const events = document.querySelectorAll('.timeline-event')
      const lastEvent = events[events.length - 1].getBoundingClientRect()
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        eventCount: events.length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        headerTop: header.top,
        actionBottom: actions.bottom,
        actionTop: actions.top,
        lastEventBottom: lastEvent.bottom,
      }
    })
    assert.equal(landscape.width, 844)
    assert.equal(landscape.height, 390)
    assert.ok(landscape.eventCount >= 9, 'The landscape check should include the long event history.')
    assert.ok(!landscape.overflow, 'A short landscape Match view should not overflow horizontally.')
    assert.ok(landscape.headerTop >= -1 && landscape.headerTop < 4)
    assert.ok(Math.abs(landscape.actionBottom - landscape.height) < 16)
    assert.ok(landscape.lastEventBottom <= landscape.actionTop + 1)
    await closeViewportFrame(driver)

    await openViewportFrame(driver, 320, '[aria-label="Open North City versus South Town"]')
      await driver.wait(async () => await driver.findElements(By.css('.timeline-event')).then((events) => events.length >= 9), 10_000)
      await driver.executeAsyncScript((done) => document.fonts.ready.then(() => requestAnimationFrame(() => done())))
      const enlargedText = await driver.executeScript(() => {
        document.documentElement.style.fontSize = '20px'
        window.scrollTo(0, document.documentElement.scrollHeight)
        const actionArea = document.querySelector('.match-action-area').getBoundingClientRect()
        const events = document.querySelectorAll('.timeline-event')
        const lastEvent = events[events.length - 1].getBoundingClientRect()
      return {
        width: window.innerWidth,
        eventCount: events.length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        overflowElements: [...document.querySelectorAll('body *')]
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map(({ element, rect }) => ({ className: element.className, text: element.textContent.trim().slice(0, 40), right: rect.right })),
        actionBottom: actionArea.bottom,
          actionTop: actionArea.top,
          viewportHeight: window.innerHeight,
        targetHeights: [...document.querySelectorAll('.match-panel-tabs button, .match-action-area button')]
          .map((target) => target.getBoundingClientRect().height),
        lastEventBottom: lastEvent.bottom,
      }
    })
    assert.equal(enlargedText.width, 320)
    assert.ok(enlargedText.eventCount >= 9, 'The enlarged-text check should include the long event history.')
    assert.ok(!enlargedText.overflow, `Enlarged text should not create horizontal Match-page scrolling: ${JSON.stringify(enlargedText)}.`)
    assert.ok(Math.abs(enlargedText.actionBottom - enlargedText.viewportHeight) < 16)
      assert.ok(enlargedText.targetHeights.every((height) => height >= 48))
      assert.ok(enlargedText.lastEventBottom <= enlargedText.actionTop + 1)
    await closeViewportFrame(driver)

    await openViewportFrame(driver, 390, '[aria-label="Open North City versus South Town"]', 480)
    const addDetailsSelector = '[aria-label^="Add details for North City goal"]'
    await driver.executeScript((selector) => document.querySelector(selector)?.scrollIntoView({ block: 'center' }), addDetailsSelector)
    await click(driver, addDetailsSelector)
    const goalEditorViewport = await driver.executeScript(() => {
      const dialog = document.querySelector('.focused-editor').getBoundingClientRect()
      const body = document.querySelector('.focused-editor__body')
      const bodyRect = body.getBoundingClientRect()
      const timeField = document.querySelector('.goal-editor input[name="time"]').getBoundingClientRect()
      const close = document.querySelector('.focused-editor__close').getBoundingClientRect()
      const actions = document.querySelector('.focused-editor__actions')
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        dialogHeight: dialog.height,
        fieldInitiallyReachable: timeField.top >= bodyRect.top && timeField.bottom <= bodyRect.bottom,
        bodyScrollable: body.scrollHeight > body.clientHeight,
        closeReachable: close.top >= 0 && close.bottom <= window.innerHeight,
        actionPaddingBottom: Number.parseFloat(getComputedStyle(actions).paddingBottom),
      }
    })
    assert.equal(goalEditorViewport.width, 390)
    assert.equal(goalEditorViewport.height, 480)
    assert.ok(goalEditorViewport.dialogHeight <= goalEditorViewport.height)
    assert.ok(goalEditorViewport.fieldInitiallyReachable)
    assert.ok(goalEditorViewport.bodyScrollable, 'Goal editor fields should scroll within a short viewport.')
    assert.ok(goalEditorViewport.closeReachable)
    assert.ok(goalEditorViewport.actionPaddingBottom >= 16, 'Editor actions should retain bottom safe-area padding.')
    const goalTimeField = driver.findElement(By.css('.goal-editor input[name="time"]'))
    await goalTimeField.clear()
    await goalTimeField.sendKeys('not a minute')
    await click(driver, '.save-goal-button')
    await driver.wait(until.elementLocated(By.css('.goal-editor .editor-error[role="alert"]')), 10_000)
    const goalErrorReachability = await driver.executeScript(() => {
      const body = document.querySelector('.focused-editor__body')
      body.scrollTop = body.scrollHeight
      const bodyRect = body.getBoundingClientRect()
      const error = document.querySelector('.goal-editor .editor-error[role="alert"]').getBoundingClientRect()
      const actions = document.querySelector('.focused-editor__actions').getBoundingClientRect()
      const close = document.querySelector('.focused-editor__close').getBoundingClientRect()
      return {
        errorReachable: error.top >= bodyRect.top && error.bottom <= bodyRect.bottom,
        saveReachable: actions.top >= 0 && actions.bottom <= window.innerHeight,
        closeReachable: close.top >= 0 && close.bottom <= window.innerHeight,
      }
    })
    assert.ok(goalErrorReachability.errorReachable)
    assert.ok(goalErrorReachability.saveReachable)
    assert.ok(goalErrorReachability.closeReachable)
    await click(driver, '.focused-editor__close')
    await closeViewportFrame(driver)
  } finally {
    await driver.quit()
  }
})

test('edits goal attribution explicitly from the saved squad and keeps legacy names manual', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const players = [
    { id: 'goal-alex', name: 'Alex Morgan', positions: [], jerseySize: 'M', archived: false, createdAt: 1, updatedAt: 1 },
    { id: 'goal-sam', name: 'Sam Taylor', positions: [], jerseySize: 'M', archived: false, createdAt: 2, updatedAt: 2 },
  ]

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await driver.executeScript((playerRecords) => {
      localStorage.setItem('touchline.player-store', JSON.stringify({ version: 3, players: playerRecords }))
    }, players)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)

    await createMatchInPreparation(driver, 'Goal City', 'Opponent Town')
    await click(driver, '.squad-setup .primary-button')
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css('[aria-label="Include Alex Morgan in match squad"]')).click()
    await driver.findElement(By.css('[aria-label="Include Sam Taylor in match squad"]')).click()
    await driver.findElement(By.css('[aria-label="Select Alex Morgan as a starter"]')).click()
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await click(driver, '.cancel-button')
    await waitForText(driver, '#match-heading', 'Goal City')

    await click(driver, '[aria-label="Record goal for Goal City"]')
    await waitForText(driver, '[data-testid="home-score"]', '1')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    const scorerSelect = await driver.findElement(By.id('goal-scorer-player'))
    const assistSelect = await driver.findElement(By.id('goal-assist-player'))
    const scorerOptions = await scorerSelect.findElements(By.css('option'))
    const scorerOptionTexts = await Promise.all(scorerOptions.map((option) => option.getText()))
    assert.ok(scorerOptionTexts.some((text) => text.includes('Alex Morgan')))
    assert.ok(await driver.findElement(By.css('#goal-scorer-player option[value="goal-sam"]')).isDisplayed(),
      'The full saved squad, including the bench, should be available without jersey inventory.')
    await new Select(scorerSelect).selectByValue('goal-alex')
    await new Select(assistSelect).selectByValue('goal-sam')
    const linkedDialog = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.stalenessOf(linkedDialog), 10_000)
    let savedMatch = await readSavedMatch(driver, 'Goal City', 'Opponent Town')
    assert.equal(savedMatch.recordVersion, 4)
    assert.deepEqual(
      [savedMatch.goals[0].scorerPlayerId, savedMatch.goals[0].scorer, savedMatch.goals[0].assistPlayerId, savedMatch.goals[0].assist],
      ['goal-alex', 'Alex Morgan', 'goal-sam', 'Sam Taylor'],
    )

    await scrollMatchControlIntoReachableArea(driver, '[aria-label^="Edit details for Goal City goal"]')
    await click(driver, '[aria-label^="Edit details for Goal City goal"]')
    await new Select(await driver.findElement(By.id('goal-scorer-player'))).selectByValue('goal-sam')
    await click(driver, '.focused-editor__close')
    await scrollMatchControlIntoReachableArea(driver, '[aria-label^="Edit details for Goal City goal"]')
    await click(driver, '[aria-label^="Edit details for Goal City goal"]')
    const retainedScorerOption = await new Select(await driver.findElement(By.id('goal-scorer-player'))).getFirstSelectedOption()
    assert.equal(await retainedScorerOption.getAttribute('value'), 'goal-sam')
    await click(driver, '.discard-goal-button')
    const discardedScorerOption = await new Select(await driver.findElement(By.id('goal-scorer-player'))).getFirstSelectedOption()
    assert.equal(await discardedScorerOption.getAttribute('value'), 'goal-alex')
    await click(driver, '.focused-editor__close')

    await driver.executeAsyncScript((done) => {
      const request = indexedDB.open('touchline', 1)
      request.onerror = () => done(`Could not open match database: ${request.error?.message}`)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('matches', 'readwrite')
        const records = transaction.objectStore('matches')
        const all = records.getAll()
        all.onsuccess = () => {
          const match = all.result.find((record) => record.homeTeam === 'Goal City' && record.awayTeam === 'Opponent Town')
          if (!match) {
            transaction.abort()
            database.close()
            done('The saved goal match is missing.')
            return
          }
          match.recordVersion = 3
          for (const goal of match.goals) {
            delete goal.scorerPlayerId
            delete goal.assistPlayerId
            goal.scorer = 'Alex Morgan'
            goal.assist = 'Sam Taylor'
          }
          records.put(match)
        }
        transaction.oncomplete = () => { database.close(); done() }
        transaction.onerror = () => { database.close(); done(transaction.error?.message ?? 'Legacy fixture write failed.') }
      }
    })
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open Goal City versus Opponent Town"]')
    await scrollMatchControlIntoReachableArea(driver, '[aria-label^="Edit details for Goal City goal"]')
    await click(driver, '[aria-label^="Edit details for Goal City goal"]')
    await driver.wait(until.elementLocated(By.id('goal-scorer-player')), 10_000)
    const legacyScorerOption = await new Select(await driver.findElement(By.id('goal-scorer-player'))).getFirstSelectedOption()
    assert.equal(
      await legacyScorerOption.getAttribute('value'),
      '__manual_name__',
      'A legacy name that matches a squad member must remain an unlinked manual value.',
    )
    assert.equal(await driver.findElement(By.id('goal-scorer-name')).getAttribute('value'), 'Alex Morgan')
    const legacyAssistOption = await new Select(await driver.findElement(By.id('goal-assist-player'))).getFirstSelectedOption()
    assert.equal(await legacyAssistOption.getAttribute('value'), '__manual_name__')
    const legacyDialog = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.stalenessOf(legacyDialog), 10_000)
    savedMatch = await readSavedMatch(driver, 'Goal City', 'Opponent Town')
    assert.equal(savedMatch.recordVersion, 4, 'The explicit successful details save should lazily upgrade the legacy match.')
    assert.equal(savedMatch.goals[0].scorerPlayerId, null)
    assert.equal(savedMatch.goals[0].assistPlayerId, null)

    await scrollMatchControlIntoReachableArea(driver, '[aria-label^="Edit details for Goal City goal"]')
    await click(driver, '[aria-label^="Edit details for Goal City goal"]')
    await new Select(await driver.findElement(By.name('side'))).selectByValue('away')
    await driver.wait(until.elementLocated(By.id('goal-scorer-name')), 10_000)
    assert.equal(await driver.findElement(By.id('goal-scorer-name')).getAttribute('value'), 'Alex Morgan')
    assert.equal(await driver.findElements(By.id('goal-scorer-player')).then((items) => items.length), 0,
      'Opponent goals should offer manual entry rather than own-squad players.')
    const opponentDialog = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.stalenessOf(opponentDialog), 10_000)
    savedMatch = await readSavedMatch(driver, 'Goal City', 'Opponent Town')
    assert.equal(savedMatch.goals[0].side, 'away')
    assert.equal(savedMatch.goals[0].scorerPlayerId, null)
    assert.equal(savedMatch.goals[0].scorer, 'Alex Morgan')
  } finally {
    await driver.quit()
  }
})

test('counts automatic goal attribution by identity through correction, archive, and reload', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const homeTeam = 'Credit City'
  const awayTeam = 'Rival Town'
  const alexName = 'Alex Morgan'
  const samName = 'Sam Kerr'

  async function openStatistics(playerName) {
    await click(driver, `[aria-label="View statistics for ${playerName}"]`)
    try {
      await waitForText(driver, '#player-statistics-heading', playerName)
    } catch (error) {
      const body = await driver.findElement(By.css('body')).getText()
      throw new Error(`Could not open ${playerName} statistics. Current page: ${body}`, { cause: error })
    }
  }

  async function assertTotals({ playerName, goals, assists, archived = false }) {
    if (archived) {
      await click(driver, '[aria-label="Filter players"] button:nth-child(2)')
      await driver.wait(until.elementLocated(By.css('.archived-badge')), 10_000)
    }
    await openStatistics(playerName)
    assert.equal(await driver.findElement(By.css('[data-testid="goal-count"]')).getText(), String(goals))
    assert.equal(await driver.findElement(By.css('[data-testid="assist-count"]')).getText(), String(assists))
    if (archived) assert.match(await driver.findElement(By.css('.archived-label')).getText(), /ARCHIVED PLAYER/)
  }

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)
    for (const playerName of [alexName, samName]) {
      await driver.findElement(By.id('create-player-name')).sendKeys(playerName)
      await click(driver, '.player-profile-form button[type="submit"]')
      await driver.wait(async () => driver.executeScript((name) =>
        [...document.querySelectorAll('.player-card')].some((card) => card.textContent.includes(name)), playerName), 10_000)
    }
    const playerIds = await driver.executeScript((names) => {
      const players = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}').players
      return Object.fromEntries(names.map((name) => [name, players.find((player) => player.name === name)?.id]))
    }, [alexName, samName])
    const alexId = playerIds[alexName]
    const samId = playerIds[samName]
    assert.ok(alexId && samId && alexId !== samId)

    await click(driver, '[data-nav="matches"]')
    await createMatchInPreparation(driver, homeTeam, awayTeam)
    await click(driver, '.squad-setup .primary-button')
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css(`[aria-label="Include ${alexName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Include ${samName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Select ${alexName} as a starter"]`)).click()
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await click(driver, '.jersey-editor .cancel-button')
    await waitForText(driver, '#match-heading', homeTeam)
    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await click(driver, `[aria-label="Record goal for ${homeTeam}"]`)
    await waitForText(driver, '[data-testid="home-score"]', '1')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await new Select(await driver.findElement(By.id('goal-scorer-player'))).selectByValue(alexId)
    await new Select(await driver.findElement(By.id('goal-assist-player'))).selectByValue(samId)
    const initialDetails = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.stalenessOf(initialDetails), 10_000)

    let saved = await readSavedMatch(driver, homeTeam, awayTeam)
    assert.equal(saved.recordVersion, 4)
    assert.equal(saved.goals.length, 1)
    assert.deepEqual(
      [saved.goals[0].scorerPlayerId, saved.goals[0].assistPlayerId],
      [alexId, samId],
      'Format 4 should persist the two selected stable identities on the single goal.',
    )

    await click(driver, '[data-nav="players"]')
    await assertTotals({ playerName: alexName, goals: 1, assists: 0 })
    await click(driver, '.back-link')
    await assertTotals({ playerName: samName, goals: 0, assists: 1 })
    await click(driver, '.back-link')

    await click(driver, `[aria-label="Edit profile for ${alexName}"]`)
    const renamedInput = driver.findElement(By.id(`edit-player-${alexId}-name`))
    await renamedInput.clear()
    await renamedInput.sendKeys('Alex Renamed')
    await click(driver, `[data-player-id="${alexId}"] .player-profile-form button[type="submit"]`)
    await driver.wait(until.elementLocated(By.css(`[aria-label="Archive Alex Renamed"]`)), 10_000)
    await click(driver, '[aria-label="Archive Alex Renamed"]')
    await driver.wait(async () => driver.executeScript((id) =>
      JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}').players
        .some((player) => player.id === id && player.name === 'Alex Renamed' && player.archived), alexId), 10_000)
    await assertTotals({ playerName: 'Alex Renamed', goals: 1, assists: 0, archived: true })
    await click(driver, '.back-link')
    await assertTotals({ playerName: samName, goals: 0, assists: 1 })
    await click(driver, '.back-link')

    await click(driver, '[data-nav="matches"]')
    await click(driver, `[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)
    await scrollMatchControlIntoReachableArea(driver, `[aria-label^="Edit details for ${homeTeam} goal"]`)
    await click(driver, `[aria-label^="Edit details for ${homeTeam} goal"]`)
    await new Select(await driver.findElement(By.id('goal-scorer-player'))).selectByValue(samId)
    await new Select(await driver.findElement(By.id('goal-assist-player'))).selectByValue('')
    await driver.executeScript(() => {
      const originalPut = IDBObjectStore.prototype.put
      let failNextWrite = true
      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args)
        if (failNextWrite) {
          failNextWrite = false
          request.addEventListener('success', () => this.transaction.abort(), { once: true })
        }
        return request
      }
    })
    await click(driver, '.save-goal-button')
    await driver.wait(until.elementLocated(By.css('.goal-editor .editor-error[role="alert"]')), 10_000)
    saved = await readSavedMatch(driver, homeTeam, awayTeam)
    assert.deepEqual(
      [saved.goals[0].scorerPlayerId, saved.goals[0].assistPlayerId],
      [alexId, samId],
      'A failed details save must not publish corrected goal credit.',
    )
    await click(driver, '.focused-editor__close')
    await driver.wait(async () => await driver.findElements(By.css('[role="dialog"]')).then((items) => items.length === 0), 10_000)
    await click(driver, '[data-nav="players"]')
    await assertTotals({ playerName: 'Alex Renamed', goals: 1, assists: 0, archived: true })
    await click(driver, '.back-link')
    await assertTotals({ playerName: samName, goals: 0, assists: 1 })
    await click(driver, '.back-link')

    await click(driver, '[data-nav="matches"]')
    await click(driver, `[aria-label="Open ${homeTeam} versus ${awayTeam}"]`)
    await scrollMatchControlIntoReachableArea(driver, `[aria-label^="Edit details for ${homeTeam} goal"]`)
    await click(driver, `[aria-label^="Edit details for ${homeTeam} goal"]`)
    await new Select(await driver.findElement(By.id('goal-scorer-player'))).selectByValue(samId)
    await new Select(await driver.findElement(By.id('goal-assist-player'))).selectByValue('')
    const correctedDetails = await driver.findElement(By.css('[role="dialog"]'))
    await click(driver, '.save-goal-button')
    await driver.wait(until.stalenessOf(correctedDetails), 10_000)
    saved = await readSavedMatch(driver, homeTeam, awayTeam)
    assert.equal(saved.recordVersion, 4)
    assert.equal(saved.goals.length, 1, 'Correcting attribution must not record a second goal.')
    assert.deepEqual(
      [saved.goals[0].scorerPlayerId, saved.goals[0].scorer, saved.goals[0].assistPlayerId, saved.goals[0].assist],
      [samId, samName, null, ''],
    )

    await click(driver, '[data-nav="players"]')
    await assertTotals({ playerName: 'Alex Renamed', goals: 0, assists: 0, archived: true })
    await click(driver, '.back-link')
    await assertTotals({ playerName: samName, goals: 1, assists: 0 })

    for (const viewport of [
      { width: 320, height: 700, rootSize: '20px', columns: 2 },
      { width: 390, height: 844, rootSize: '20px', columns: 2 },
      { width: 1280, height: 900, rootSize: '', columns: 4 },
    ]) {
      await openPlayersViewportFrame(driver, viewport.width, viewport.height)
      await driver.executeScript((name) => {
        [...document.querySelectorAll('button')]
          .find((button) => button.getAttribute('aria-label') === `View statistics for ${name}`)
          ?.click()
      }, samName)
      await waitForText(driver, '#player-statistics-heading', samName)
      const layout = await driver.executeScript((rootSize) => {
        document.documentElement.style.fontSize = rootSize
        const grid = document.querySelector('.statistics-summary')
        const cards = [...grid.querySelectorAll('.summary-card')]
        return {
          width: window.innerWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          labels: cards.map((card) => card.querySelector('.summary-label').textContent.trim()),
          metricsVisible: cards.every((card) => {
            const cardRect = card.getBoundingClientRect()
            const labelRect = card.querySelector('.summary-label').getBoundingClientRect()
            const valueRect = card.querySelector('strong').getBoundingClientRect()
            return cardRect.width > 0 && cardRect.left >= 0 && cardRect.right <= window.innerWidth + 1
              && labelRect.height > 0 && valueRect.height > 0
              && card.scrollWidth <= card.clientWidth + 1
          }),
          values: cards.map((card) => card.querySelector('strong').textContent.trim()),
        }
      }, viewport.rootSize)
      assert.equal(layout.width, viewport.width)
      assert.ok(!layout.overflow, `All player totals should fit at ${viewport.width}px.`)
      assert.equal(layout.columns, viewport.columns)
      assert.deepEqual(layout.labels, ['Playing time', 'Appearances', 'Goals', 'Assists'])
      assert.deepEqual(layout.values.slice(2), ['1', '0'])
      assert.ok(layout.metricsVisible, `All four summary metrics should remain readable: ${JSON.stringify(layout)}.`)
      await closeViewportFrame(driver)
    }

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    await assertTotals({ playerName: 'Alex Renamed', goals: 0, assists: 0, archived: true })
    await click(driver, '.back-link')
    await assertTotals({ playerName: samName, goals: 1, assists: 0 })
  } finally {
    await driver.quit()
  }
})

test('creates preparation, saves a squad, reopens full jerseys, and keeps back-forward drafts', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const alexName = 'Alexandria Morgan With An Exceptionally Long Match Day Name'
  const samName = 'Samantha Kerr With An Exceptionally Long Match Day Name'
  const players = [
    { id: 'preparation-alex', name: alexName, positions: [], jerseySize: 'M', archived: false, createdAt: 1, updatedAt: 1 },
    { id: 'preparation-sam', name: samName, positions: [], jerseySize: 'M', archived: false, createdAt: 2, updatedAt: 2 },
  ]
  const set = {
    id: 'preparation-blue-set',
    name: 'Blue sideline set',
    jerseys: [
      { id: 'preparation-shirt-seven', number: 7, size: 'M', ownerPlayerId: null },
      { id: 'preparation-shirt-nine', number: 9, size: 'M', ownerPlayerId: null },
    ],
    preferredNumbers: [],
    createdAt: 1,
    updatedAt: 1,
  }

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await driver.executeScript((playerRecords, jerseySets) => {
      localStorage.setItem('touchline.player-store', JSON.stringify({ version: 3, players: playerRecords }))
      localStorage.setItem('touchline.jersey-set-store', JSON.stringify({ version: 1, sets: jerseySets }))
    }, players, [set])
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)

    await createMatchInPreparation(driver, 'Preparation City', 'Optional Town')
    const createdMatch = await readSavedMatch(driver, 'Preparation City', 'Optional Town')
    assert.equal(createdMatch.clock.status, 'not-started')
    assert.equal(createdMatch.firstKickoffAt, null, 'Creating a match must not start kickoff.')
    assert.equal(createdMatch.participation, null)

    await click(driver, '.squad-setup .primary-button')
    await click(driver, '.squad-form button[type="submit"]')
    await waitForTextContaining(driver, '.squad-form .squad-error[role="alert"]', 'Choose whether your team is playing at home or away.')
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    await driver.findElement(By.css(`[aria-label="Include ${alexName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Include ${samName} in match squad"]`)).click()
    await driver.findElement(By.css(`[aria-label="Select ${alexName} as a starter"]`)).click()
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await waitForText(driver, '.step-save-feedback', 'Match squad saved.')
    assert.equal(await driver.executeScript(() => document.activeElement.id), 'preparation-heading',
      'Saving the squad and advancing should focus the next-step heading.')
    const squadSaveAnnouncements = await driver.executeScript(() => ({
      matches: [...document.querySelectorAll('[role="status"]')]
        .filter((region) => region.textContent.includes('Match squad saved.')).length,
      appFeedback: document.querySelectorAll('.app-save-feedback').length,
    }))
    assert.deepEqual(squadSaveAnnouncements, { matches: 1, appFeedback: 0 },
      'Preparation save feedback should be announced once without duplicate app feedback.')
    assert.equal(await driver.executeScript(() => document.querySelector('.squad-setup').getAttribute('aria-hidden')), 'true',
      'The inactive squad editor should be removed from the accessibility tree while reviewing jerseys.')
    assert.equal(await driver.findElements(By.css('.squad-setup [role="alert"]')).then((items) => items.length), 0)
    await new Select(await driver.findElement(By.id('jersey-assignment-set'))).selectByValue(set.id)
    await click(driver, '.generate-button')
    await driver.wait(async () => await driver.executeScript(() => {
      const values = ['#jersey-for-preparation-alex', '#jersey-for-preparation-sam']
        .map((selector) => document.querySelector(selector)?.value ?? '')
      return values.every(Boolean) && new Set(values).size === values.length
    }), 10_000, 'The complete two-player proposal should assign distinct jerseys.')
    const acceptedDraftValues = await driver.executeScript(() => [
      document.querySelector('#jersey-for-preparation-alex').value,
      document.querySelector('#jersey-for-preparation-sam').value,
    ])
    await click(driver, '.accept-button')
    await waitForText(driver, '#match-heading', 'Preparation City')
    const fullMatch = await readSavedMatch(driver, 'Preparation City', 'Optional Town')
    assert.equal(fullMatch.firstKickoffAt, null, 'Saving the squad and full jersey distribution must not start kickoff.')
    assert.equal(fullMatch.clock.status, 'not-started')
    assert.deepEqual(fullMatch.jerseyAssignment.rows.map(({ jersey }) => jersey?.jerseyId), acceptedDraftValues)

    for (const viewport of [
      { width: 320, height: 700, rootSize: '20px' },
      { width: 390, height: 360, rootSize: '20px' },
      { width: 844, height: 390, rootSize: '20px' },
      { width: 1280, height: 900, rootSize: '' },
    ]) {
      await openViewportFrame(driver, viewport.width, '[aria-label="Open Preparation City versus Optional Town"]', viewport.height)
      await openPreparationJerseys(driver)
      const draftLayout = await driver.executeScript((rootSize) => {
        document.documentElement.style.fontSize = rootSize
        const rows = [...document.querySelectorAll('.assignment-row')]
        const rowData = rows.map((row) => {
          const heading = row.querySelector('.assignment-player')
          const number = heading.querySelector('.assigned-number')?.textContent ?? ''
          const name = heading.querySelector('.assignment-player-name')?.textContent ?? ''
          return {
            text: heading.textContent.trim(),
            numberFirst: !number || heading.textContent.indexOf(number) < heading.textContent.indexOf(name),
            wrapsWithinRow: row.scrollWidth <= row.clientWidth + 1,
          }
        })
        const select = document.querySelector('.assignment-row select')
        const accept = document.querySelector('.accept-button')
        accept.scrollIntoView({ block: 'end' })
        const acceptRect = accept.getBoundingClientRect()
        return {
          width: window.innerWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          rows: rowData,
          selectHeight: select.getBoundingClientRect().height,
          acceptHeight: acceptRect.height,
          acceptReachable: acceptRect.top >= 0 && acceptRect.bottom <= window.innerHeight,
        }
      }, viewport.rootSize)
      assert.equal(draftLayout.width, viewport.width)
      assert.ok(!draftLayout.overflow, `Draft rows should not overflow at ${viewport.width}px.`)
      assert.ok(draftLayout.rows.every(({ numberFirst, wrapsWithinRow, text }) => numberFirst && wrapsWithinRow && text.length > 10),
        `Draft numbers and long player names should remain readable: ${JSON.stringify(draftLayout)}.`)
      assert.ok(draftLayout.selectHeight >= 48 && draftLayout.acceptHeight >= 48,
        'Jersey selection and accept controls should retain at least 48px targets.')
      assert.ok(draftLayout.acceptReachable, 'The jersey accept action should remain reachable in short viewports.')
      await closeViewportFrame(driver)
    }

    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open Preparation City versus Optional Town"]')
    await click(driver, '.prepare-match-button')
    await waitForText(driver, '#preparation-heading', 'Match squad')
    await click(driver, '.preparation-steps button[data-step="jerseys"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    assert.deepEqual(await driver.executeScript(() => [
      document.querySelector('#jersey-for-preparation-alex').value,
      document.querySelector('#jersey-for-preparation-sam').value,
    ]), acceptedDraftValues, 'Reopening preparation should restore the saved full distribution.')
    assert.equal(await driver.executeScript(() => document.querySelector('.squad-setup').getAttribute('aria-hidden')), 'true')
    assert.equal(await driver.findElements(By.css('.match-jersey-assignment .visually-hidden[role="status"]')).then((items) => items.length), 1,
      'The active jersey step should expose its announcement region.')

    await new Select(await driver.findElement(By.id('jersey-for-preparation-alex'))).selectByValue('')
    await click(driver, '.back-step')
    await waitForText(driver, '#preparation-heading', 'Match squad')
    assert.equal(await driver.executeScript(() => document.activeElement.id), 'preparation-heading',
      'Back navigation should focus the destination step heading.')
    assert.equal(await driver.executeScript(() => document.querySelector('.match-jersey-assignment').getAttribute('aria-hidden')), 'true')
    assert.equal(await driver.findElements(By.css('.match-jersey-assignment .visually-hidden[role="status"]')).then((items) => items.length), 0,
      'The inactive jersey step should not retain an announcement region.')
    await click(driver, '.preparation-steps button[data-step="jerseys"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    assert.equal(await driver.executeScript(() => document.activeElement.id), 'preparation-heading',
      'Forward navigation should focus the destination step heading.')
    assert.equal(await driver.findElement(By.id('jersey-for-preparation-alex')).getAttribute('value'), '',
      'Back/forward navigation should retain the unaccepted jersey draft.')
    assert.equal(await driver.findElement(By.id('jersey-for-preparation-sam')).getAttribute('value'), acceptedDraftValues[1])
    await click(driver, '.app-nav button[data-nav="matches"]')
    const discardDialog = await driver.wait(until.elementLocated(By.css('[role="dialog"][aria-label="Discard unsaved preparation changes?"]')), 10_000)
    assert.equal(await driver.executeScript(() => document.activeElement.className), 'focused-editor__close',
      'Opening discard confirmation should move focus into the modal.')
    await click(driver, '.keep-editing')
    await driver.wait(until.stalenessOf(discardDialog), 10_000)
    assert.equal(await driver.executeScript(() => document.activeElement?.getAttribute('data-nav')), 'matches',
      'Canceling discard confirmation should restore focus to the navigation request.')
    await click(driver, '.accept-button')
    await waitForText(driver, '#match-heading', 'Preparation City')
    assert.equal(await driver.executeScript(() => document.activeElement.id), 'match-heading',
      'Finishing preparation should focus the Match heading.')

    const partialMatch = await readSavedMatch(driver, 'Preparation City', 'Optional Town')
    assert.equal(partialMatch.firstKickoffAt, null)
    assert.equal(partialMatch.clock.status, 'not-started')
    assert.deepEqual(partialMatch.jerseyAssignment.rows.map(({ jersey }) => jersey?.jerseyId ?? null), [null, acceptedDraftValues[1]])
    await waitForTextContaining(driver, '.preparation-summary', 'Saved · Blue sideline set · 1 of 2 assigned')
    await click(driver, '.accepted-snapshots summary')
    const preparedSnapshotHeading = await driver.executeScript(() => {
      const heading = [...document.querySelectorAll('.snapshot-player')]
        .find((candidate) => candidate.querySelector('.assigned-number'))
      const number = heading.querySelector('.assigned-number').textContent
      const name = heading.querySelector('span:last-child').textContent
      return {
        text: heading.textContent.trim(),
        numberBeforeName: heading.textContent.indexOf(number) < heading.textContent.indexOf(name),
      }
    })
    assert.ok(preparedSnapshotHeading.numberBeforeName, `Saved preparation should lead with the jersey number: ${preparedSnapshotHeading.text}.`)
    assert.ok((await driver.findElement(By.css('.accepted-snapshots')).getText()).includes('Size M'))
    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    const kickedOffMatch = await readSavedMatch(driver, 'Preparation City', 'Optional Town')
    assert.ok(kickedOffMatch.firstKickoffAt > 0, 'Kickoff should be recorded only after explicitly starting the clock.')
    const acceptedNumber = kickedOffMatch.jerseyAssignment.rows[1].jersey.number
    for (const viewport of [
      { width: 320, height: 700, rootSize: '20px' },
      { width: 390, height: 360, rootSize: '20px' },
      { width: 844, height: 390, rootSize: '20px' },
      { width: 1280, height: 900, rootSize: '' },
    ]) {
      await openViewportFrame(driver, viewport.width, '[aria-label="Open Preparation City versus Optional Town"]', viewport.height)
      await driver.executeScript(() => document.querySelector('#player-times-tab')?.click())
      await driver.wait(async () => await driver.findElement(By.id('player-times-tab')).getAttribute('aria-selected') === 'true', 10_000)
      assert.equal(await driver.findElements(By.css('.jersey-summary')).then((items) => items.length), 0,
        'Player times should not repeat the accepted distribution as a second roster.')
      const lineupLayout = await driver.executeScript((rootSize) => {
        document.documentElement.style.fontSize = rootSize
        window.scrollTo(0, document.documentElement.scrollHeight)
        const rows = [...document.querySelectorAll('.lineup-player')]
        const sam = document.querySelector('[data-player-id="preparation-sam"] .player-name')
        const samNumber = sam.querySelector('.jersey-number')?.textContent ?? ''
        const samName = sam.querySelector('.player-name-label')?.textContent ?? ''
        const finalRow = rows.at(-1).getBoundingClientRect()
        const actions = document.querySelector('.match-action-area').getBoundingClientRect()
        return {
          width: window.innerWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          rowCount: rows.length,
          rowHeights: rows.map((row) => row.getBoundingClientRect().height),
          samNumber,
          numberFirst: sam.textContent.indexOf(samNumber) < sam.textContent.indexOf(samName),
          alexUnassigned: document.querySelector('[data-player-id="preparation-alex"] .unassigned-jersey')?.textContent.trim(),
          finalRowReachable: finalRow.bottom <= actions.top + 1,
          containsKitLogistics: /Size M|Owned by|Blue sideline set/.test(document.querySelector('.match-lineup').textContent),
        }
      }, viewport.rootSize)
      assert.equal(lineupLayout.width, viewport.width)
      assert.ok(!lineupLayout.overflow, `Number-first lineup should not overflow at ${viewport.width}px.`)
      assert.equal(lineupLayout.samNumber, `#${acceptedNumber}`)
      assert.ok(lineupLayout.numberFirst, `The accepted number should precede its player name: ${JSON.stringify(lineupLayout)}.`)
      assert.equal(lineupLayout.alexUnassigned, 'No jersey assigned', 'Partial distributions should label only explicitly unassigned rows.')
      assert.ok(lineupLayout.rowHeights.every((height) => height >= 48), 'Lineup rows should retain 48px minimum height.')
      assert.ok(lineupLayout.finalRowReachable, 'The last lineup row should be reachable above the recording action bar.')
      assert.ok(!lineupLayout.containsKitLogistics, 'Jersey sizes, ownership, and the duplicate kit roster belong in preparation only.')
      await closeViewportFrame(driver)
    }
  } finally {
    await driver.quit()
  }
})

test('tracks a squad through repeated and half-time exchanges, then restores its lineup and time', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()

  async function reopenMatch() {
    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '#match-heading', 'North City')
  }

  async function recordExchange(outgoingName, incomingName, outgoingId, incomingId, sourcePanel = 'events', atHalfTime = false) {
    if (sourcePanel === 'player-times') await click(driver, '#player-times-tab')
    await click(driver, '[data-action="start-substitution"]')
    const dialog = await driver.wait(until.elementLocated(By.css('[role="dialog"][aria-label="Make a substitution"]')), 10_000)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowForm = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      columns: getComputedStyle(document.querySelector('.exchange-fields')).gridTemplateColumns.split(' ').length,
      dialogHeight: document.querySelector('.focused-editor').getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }))
    assert.ok(narrowForm.width <= 520, `Expected a narrow substitution form, got ${narrowForm.width}px.`)
    assert.ok(!narrowForm.overflow, 'The substitution form should not overflow horizontally on a narrow screen.')
    assert.equal(narrowForm.columns, 1, 'OFF/ON selections should stack on a narrow screen.')
    assert.ok(narrowForm.dialogHeight <= narrowForm.viewportHeight, 'The focused substitution editor should fit the phone viewport.')
    const capturedTime = await driver.findElement(By.css('.captured-time')).getText()
    assert.match(await driver.findElement(By.css('.player-choice-group:first-child legend')).getText(), /Player off.*on the pitch/i)
    assert.match(await driver.findElement(By.css('.player-choice-group:last-child legend')).getText(), /Player on.*on the bench/i)
    const outgoing = driver.findElement(By.css(`[name="outgoingPlayer"][value="${outgoingId}"]`))
    const incoming = driver.findElement(By.css(`[name="incomingPlayer"][value="${incomingId}"]`))
    assert.equal(await outgoing.getAccessibleName(), outgoingName)
    assert.equal(await incoming.getAccessibleName(), incomingName)
    await outgoing.click()
    assert.equal(await driver.executeScript(() => document.activeElement?.getAttribute('name')), 'outgoingPlayer')
    await incoming.click()
    assert.equal(await driver.findElement(By.css('.captured-time')).getText(), capturedTime, 'Player selection must not change the captured occurrence time.')
    if (atHalfTime) assert.match(capturedTime, /Half-time.*00:00/)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await click(driver, '.save-substitution-button')
    await driver.wait(until.stalenessOf(dialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="substitution"]')), 10_000)
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    assert.equal(await driver.findElement(By.css(sourcePanel === 'player-times' ? '#player-times-tab' : '#events-tab')).getAttribute('aria-selected'), 'true', 'Saving should return to the panel that opened Substitute.')
  }

  async function assertLineup(onPitchId, benchId) {
    await click(driver, '#player-times-tab')
    await driver.wait(until.elementLocated(By.css(`.lineup-group[aria-label="On the pitch"] [data-player-id="${onPitchId}"]`)), 10_000)
    await driver.wait(until.elementLocated(By.css(`.lineup-group[aria-label="On the bench"] [data-player-id="${benchId}"]`)), 10_000)
    assert.ok(await driver.findElement(By.css(`.lineup-group[aria-label="On the pitch"] [data-player-id="${onPitchId}"]`)).isDisplayed())
    assert.ok(await driver.findElement(By.css(`.lineup-group[aria-label="On the bench"] [data-player-id="${benchId}"]`)).isDisplayed())
  }

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await driver.executeScript(() => {
      const activeIntervals = new Set()
      const nativeSetInterval = window.setInterval.bind(window)
      const nativeClearInterval = window.clearInterval.bind(window)
      window.__activeAppIntervals = activeIntervals
      window.setInterval = (callback, delay, ...args) => {
        const id = nativeSetInterval(callback, delay, ...args)
        activeIntervals.add(id)
        return id
      }
      window.clearInterval = (id) => {
        activeIntervals.delete(id)
        nativeClearInterval(id)
      }
    })

    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)
    const longPlayerName = 'Alexandria Morgan With An Extraordinarily Long Name'
    await driver.findElement(By.id('create-player-name')).sendKeys(longPlayerName)
    await driver.findElement(By.id('create-player-jersey-size')).sendKeys('  S/M  ')
    for (const position of ['TW', 'IV', 'LV', 'RV', 'DM', 'ZM', 'OM', 'LM', 'RM', 'LA', 'RA', 'ST']) {
      await driver.findElement(By.id(`create-player-position-${position}`)).click()
    }
    await click(driver, '.player-profile-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(@class,"player-card") and contains(.,"${longPlayerName}")]`)), 10_000)

    for (const playerName of ['Alex Morgan', 'Sam Kerr']) {
      const creationName = driver.findElement(By.id('create-player-name'))
      await creationName.sendKeys(playerName)
      if (playerName === 'Alex Morgan') {
        await creationName.sendKeys(Key.TAB)
        await driver.findElement(By.id('create-player-position-TW')).sendKeys(Key.TAB)
        const keyboardPosition = driver.findElement(By.id('create-player-position-IV'))
        await keyboardPosition.sendKeys(Key.SPACE)
        assert.ok(await keyboardPosition.isSelected(), 'A profile position checkbox should toggle with Space.')
        const focusState = await driver.executeScript(() => ({
          focused: document.activeElement?.id === 'create-player-position-IV',
          visible: document.activeElement?.matches(':focus-visible') ?? false,
          outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
        }))
        assert.ok(focusState.focused && focusState.visible && focusState.outlineWidth !== '0px', `Keyboard checkbox focus should remain visible: ${JSON.stringify(focusState)}.`)
        await driver.findElement(By.id('create-player-position-DM')).click()
      }
      await click(driver, '.player-profile-form button[type="submit"]')
      await driver.wait(until.elementLocated(By.css(`[data-testid="player-card"] strong`)), 10_000)
      await driver.wait(until.elementLocated(By.xpath(`//*[contains(@class,"player-card") and contains(.,"${playerName}")]`)), 10_000)
    }
    const playerIds = await driver.executeScript(() => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return Object.fromEntries(envelope.players.map((player) => [player.name, player.id]))
    })
    const alexId = playerIds['Alex Morgan']
    const samId = playerIds['Sam Kerr']
    const longPlayerId = playerIds[longPlayerName]
    assert.ok(alexId)
    assert.ok(samId)
    assert.ok(longPlayerId)
    assert.equal(await driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.find((player) => player.id === id)?.jerseySize
    }, longPlayerId), 'S/M')

    await openPlayersViewportFrame(driver, 320, 380)
    const narrowChoices = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      choiceHeight: Math.min(...[...document.querySelectorAll('.position-choice')]
        .map((choice) => choice.getBoundingClientRect().height)),
    }))
    assert.equal(narrowChoices.width, 320)
    assert.ok(!narrowChoices.overflow, 'The profile form should not overflow horizontally at 320px.')
    assert.ok(narrowChoices.choiceHeight >= 44, 'Position rows should have touch-friendly 44px hit areas.')
    const narrowDirectory = await driver.executeScript((name) => {
      const card = [...document.querySelectorAll('.player-card')]
        .find((candidate) => candidate.textContent.includes(name))
      const archive = card.querySelector('button[aria-label^="Archive"]')
      archive.scrollIntoView({ block: 'end' })
      const cardBox = card.getBoundingClientRect()
      const actionBox = archive.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        badges: card.querySelectorAll('.player-position-badge').length,
        cardWidth: cardBox.width,
        cardScrollWidth: card.scrollWidth,
        cardClientWidth: card.clientWidth,
        nameWrap: getComputedStyle(card.querySelector('.player-card-name strong')).overflowWrap,
        actionReachable: actionBox.top >= 0 && actionBox.bottom <= window.innerHeight,
      }
    }, longPlayerName)
    assert.ok(!narrowDirectory.overflow, 'The long name and all position badges should fit without horizontal overflow at 320px.')
    assert.equal(narrowDirectory.badges, 12)
    assert.ok(narrowDirectory.cardScrollWidth <= narrowDirectory.cardClientWidth + 1)
    assert.equal(narrowDirectory.nameWrap, 'anywhere')
    assert.ok(narrowDirectory.actionReachable, 'The archived card action should be reachable by vertical scrolling in a reduced-height viewport.')

    await click(driver, `[aria-label="Edit profile for ${longPlayerName}"]`)
    const narrowEditor = await driver.executeScript((id) => {
      const form = document.querySelector(`[data-player-id="${id}"] .player-profile-form`)
      const controls = [...form.querySelectorAll('.profile-form-actions button')]
      for (const control of controls) control.scrollIntoView({ block: 'end' })
      return {
        focusedName: document.activeElement?.id === `edit-player-${id}-name`,
        sizeFieldPresent: form.querySelector(`#edit-player-${id}-jersey-size`) !== null,
        selectedCount: form.querySelectorAll('input[type="checkbox"]:checked').length,
        actionsReachable: controls.every((control) => {
          const rect = control.getBoundingClientRect()
          return rect.top >= -1 && rect.bottom <= window.innerHeight + 1
        }),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }
    }, longPlayerId)
    assert.ok(narrowEditor.focusedName, 'Opening the editor should focus its name field at 320px.')
    assert.ok(narrowEditor.sizeFieldPresent, 'The player profile editor should include the optional size field.')
    assert.equal(narrowEditor.selectedCount, 12)
    assert.ok(narrowEditor.actionsReachable, 'Save and cancel should be reachable in a reduced-height viewport.')
    assert.ok(!narrowEditor.overflow, 'The expanded all-position editor should not overflow at 320px.')
    await driver.findElement(By.id(`edit-player-${longPlayerId}-name`)).sendKeys(' draft')
    await driver.findElement(By.id(`edit-player-${longPlayerId}-jersey-size`)).clear()
    await driver.findElement(By.id(`edit-player-${longPlayerId}-jersey-size`)).sendKeys('L')
    await driver.findElement(By.id(`edit-player-${longPlayerId}-position-ST`)).click()
    await click(driver, `[data-player-id="${longPlayerId}"] .cancel-button`)
    const cancelledNarrowEdit = await driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.find((player) => player.id === id)
    }, longPlayerId)
    assert.equal(cancelledNarrowEdit.name, longPlayerName)
    assert.equal(cancelledNarrowEdit.positions.length, 12)
    assert.equal(cancelledNarrowEdit.jerseySize, 'S/M')

    await click(driver, `[aria-label="Edit profile for ${longPlayerName}"]`)
    await driver.findElement(By.id(`edit-player-${longPlayerId}-jersey-size`)).clear()
    await driver.findElement(By.id(`edit-player-${longPlayerId}-jersey-size`)).sendKeys('164')
    await driver.findElement(By.id(`edit-player-${longPlayerId}-position-TW`)).click()
    await click(driver, `[data-player-id="${longPlayerId}"] .player-profile-form button[type="submit"]`)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.positions.length === 11
        && player.jerseySize === '164'
        && !player.positions.includes('TW'))
    }, longPlayerId), 10_000, 'Expected the narrow-screen profile save to update its selection.')
    assert.equal(await driver.findElements(By.css(`[data-player-id="${longPlayerId}"] .player-position-badge`)).then((items) => items.length), 11)
    await closeViewportFrame(driver)

    await openPlayersViewportFrame(driver, 390, 844)
    const enlargedPhoneLayout = await driver.executeScript((id) => {
      document.documentElement.style.fontSize = '20px'
      const card = document.querySelector(`[data-player-id="${id}"]`)
      return {
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        badgeCount: card.querySelectorAll('.player-position-badge').length,
        cardWidth: card.getBoundingClientRect().width,
        cardScrollWidth: card.scrollWidth,
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
      }
    }, longPlayerId)
    assert.equal(enlargedPhoneLayout.width, 390)
    assert.equal(enlargedPhoneLayout.rootFontSize, '20px')
    assert.equal(enlargedPhoneLayout.badgeCount, 11)
    assert.ok(!enlargedPhoneLayout.overflow && enlargedPhoneLayout.cardScrollWidth <= enlargedPhoneLayout.cardWidth + 1,
      'The saved profile should wrap without overflow at 390px with enlarged text.')
    await closeViewportFrame(driver)

    await openPlayersViewportFrame(driver, 1280, 900)
    const desktopDirectory = await driver.executeScript((id) => {
      const groups = document.querySelector('.position-groups')
      const card = document.querySelector(`[data-player-id="${id}"]`)
      return {
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        groupColumns: getComputedStyle(groups).gridTemplateColumns.split(' ').length,
        badgeCount: card.querySelectorAll('.player-position-badge').length,
      }
    }, longPlayerId)
    assert.equal(desktopDirectory.width, 1280)
    assert.ok(!desktopDirectory.overflow, 'The desktop player directory should not overflow horizontally.')
    assert.equal(desktopDirectory.groupColumns, 2)
    assert.equal(desktopDirectory.badgeCount, 11)
    await closeViewportFrame(driver)

    await click(driver, '[data-nav="jersey-sets"]')
    await driver.wait(until.elementLocated(By.id('create-jersey-set-button')), 10_000)
    const longSetName = 'Home Kit For Players With A Longer Sideline Name'
    await click(driver, '#create-jersey-set-button')
    await driver.findElement(By.id('create-jersey-set-name')).sendKeys(longSetName)
    await click(driver, '.jersey-set-form button[type="submit"]')
    await driver.wait(async () => driver.executeScript(() => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store') ?? '{"sets":[]}')
      return inventory.sets.length === 1
    }), 10_000)
    const homeSetId = await driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].id)

    await click(driver, `#add-jersey-${homeSetId}`)
    await driver.findElement(By.id(`create-jersey-${homeSetId}-number`)).sendKeys('7')
    await driver.findElement(By.id(`create-jersey-${homeSetId}-size`)).sendKeys('M')
    await click(driver, '.jersey-form button[type="submit"]')
    await driver.wait(async () => driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.length === 1), 10_000)
    const teamJerseyId = await driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys[0].id)

    await click(driver, `#add-jersey-${homeSetId}`)
    await driver.findElement(By.id(`create-jersey-${homeSetId}-number`)).sendKeys('7')
    await driver.findElement(By.id(`create-jersey-${homeSetId}-size`)).sendKeys('M')
    await driver.findElement(By.id(`create-jersey-${homeSetId}-owner`)).sendKeys(longPlayerName)
    await click(driver, '.jersey-form button[type="submit"]')
    await driver.wait(async () => driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.length === 2), 10_000)
    const privateJerseyId = await driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys[1].id)
    const savedPrivateJersey = await driver.executeScript((id) =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.find((jersey) => jersey.id === id), privateJerseyId)
    assert.equal(savedPrivateJersey.ownerPlayerId, longPlayerId)
    assert.ok((await driver.findElement(By.css(`[data-jersey-id="${privateJerseyId}"]`)).getText()).includes(longPlayerName))

    await click(driver, `#edit-jersey-${privateJerseyId}`)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-jersey-${id}-number`, privateJerseyId), 10_000)
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-number`)).clear()
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-number`)).sendKeys('12')
    await click(driver, `[data-jersey-id="${privateJerseyId}"] .jersey-form .cancel-button`)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-jersey-${id}`, privateJerseyId), 10_000)
    const cancelledJersey = await driver.executeScript((id) =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.find((jersey) => jersey.id === id), privateJerseyId)
    assert.equal(cancelledJersey.number, 7, 'Cancel should discard an inventory item draft.')

    await click(driver, `#edit-jersey-${privateJerseyId}`)
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-number`)).clear()
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-number`)).sendKeys('10')
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-size`)).clear()
    await driver.findElement(By.id(`edit-jersey-${privateJerseyId}-size`)).sendKeys('S/M')
    await click(driver, `[data-jersey-id="${privateJerseyId}"] .jersey-form button[type="submit"]`)
    await driver.wait(async () => driver.executeScript((id, ownerId) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      const jersey = inventory.sets[0].jerseys.find((item) => item.id === id)
      return jersey?.number === 10 && jersey?.size === 'S/M' && jersey?.ownerPlayerId === ownerId
    }, privateJerseyId, longPlayerId), 10_000, 'Expected the edited private jersey values to be committed.')
    const savedEditedJersey = await driver.executeScript((id) =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.find((jersey) => jersey.id === id), privateJerseyId)
    assert.deepEqual(
      { number: savedEditedJersey.number, size: savedEditedJersey.size, ownerPlayerId: savedEditedJersey.ownerPlayerId },
      { number: 10, size: 'S/M', ownerPlayerId: longPlayerId },
    )
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-jersey-${id}`, privateJerseyId), 10_000)

    await click(driver, '[data-nav="jersey-sets"]')
    const longSetNameWrap = await driver.executeScript((id) => {
      const setName = document.querySelector(`[data-set-id="${id}"] .set-select strong`)
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        wrap: getComputedStyle(setName).overflowWrap,
      }
    }, homeSetId)
    assert.ok(!longSetNameWrap.overflow)
    assert.equal(longSetNameWrap.wrap, 'anywhere')

    await openJerseySetsViewportFrame(driver, 320, 360)
    const narrowInventory = await driver.executeScript((setId, jerseyId, ownerName) => {
      const navButtons = [...document.querySelectorAll('.app-nav button')]
      const row = document.querySelector(`[data-jersey-id="${jerseyId}"]`)
      return {
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        navCount: navButtons.length,
        navTargets: navButtons.map((button) => button.getBoundingClientRect().height),
        setVisible: document.querySelector(`[data-set-id="${setId}"]`) !== null,
        ownerVisible: row.textContent.includes(ownerName),
        setNameWrap: getComputedStyle(document.querySelector(`[data-set-id="${setId}"] .set-select strong`)).overflowWrap,
        ownerWrap: getComputedStyle(row.querySelector('.jersey-row-copy span')).overflowWrap,
      }
    }, homeSetId, privateJerseyId, longPlayerName)
    assert.equal(narrowInventory.width, 320)
    assert.ok(!narrowInventory.overflow, 'The inventory and three-entry navigation should fit at 320px.')
    assert.equal(narrowInventory.navCount, 3)
    assert.ok(narrowInventory.navTargets.every((height) => height >= 44), 'Each navigation entry should retain a 44px touch target.')
    assert.ok(narrowInventory.setVisible && narrowInventory.ownerVisible)
    assert.equal(narrowInventory.setNameWrap, 'anywhere')
    assert.equal(narrowInventory.ownerWrap, 'anywhere')

    await click(driver, `#add-jersey-${homeSetId}`)
    const keyboardHeightReachability = await driver.executeScript((setId) => {
      const form = document.querySelector('.jersey-form')
      const controls = [...form.querySelectorAll('input, select, button')]
      const heights = controls.map((control) => control.getBoundingClientRect().height)
      let reachable = true
      for (const control of controls) {
        control.scrollIntoView({ block: 'end' })
        const rect = control.getBoundingClientRect()
        if (rect.top < -1 || rect.bottom > window.innerHeight + 1) reachable = false
      }
      return {
        focusedNumber: document.activeElement?.id === `create-jersey-${setId}-number`,
        reachable,
        controlHeights: heights,
      }
    }, homeSetId)
    assert.ok(keyboardHeightReachability.focusedNumber)
    assert.ok(keyboardHeightReachability.reachable, 'All inventory form controls should remain reachable above the reduced keyboard-height viewport.')
    assert.ok(keyboardHeightReachability.controlHeights.every((height) => height >= 44))
    await click(driver, `.jersey-form .cancel-button`)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `add-jersey-${id}`, homeSetId), 10_000)
    await closeViewportFrame(driver)

    await openJerseySetsViewportFrame(driver, 390, 844)
    const enlargedInventory = await driver.executeScript((setId, jerseyId, playerName) => {
      document.documentElement.style.fontSize = '20px'
      const item = document.querySelector(`[data-jersey-id="${jerseyId}"]`)
      return {
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        fontSize: getComputedStyle(document.documentElement).fontSize,
        labelPresent: document.querySelector(`[data-set-id="${setId}"]`).textContent.includes('Home Kit'),
        ownerPresent: item.textContent.includes(playerName),
        itemWidth: item.scrollWidth,
        itemClientWidth: item.clientWidth,
      }
    }, homeSetId, privateJerseyId, longPlayerName)
    assert.equal(enlargedInventory.width, 390)
    assert.equal(enlargedInventory.fontSize, '20px')
    assert.ok(!enlargedInventory.overflow && enlargedInventory.itemWidth <= enlargedInventory.itemClientWidth + 1,
      'Long set and owner names should wrap with enlarged text at 390px.')
    assert.ok(enlargedInventory.labelPresent && enlargedInventory.ownerPresent)
    await closeViewportFrame(driver)

    await openJerseySetsViewportFrame(driver, 1280, 900)
    const desktopInventory = await driver.executeScript((setId, jerseyId) => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      columns: getComputedStyle(document.querySelector('.inventory-columns')).gridTemplateColumns.split(' ').length,
      selected: document.querySelector(`[data-set-id="${setId}"] .set-select`).getAttribute('aria-pressed'),
      itemVisible: document.querySelector(`[data-jersey-id="${jerseyId}"]`) !== null,
    }), homeSetId, privateJerseyId)
    assert.equal(desktopInventory.width, 1280)
    assert.ok(!desktopInventory.overflow)
    assert.equal(desktopInventory.columns, 2)
    assert.equal(desktopInventory.selected, 'true')
    assert.ok(desktopInventory.itemVisible)
    await closeViewportFrame(driver)

    await click(driver, `[data-jersey-id="${teamJerseyId}"] button[aria-label^="Remove"]`)
    await driver.wait(async () => driver.executeScript((id) =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets[0].jerseys.every((jersey) => jersey.id !== id), teamJerseyId), 10_000)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-jersey-${id}`, privateJerseyId), 10_000)

    await click(driver, `#remove-jersey-set-${homeSetId}`)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `confirm-remove-jersey-set-${id}`, homeSetId), 10_000)
    await click(driver, '.set-removal-confirm .cancel-button')
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `remove-jersey-set-${id}`, homeSetId), 10_000)
    await click(driver, `#remove-jersey-set-${homeSetId}`)
    await click(driver, `#confirm-remove-jersey-set-${homeSetId}`)
    await driver.wait(async () => driver.executeScript(() =>
      JSON.parse(localStorage.getItem('touchline.jersey-set-store')).sets.length === 0), 10_000)
    await driver.wait(async () => driver.executeScript(() => document.activeElement?.id === 'create-jersey-set-button'), 10_000)

    await click(driver, '[data-nav="matches"]')
    await createMatchInPreparation(driver, 'North City', 'South Town')
    assert.ok(await driver.findElement(By.css('.squad-setup')).isDisplayed())
    await click(driver, '.squad-setup button.primary-button')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowSquadForm = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      widthPx: document.querySelector('.squad-form').getBoundingClientRect().width,
      sideTargetHeights: [...document.querySelectorAll('.side-choice label')].map((label) => label.getBoundingClientRect().height),
      playerTargetHeights: [...document.querySelectorAll('.player-choice')].map((choice) => choice.getBoundingClientRect().height),
      actionHeights: [...document.querySelectorAll('.squad-form-actions button')].map((button) => button.getBoundingClientRect().height),
      labelFontSizes: [...document.querySelectorAll('.side-choice label, .squad-player-label, .starter-choice')]
        .map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
    }))
    assert.ok(narrowSquadForm.width <= 520, `Expected a narrow squad form, got ${narrowSquadForm.width}px.`)
    assert.ok(!narrowSquadForm.overflow, 'The squad form should not overflow horizontally on a narrow screen.')
    assert.ok(narrowSquadForm.sideTargetHeights.every((height) => height >= 48), 'Side labels should have 48px touch targets.')
    assert.ok(narrowSquadForm.playerTargetHeights.every((height) => height >= 48), 'Squad rows should have 48px touch targets.')
    assert.ok(narrowSquadForm.actionHeights.every((height) => height >= 48), 'Squad actions should have 48px touch targets.')
    assert.ok(narrowSquadForm.labelFontSizes.every((size) => size >= 14), 'Squad and side labels should remain readable on phones.')
    const homeSide = driver.findElement(By.css('[name="own-side"][value="home"]'))
    assert.match(await homeSide.getAccessibleName(), /Home.*North City/)
    const alexSelection = driver.findElement(By.css('[aria-label="Include Alex Morgan in match squad"]'))
    assert.equal(await alexSelection.getAccessibleName(), 'Include Alex Morgan in match squad')
    await alexSelection.sendKeys(Key.SPACE)
    assert.ok(await alexSelection.isSelected(), 'The squad checkbox should respond to keyboard activation.')
    const squadKeyboardFocus = await driver.executeScript(() => ({
      focused: document.activeElement?.getAttribute('aria-label') === 'Include Alex Morgan in match squad',
      focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
      outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
    }))
    assert.ok(squadKeyboardFocus.focused && squadKeyboardFocus.outlineWidth !== '0px',
      `Squad choices should retain visible keyboard focus: ${JSON.stringify(squadKeyboardFocus)}.`)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    // Alex was selected by keyboard above; keep that choice and add the bench player.
    await driver.findElement(By.css('[aria-label="Include Sam Kerr in match squad"]')).click()
    await driver.findElement(By.css('[aria-label="Select Alex Morgan as a starter"]')).click()
    await driver.executeScript(() => {
      const submit = document.querySelector('.squad-form button[type="submit"]')
      submit.scrollIntoView({ block: 'center' })
    })
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await waitForText(driver, '.step-save-feedback', 'Match squad saved.')
    assert.ok(await driver.findElement(By.css('.jersey-editor .cancel-button')).getText().then((text) => /Skip jerseys/.test(text)))
    const unstartedTrackedMatch = await readSavedMatch(driver)
    assert.ok(unstartedTrackedMatch.participation, 'Saving the squad should commit tracking before kickoff.')
    assert.equal(unstartedTrackedMatch.jerseyAssignment, null)
    assert.equal(unstartedTrackedMatch.firstKickoffAt, null)
    await click(driver, '.jersey-editor .cancel-button')
    await waitForText(driver, '#match-heading', 'North City')
    assert.equal(await driver.findElements(By.css('.match-action-area .goal-button')).then((buttons) => buttons.length), 2)

    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    assert.equal(await driver.findElements(By.css('.squad-setup')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.saved-squad-summary')).then((items) => items.length), 0)
    assert.ok(await driver.executeScript(() => window.__activeAppIntervals.size > 0), 'Live Match display timers should be active while the match is open.')
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)
    await driver.wait(async () => await driver.executeScript(() => window.__activeAppIntervals.size === 0), 10_000)
    await click(driver, '[data-nav="matches"]')
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    assert.ok(await driver.executeScript(() => window.__activeAppIntervals.size > 0), 'Reopening a live Match should restore its display timers.')

    await setSavedClock(driver, { period: 1, elapsedMs: 18 * 60_000, status: 'paused' })
    await reopenMatch()
    await waitForText(driver, '.clock-status', 'CLOCK PAUSED')
    await recordExchange('Alex Morgan', 'Sam Kerr', alexId, samId)
    await assertLineup(samId, alexId)
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '18:00')
    await openViewportFrame(driver, 390, '[aria-label="Open North City versus South Town"]')
    await click(driver, '#player-times-tab')
    const playerRowReachability = await driver.executeScript(() => {
      document.documentElement.style.fontSize = '20px'
      window.scrollTo(0, document.documentElement.scrollHeight)
      const rows = document.querySelectorAll('.lineup-player')
      const finalRow = rows[rows.length - 1].getBoundingClientRect()
      const actions = document.querySelector('.match-action-area').getBoundingClientRect()
      return {
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rowCount: rows.length,
        finalRowBottom: finalRow.bottom,
        actionTop: actions.top,
      }
    })
    assert.equal(playerRowReachability.width, 390)
    assert.ok(!playerRowReachability.overflow, 'Enlarged Player times should fit without horizontal scrolling.')
    assert.ok(playerRowReachability.rowCount > 0)
    assert.ok(playerRowReachability.finalRowBottom <= playerRowReachability.actionTop + 1,
      'The final player row should be reachable above the expanded recording footer.')
    await closeViewportFrame(driver)
    await driver.executeScript(() => { document.documentElement.style.fontSize = '' })
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })

    await setSavedClock(driver, { period: 1, elapsedMs: 30 * 60_000, status: 'paused' })
    await reopenMatch()
    await recordExchange('Sam Kerr', 'Alex Morgan', samId, alexId, 'player-times')
    await assertLineup(alexId, samId)
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '18:00')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '12:00')

    await setSavedClock(driver, { period: 1, elapsedMs: 47 * 60_000, status: 'paused' })
    await reopenMatch()
    await click(driver, '.clock-actions .secondary-button')
    await waitForText(driver, '.clock-status', 'HALF TIME')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    await recordExchange('Alex Morgan', 'Sam Kerr', alexId, samId, 'events', true)
    await assertLineup(samId, alexId)
    await click(driver, '#events-tab')
    const substitutionTimes = await driver.findElements(By.css('.timeline-event[data-event-type="substitution"] .timeline-event-time'))
    assert.equal(await substitutionTimes[0].getText(), 'HT')
    await click(driver, '#player-times-tab')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '35:00')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '12:00')

    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-period', 'SECOND HALF')
    await setSavedClock(driver, { period: 2, elapsedMs: 10 * 60_000, status: 'paused' })
    await reopenMatch()
    await assertLineup(samId, alexId)
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '35:00')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '22:00')

    const savedMatch = await readSavedMatch(driver)
    assert.equal(savedMatch.completedPeriodElapsedMs[1], 47 * 60_000)
    assert.deepEqual(savedMatch.participation.substitutions.map((event) => [event.period, event.elapsedMs]), [
      [1, 18 * 60_000],
      [1, 30 * 60_000],
      [2, 0],
    ])
    assert.equal(savedMatch.goals.length, 0)

    const trackedReloadOrder = await driver.findElements(By.css('.timeline-event[data-event-type="substitution"]'))
    assert.equal(trackedReloadOrder.length, 3)
    await driver.navigate().refresh()
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await click(driver, '#player-times-tab')
    await waitForText(driver, `[data-player-id="${alexId}"] .player-time`, '35:00')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '22:00')
    assert.equal(await (await driver.findElements(By.css('.timeline-event[data-event-type="substitution"]'))).length, 3)

    await setSavedClock(driver, { period: 2, elapsedMs: 48 * 60_000, status: 'paused' })
    await reopenMatch()
    await click(driver, '.clock-actions .secondary-button')
    await waitForText(driver, '.clock-status', 'FULL TIME')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    assert.equal(await driver.findElements(By.css('[data-action="start-substitution"]')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.match-action-area .goal-button')).then((buttons) => buttons.length), 2)
    await click(driver, '#player-times-tab')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '35:00')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '60:00')

    const finishedMatch = await readSavedMatch(driver)
    assert.equal(finishedMatch.clock.status, 'full-time')
    assert.deepEqual(finishedMatch.completedPeriodElapsedMs, {
      1: 47 * 60_000,
      2: 48 * 60_000,
    })
    assert.equal(finishedMatch.participation.squad.find((player) => player.playerId === alexId).nameSnapshot, 'Alex Morgan')

    const halftimeExchangeId = finishedMatch.participation.substitutions[2].id
    await click(driver, '#events-tab')
    await click(driver, `.timeline-event[data-event-id="${halftimeExchangeId}"] .edit-event-button`)
    const fullTimeCorrection = await driver.findElement(By.css('[role="dialog"][aria-label="Correct substitution"]'))
    const correctedOccurrence = driver.findElement(By.css('[name="correction-time"]'))
    await correctedOccurrence.clear()
    await correctedOccurrence.sendKeys('00:01')
    await click(driver, '.save-correction-button')
    await driver.wait(until.stalenessOf(fullTimeCorrection), 10_000)
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    const correctedMatch = await readSavedMatch(driver)
    assert.equal(correctedMatch.participation.substitutions[2].elapsedMs, 1_000)

    await click(driver, '#player-times-tab')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '35:01')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${samId}"] .player-time`)).getText(), '59:59')

    await openViewportFrame(driver, 390, '[aria-label="Open North City versus South Town"]', 480)
    const correctionLauncherSelector = `.timeline-event[data-event-id="${halftimeExchangeId}"] .edit-event-button`
    await driver.executeScript((selector) => document.querySelector(selector)?.scrollIntoView({ block: 'center' }), correctionLauncherSelector)
    await click(driver, correctionLauncherSelector)
    await driver.wait(until.elementLocated(By.css('[role="dialog"][aria-label="Correct substitution"]')), 10_000)
    const correctionTimeField = driver.findElement(By.css('[name="correction-time"]'))
    await correctionTimeField.clear()
    await correctionTimeField.sendKeys('not a time')
    await click(driver, '.save-correction-button')
    await driver.wait(until.elementLocated(By.css('.correction-error[role="alert"]')), 10_000)
    const correctionErrorReachability = await driver.executeScript(() => {
      const dialog = document.querySelector('.focused-editor').getBoundingClientRect()
      const body = document.querySelector('.focused-editor__body')
      const bodyRect = body.getBoundingClientRect()
      const timeField = document.querySelector('[name="correction-time"]').getBoundingClientRect()
      body.scrollTop = body.scrollHeight
      const error = document.querySelector('.correction-error[role="alert"]').getBoundingClientRect()
      const actions = document.querySelector('.focused-editor__actions').getBoundingClientRect()
      const close = document.querySelector('.focused-editor__close').getBoundingClientRect()
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        dialogHeight: dialog.height,
        fieldInitiallyReachable: timeField.top >= bodyRect.top && timeField.bottom <= bodyRect.bottom,
        errorReachable: error.top >= bodyRect.top && error.bottom <= bodyRect.bottom,
        saveReachable: actions.top >= 0 && actions.bottom <= window.innerHeight,
        cancelReachable: document.querySelector('.cancel-correction-button').getBoundingClientRect().bottom <= window.innerHeight,
        closeReachable: close.top >= 0 && close.bottom <= window.innerHeight,
        actionPaddingBottom: Number.parseFloat(getComputedStyle(document.querySelector('.focused-editor__actions')).paddingBottom),
      }
    })
    assert.equal(correctionErrorReachability.width, 390)
    assert.equal(correctionErrorReachability.height, 480)
    assert.ok(correctionErrorReachability.dialogHeight <= correctionErrorReachability.height)
    assert.ok(correctionErrorReachability.fieldInitiallyReachable)
    assert.ok(correctionErrorReachability.errorReachable)
    assert.ok(correctionErrorReachability.saveReachable)
    assert.ok(correctionErrorReachability.cancelReachable)
    assert.ok(correctionErrorReachability.closeReachable)
    assert.ok(correctionErrorReachability.actionPaddingBottom >= 16)
    await click(driver, '.cancel-correction-button')
    await closeViewportFrame(driver)

    await click(driver, '[data-nav="players"]')
    await click(driver, `[aria-label="View statistics for Alex Morgan"]`)
    await waitForText(driver, '#player-statistics-heading', 'Alex Morgan')
    await waitForText(driver, '[data-testid="total-playing-time"]', '35:01')
    assert.equal(await driver.findElement(By.css('[data-testid="appearance-count"]')).getText(), '1')
    assert.equal(await driver.findElement(By.css('[data-testid="goal-count"]')).getText(), '0')
    assert.equal(await driver.findElement(By.css('[data-testid="assist-count"]')).getText(), '0')
    const alexBreakdown = driver.findElement(By.css('[data-match-id="' + finishedMatch.id + '"]'))
    assert.match(await alexBreakdown.getText(), /vs South Town/)
    assert.match(await alexBreakdown.getText(), /Full time/)
    assert.equal(await alexBreakdown.findElement(By.css('.breakdown-time')).getText(), '35:01')
    assert.equal(await driver.findElements(By.css('.live-contribution')).then((items) => items.length), 0)
    assert.match(await driver.findElement(By.css('.statistics-time-note')).getText(), /includes stoppage time/i)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowStatistics = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      summaryColumns: getComputedStyle(document.querySelector('.statistics-summary')).gridTemplateColumns.split(' ').length,
      breakdownWidth: document.querySelector('.breakdown-row').getBoundingClientRect().width,
    }))
    assert.ok(narrowStatistics.width <= 520, `Expected narrow statistics, got ${narrowStatistics.width}px.`)
    assert.ok(!narrowStatistics.overflow, 'Player statistics should not overflow horizontally on a narrow screen.')
    assert.equal(narrowStatistics.summaryColumns, 2, 'The four statistics should remain readable in a two-column phone grid.')
    assert.ok(narrowStatistics.breakdownWidth > 0)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.sleep(1_100)
    assert.equal(await driver.findElement(By.css('[data-testid="total-playing-time"]')).getText(), '35:01')

    await click(driver, '.back-link')
    await click(driver, '[aria-label="Edit profile for Alex Morgan"]')
    const alexPositionInput = (position) => driver.findElement(By.id(`edit-player-${alexId}-position-${position}`))
    assert.ok(await alexPositionInput('IV').isSelected())
    assert.ok(await alexPositionInput('DM').isSelected())
    assert.equal(await driver.executeScript(() => document.activeElement?.id), `edit-player-${alexId}-name`)
    await alexPositionInput('DM').click()
    await alexPositionInput('ST').click()
    const cancelDraftName = driver.findElement(By.id(`edit-player-${alexId}-name`))
    await cancelDraftName.clear()
    await cancelDraftName.sendKeys('Cancelled profile')
    await click(driver, `[data-player-id="${alexId}"] .cancel-button`)
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-profile-${id}`, alexId), 10_000)
    const cancelledProfile = await driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.find((player) => player.id === id)
    }, alexId)
    assert.equal(cancelledProfile.name, 'Alex Morgan')
    assert.deepEqual(cancelledProfile.positions, ['IV', 'DM'])

    await click(driver, '[aria-label="Edit profile for Alex Morgan"]')
    const renamedInput = driver.findElement(By.id(`edit-player-${alexId}-name`))
    await renamedInput.clear()
    await renamedInput.sendKeys('Alex Renamed')
    await alexPositionInput('ST').click()
    await click(driver, `[data-player-id="${alexId}"] .player-profile-form button[type="submit"]`)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.name === 'Alex Renamed'
        && JSON.stringify(player.positions) === JSON.stringify(['IV', 'DM', 'ST']))
    }, alexId), 10_000, 'Expected the profile name and positions to persist together.')
    await driver.wait(async () => driver.executeScript((id) => document.activeElement?.id === `edit-profile-${id}`, alexId), 10_000)
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(@class,"player-card") and contains(.,"Alex Renamed")]`)), 10_000)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.name === 'Alex Renamed')
    }, alexId), 10_000, 'Expected the directory rename to persist.')

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    const reloadedBadges = await driver.executeScript((id) => [...document.querySelectorAll(`[data-player-id="${id}"] .player-position-badge`)]
      .map((badge) => badge.textContent), alexId)
    assert.deepEqual(reloadedBadges, ['IV', 'DM', 'ST'], 'Saved positions should reload in catalogue order.')
    await click(driver, '[aria-label="Edit profile for Alex Renamed"]')
    for (const position of ['IV', 'DM', 'ST']) await alexPositionInput(position).click()
    await click(driver, `[data-player-id="${alexId}"] .player-profile-form button[type="submit"]`)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.positions.length === 0)
    }, alexId), 10_000, 'Expected clearing every saved position to persist.')
    assert.equal(await driver.findElements(By.css(`[data-player-id="${alexId}"] .player-position-summary`)).then((items) => items.length), 0)

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    assert.equal(await driver.findElements(By.css(`[data-player-id="${alexId}"] .player-position-badge`)).then((items) => items.length), 0)
    await click(driver, `[aria-label="Archive Alex Renamed"]`)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.archived)
    }, alexId), 10_000, 'Expected the player archive state to persist.')
    await click(driver, '[aria-label="Filter players"] button:nth-child(2)')
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${alexId}"] .archived-badge`)), 10_000)
    await click(driver, `[aria-label="View statistics for Alex Renamed"]`)
    await waitForText(driver, '[data-testid="total-playing-time"]', '35:01')
    assert.match(await driver.findElement(By.css('.archived-label')).getText(), /ARCHIVED PLAYER/)
    assert.equal(await driver.findElement(By.css(`[data-match-id="${finishedMatch.id}"] .breakdown-time`)).getText(), '35:01')

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    await click(driver, '[aria-label="Filter players"] button:nth-child(2)')
    await click(driver, `[aria-label="View statistics for Alex Renamed"]`)
    await waitForText(driver, '[data-testid="total-playing-time"]', '35:01')
    assert.equal(await driver.findElement(By.css('[data-testid="appearance-count"]')).getText(), '1')
    assert.equal(await driver.findElement(By.css(`[data-match-id="${finishedMatch.id}"] .breakdown-time`)).getText(), '35:01')

    await click(driver, `[data-match-id="${finishedMatch.id}"] .breakdown-match-link`)
    await waitForText(driver, '.clock-status', 'FULL TIME')
    await click(driver, '#player-times-tab')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${alexId}"] .player-time`)).getText(), '35:01')
    assert.match(await driver.findElement(By.css(`[data-player-id="${alexId}"]`)).getText(), /Alex Morgan/)
    assert.doesNotMatch(await driver.findElement(By.css(`[data-player-id="${alexId}"]`)).getText(), /Alex Renamed/)
  } finally {
    await driver.quit()
  }
})

test('saves and reloads independent preferred numbers across jersey sets, including offline retry and phone editing', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.id('create-player-name')), 10_000)

    const longPlayerName = 'Alexandria Morgan With An Extraordinarily Long Sideline Name'
    for (let index = 0; index < 2; index += 1) {
      await driver.findElement(By.id('create-player-name')).sendKeys(longPlayerName)
      await click(driver, '.player-profile-form button[type="submit"]')
      await driver.wait(async () => await driver.findElements(By.css('.player-card')).then((cards) => cards.length === index + 1), 10_000)
    }
    const playerIds = await driver.executeScript((name) => JSON.parse(localStorage.getItem('touchline.player-store'))
      .players.filter((player) => player.name === name).map((player) => player.id), longPlayerName)
    assert.equal(playerIds.length, 2, 'Equal player names should retain two stable identities.')
    const [firstPlayerId, secondPlayerId] = playerIds
    for (const id of playerIds) {
      const identityText = await driver.findElement(By.css(`[data-player-id="${id}"] .player-card-name strong`)).getText()
      assert.ok(identityText.startsWith(longPlayerName))
      assert.ok(identityText.includes('·'), 'Same-name players should have distinguishing identity labels.')
    }

    await click(driver, '[data-nav="jersey-sets"]')
    await driver.wait(until.elementLocated(By.id('create-jersey-set-button')), 10_000)
    const setNames = [
      'Home Kit For An Extraordinarily Long Sideline Label',
      'Away Kit For An Extraordinarily Long Sideline Label',
    ]
    const setIds = []
    for (const name of setNames) {
      await click(driver, '#create-jersey-set-button')
      await driver.findElement(By.id('create-jersey-set-name')).sendKeys(name)
      await click(driver, '.jersey-set-form button[type="submit"]')
      await driver.wait(async () => await driver.executeScript((setName) => {
        const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store') ?? '{"sets":[]}')
        return inventory.sets.some((set) => set.name === setName)
      }, name), 10_000)
      setIds.push(await driver.executeScript((setName) => JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
        .sets.find((set) => set.name === setName).id, name))
    }
    const [homeSetId, awaySetId] = setIds

    async function addOwnedJersey(setId, ownerId, number, size) {
      await click(driver, `[data-set-id="${setId}"] .set-select`)
      await click(driver, `#add-jersey-${setId}`)
      await driver.findElement(By.id(`create-jersey-${setId}-number`)).sendKeys(String(number))
      await driver.findElement(By.id(`create-jersey-${setId}-size`)).sendKeys(size)
      await driver.wait(async () => await driver.executeScript((id, setId) => {
        const owner = document.querySelector(`#create-jersey-${setId}-owner`)
        return owner && [...owner.options].some((option) => option.value === id)
      }, ownerId, setId), 10_000)
      await driver.executeScript((id, setId) => {
        const owner = document.querySelector(`#create-jersey-${setId}-owner`)
        owner.value = id
        owner.dispatchEvent(new Event('change', { bubbles: true }))
      }, ownerId, setId)
      await click(driver, '.jersey-form button[type="submit"]')
      await driver.wait(async () => await driver.executeScript((setId) => {
        const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
        return inventory.sets.find((set) => set.id === setId).jerseys.length === 1
      }, setId), 10_000)
    }

    await addOwnedJersey(homeSetId, firstPlayerId, 7, 'M')
    await addOwnedJersey(awaySetId, secondPlayerId, 12, 'S/M')
    const initialInventory = await driver.executeScript(() => JSON.parse(localStorage.getItem('touchline.jersey-set-store')))
    assert.deepEqual(initialInventory.sets.map((set) => set.jerseys[0].ownerPlayerId), [firstPlayerId, secondPlayerId])
    assert.deepEqual(initialInventory.sets.map((set) => [set.jerseys[0].number, set.jerseys[0].size]), [[7, 'M'], [12, 'S/M']])

    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] #edit-preferred-numbers-${firstPlayerId}`)), 10_000)
    const firstEditorLauncher = driver.findElement(By.id(`edit-preferred-numbers-${firstPlayerId}`))
    await firstEditorLauncher.sendKeys(Key.ENTER)
    await driver.wait(async () => await driver.executeScript((id, setId) => document.activeElement?.id === `preferred-player-${id}-${setId}`, firstPlayerId, homeSetId), 10_000)
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${homeSetId}`)).sendKeys('20')
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).sendKeys('0')
    await click(driver, `[data-player-id="${firstPlayerId}"] .preferred-number-form button[type="submit"]`)
    await driver.wait(async () => await driver.executeScript((id) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      return inventory.sets.every((set) => set.preferredNumbers.some((preference) => preference.playerId === id))
    }, firstPlayerId), 10_000)

    await driver.findElement(By.id(`edit-preferred-numbers-${secondPlayerId}`)).sendKeys(Key.ENTER)
    await driver.wait(async () => await driver.executeScript((id, setId) => document.activeElement?.id === `preferred-player-${id}-${setId}`, secondPlayerId, homeSetId), 10_000)
    await driver.findElement(By.id(`preferred-player-${secondPlayerId}-${homeSetId}`)).sendKeys('20')
    await click(driver, `[data-player-id="${secondPlayerId}"] .preferred-number-form button[type="submit"]`)
    await driver.wait(async () => await driver.executeScript((id) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      return inventory.sets[0].preferredNumbers.length === 2 && inventory.sets[0].preferredNumbers.every((preference) => preference.number === 20)
    }, secondPlayerId), 10_000)

    const initialPreferences = await driver.executeScript(() => JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      .sets.map((set) => ({ id: set.id, preferences: set.preferredNumbers })))
    assert.deepEqual(initialPreferences, [
      { id: homeSetId, preferences: [{ playerId: firstPlayerId, number: 20 }, { playerId: secondPlayerId, number: 20 }] },
      { id: awaySetId, preferences: [{ playerId: firstPlayerId, number: 0 }] },
    ])
    assert.ok((await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText()).includes('20'))
    assert.ok((await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText()).includes('0'))
    assert.ok((await driver.findElement(By.css(`[data-player-id="${secondPlayerId}"] .preferred-number-list`)).getText()).includes('20'))

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)), 10_000)
    const reloadedPlayerIds = await driver.executeScript((name) => JSON.parse(localStorage.getItem('touchline.player-store'))
      .players.filter((player) => player.name === name).map((player) => player.id), longPlayerName)
    assert.deepEqual(reloadedPlayerIds, playerIds, 'Reload should keep stable player identities.')
    assert.equal(await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText(),
      `${setNames[0]} 20\n${setNames[1]} 0`)

    const inventoryBeforeFailure = await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store'))
    await driver.executeScript(() => {
      const originalSetItem = Storage.prototype.setItem
      let failNextInventoryWrite = true
      Storage.prototype.setItem = function (key, value) {
        if (key === 'touchline.jersey-set-store' && failNextInventoryWrite) {
          failNextInventoryWrite = false
          throw new Error('Storage is full.')
        }
        return originalSetItem.call(this, key, value)
      }
    })
    await click(driver, `[data-player-id="${firstPlayerId}"] #edit-preferred-numbers-${firstPlayerId}`)
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${homeSetId}`)).clear()
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${homeSetId}`)).sendKeys('22')
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).clear()
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).sendKeys('16')
    await click(driver, `[data-player-id="${firstPlayerId}"] .preferred-number-form button[type="submit"]`)
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-form [role="alert"]`)), 10_000)
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.jersey-set-store')), inventoryBeforeFailure,
      'A failed multi-set preference save must not replace the committed inventory.')
    assert.equal(await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${homeSetId}`)).getAttribute('value'), '22')
    assert.equal(await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).getAttribute('value'), '16')
    const failedPreferenceForm = driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-form`))
    await click(driver, `[data-player-id="${firstPlayerId}"] .preferred-number-form button[type="submit"]`)
    await driver.wait(until.stalenessOf(failedPreferenceForm), 10_000)
    const retriedPreferences = await driver.executeScript((id) => JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      .sets.map((set) => set.preferredNumbers.find((preference) => preference.playerId === id)?.number), firstPlayerId)
    assert.deepEqual(retriedPreferences, [22, 16])

    await driver.navigate().refresh()
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)), 10_000)
    assert.ok((await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText()).includes('22'))
    assert.ok((await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText()).includes('16'))

    await driver.executeScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      window.fetch = () => Promise.reject(new Error('Network access is disabled for this loaded-page check.'))
      window.XMLHttpRequest = class {
        constructor() { throw new Error('Network access is disabled for this loaded-page check.') }
      }
    })
    await click(driver, `[data-player-id="${firstPlayerId}"] #edit-preferred-numbers-${firstPlayerId}`)
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).clear()
    await driver.findElement(By.id(`preferred-player-${firstPlayerId}-${awaySetId}`)).sendKeys('18')
    const offlinePreferenceForm = driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-form`))
    await click(driver, `[data-player-id="${firstPlayerId}"] .preferred-number-form button[type="submit"]`)
    await driver.wait(async () => await driver.executeScript((id, setId) => {
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      return inventory.sets.find((set) => set.id === setId).preferredNumbers
        .some((preference) => preference.playerId === id && preference.number === 18)
    }, firstPlayerId, awaySetId), 10_000)
    await driver.wait(until.stalenessOf(offlinePreferenceForm), 10_000)
    assert.equal(await driver.executeScript(() => navigator.onLine), false)
    assert.ok((await driver.findElement(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-list`)).getText()).includes('18'),
      'An already-loaded offline session should save and publish local preferred-number edits.')

    for (const width of [320, 390]) {
      await openPlayersViewportFrame(driver, width, 844)
      const phoneLayout = await driver.executeScript((id) => {
        const card = document.querySelector(`[data-player-id="${id}"]`)
        const summaries = [...card.querySelectorAll('.preferred-number-list li')]
        return {
          width: window.innerWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          identity: card.querySelector('.player-card-name strong').textContent,
          summaries: summaries.map((summary) => summary.textContent.trim()),
          controls: [...card.querySelectorAll('.player-card-actions button')].map((button) => button.getBoundingClientRect().height),
        }
      }, firstPlayerId)
      assert.equal(phoneLayout.width, width)
      assert.ok(!phoneLayout.overflow, `Long player and set names should not overflow at ${width}px.`)
      assert.ok(phoneLayout.identity.includes('·'), 'The stable identity suffix should remain visible on phones.')
      assert.ok(phoneLayout.summaries.some((summary) => summary.includes('18')))
      assert.ok(phoneLayout.controls.every((height) => height >= 44))
      const phoneEditorLauncher = driver.findElement(By.id(`edit-preferred-numbers-${firstPlayerId}`))
      await driver.wait(async () => await phoneEditorLauncher.isEnabled(), 10_000)
      await driver.executeScript((id) => document.getElementById(`edit-preferred-numbers-${id}`).click(), firstPlayerId)
      await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-form`)), 10_000)
      const numberEditor = await driver.executeScript((id, setId) => {
        const form = document.querySelector(`[data-player-id="${id}"] .preferred-number-form`)
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          focused: document.activeElement?.id === `preferred-player-${id}-${setId}`,
          labelWrap: getComputedStyle(form.querySelector('label')).overflowWrap,
          inputHeights: [...form.querySelectorAll('input')].map((input) => input.getBoundingClientRect().height),
        }
      }, firstPlayerId, homeSetId)
      assert.ok(!numberEditor.overflow)
      assert.ok(numberEditor.focused, 'Keyboard-activating the editor should focus its first number field.')
      assert.equal(numberEditor.labelWrap, 'anywhere')
      assert.ok(numberEditor.inputHeights.every((height) => height >= 44))
      await click(driver, `[data-player-id="${firstPlayerId}"] .preferred-number-form .cancel-button`)
      await closeViewportFrame(driver)
    }

    await openPlayersViewportFrame(driver, 390, 360)
    const keyboardHeightLauncher = driver.findElement(By.id(`edit-preferred-numbers-${firstPlayerId}`))
    await driver.wait(async () => await keyboardHeightLauncher.isEnabled(), 10_000)
    await driver.executeScript((id) => document.getElementById(`edit-preferred-numbers-${id}`).click(), firstPlayerId)
    await driver.wait(until.elementLocated(By.css(`[data-player-id="${firstPlayerId}"] .preferred-number-form`)), 10_000)
    const keyboardHeightReachability = await driver.executeScript((id) => {
      const form = document.querySelector(`[data-player-id="${id}"] .preferred-number-form`)
      const controls = [...form.querySelectorAll('input, button')]
      const controlHeights = controls.map((control) => control.getBoundingClientRect().height)
      let reachable = true
      for (const control of controls) {
        control.scrollIntoView({ block: 'end' })
        const rect = control.getBoundingClientRect()
        if (rect.top < -1 || rect.bottom > window.innerHeight + 1) reachable = false
      }
      return {
        viewportHeight: window.innerHeight,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        reachable,
        controlHeights,
      }
    }, firstPlayerId)
    assert.equal(keyboardHeightReachability.viewportHeight, 360)
    assert.ok(!keyboardHeightReachability.overflow)
    assert.ok(keyboardHeightReachability.reachable, 'Number inputs and save/cancel actions should remain reachable above the reduced keyboard-height viewport.')
    assert.ok(keyboardHeightReachability.controlHeights.every((height) => height >= 44))
    await closeViewportFrame(driver)

    await openPlayersViewportFrame(driver, 1280, 900)
    const desktopLayout = await driver.executeScript((id) => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      preferenceCount: document.querySelectorAll(`[data-player-id="${id}"] .preferred-number-list li`).length,
    }), firstPlayerId)
    assert.equal(desktopLayout.width, 1280)
    assert.ok(!desktopLayout.overflow)
    assert.equal(desktopLayout.preferenceCount, 2)
    await closeViewportFrame(driver)
  } finally {
    await driver.quit()
  }
})

test('keeps jersey review accessible and reachable at phone, reduced-height, and desktop sizes', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const longName = 'Alexandra Striker with an intentionally long match-day name for narrow screens'
  const longSetName = 'Blue match kit with a long descriptive inventory name for the sideline'
  const setId = 'responsive-blue-set'
  const responsiveNames = [
    longName,
    longName,
    'Morgan Ellis',
    'Jamie Taylor',
    'Robin Campbell',
    'Casey Thompson',
    'Avery Williams',
    'Riley Johnson',
    'Jordan Wilson',
    'Drew Anderson',
    'Quinn Mitchell',
    'Sasha Martin',
    'Charlie Parker',
    'Taylor Morgan',
    'Cameron Bailey',
    'Reese Harrison',
    'Finley Cooper',
    'Skyler Bennett',
  ]
  const responsivePlayers = responsiveNames.map((name, index) => ({
    id: `responsive-player-${index + 1}`,
    name,
    positions: [],
    jerseySize: index === responsiveNames.length - 1 ? null : 'M',
    archived: false,
    createdAt: index + 1,
    updatedAt: index + 1,
  }))
  const responsiveSquad = responsivePlayers.map(({ id, name }) => ({ playerId: id, nameSnapshot: name }))
  const responsiveJerseys = responsivePlayers.map((_, index) => ({
    id: `responsive-shirt-${index + 1}`,
    number: index + 1,
    size: 'M',
    ownerPlayerId: null,
  }))

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await createMatchInPreparation(driver, 'North City', 'South Town')
    const skippedCreation = await readSavedMatch(driver)
    assert.equal(skippedCreation.clock.status, 'not-started')
    assert.equal(skippedCreation.firstKickoffAt, null)
    assert.equal(skippedCreation.participation, null)
    await skipPlayerTrackingAndOpenMatch(driver)
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await seedJerseyPreparationData(driver, {
      players: responsivePlayers,
      sets: [{
        id: setId,
        name: longSetName,
        jerseys: responsiveJerseys,
        preferredNumbers: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      squad: responsiveSquad,
      starterIds: responsivePlayers.slice(0, 11).map(({ id }) => id),
    })

    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await driver.wait(until.elementLocated(By.css('.prepare-match-button')), 10_000)

    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 844, rootFontSize: '125%' },
      { width: 390, height: 360 },
      { width: 844, height: 390 },
      { width: 1280, height: 900 },
    ]) {
      await openViewportFrame(driver, viewport.width, '[aria-label="Open North City versus South Town"]', viewport.height)
      if (viewport.rootFontSize) {
        await driver.executeScript((fontSize) => { document.documentElement.style.fontSize = fontSize }, viewport.rootFontSize)
      }
      await driver.executeScript(() => document.querySelector('.prepare-match-button').click())
      await waitForText(driver, '#preparation-heading', 'Match squad')
      await driver.findElement(By.css('.preparation-steps button[data-step="jerseys"]')).sendKeys(Key.ENTER)
      await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
      const initialFocus = await driver.executeScript(() => ({
        id: document.activeElement?.id,
        focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
        outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
      }))
      assert.equal(initialFocus.id, 'preparation-heading', 'Entering a preparation step should focus its destination heading.')
      assert.ok(initialFocus.outlineWidth !== '0px', 'The focused preparation heading should have a visible focus indicator.')
      await driver.executeScript((id) => {
        const select = document.querySelector('#jersey-assignment-set')
        select.value = id
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }, setId)
      await scrollMatchControlIntoReachableArea(driver, '.generate-button')
      await click(driver, '.generate-button')
      await driver.wait(until.elementLocated(By.css('.assignment-error')), 10_000)

      const layout = await driver.executeScript(() => {
        const editor = document.querySelector('.jersey-editor')
        const controls = [...editor.querySelectorAll('button, select')]
        const errors = [...editor.querySelectorAll('.assignment-error')]
        const errorsAreAssociated = [...editor.querySelectorAll('.assignment-row')].every((row) => {
          const error = row.querySelector('.assignment-error')
          const select = row.querySelector('select')
          return !error || (select.getAttribute('aria-describedby') === error.id
            && document.getElementById(select.getAttribute('aria-describedby')) === error)
        })
        const actionRect = editor.querySelector('.editor-actions')
        actionRect.scrollIntoView({ block: 'end' })
        const actionBounds = actionRect.getBoundingClientRect()
        const finalRow = editor.querySelector('.assignment-row:last-child')
        finalRow.scrollIntoView({ block: 'end' })
        const finalRowBounds = finalRow.getBoundingClientRect()
        const playerLabels = [...editor.querySelectorAll('.assignment-player')].map((label) => label.textContent.trim())
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          controlHeights: controls.map((control) => control.getBoundingClientRect().height),
          actionButtonHeights: [...editor.querySelectorAll('.editor-actions button')].map((button) => button.getBoundingClientRect().height),
          rowCount: editor.querySelectorAll('.assignment-row').length,
          errors: errors.map((error) => error.textContent.trim()),
          errorsAreAssociated,
          playerLabels,
          duplicateLabelsUnique: new Set(playerLabels).size === playerLabels.length,
          longNameIncluded: playerLabels.filter((label) => label.includes('Alexandra Striker')).length === 2,
          finalRowReachable: finalRowBounds.top >= 0 && finalRowBounds.bottom <= window.innerHeight,
          finalActionsReachable: actionBounds.top >= 0 && actionBounds.bottom <= window.innerHeight,
        }
      })
      assert.equal(layout.width, viewport.width)
      assert.equal(layout.height, viewport.height)
      assert.ok(!layout.overflow, `Jersey review overflowed at ${viewport.width}×${viewport.height}.`)
       assert.equal(layout.rowCount, 18)
       assert.equal(layout.errors.length, 1)
       assert.ok(layout.errors.every((error) => error.includes('Player size is missing')))
       assert.ok(layout.errorsAreAssociated, 'Every player error should be associated with its jersey selector.')
       assert.ok(layout.duplicateLabelsUnique, 'Duplicate player names should remain distinguishable in the live squad.')
       assert.ok(layout.longNameIncluded, 'Both duplicate long names should stay readable and separate.')
       assert.ok(layout.controlHeights.every((height) => height >= 48), 'Jersey controls should have 48px hit targets.')
       assert.ok(layout.actionButtonHeights.every((height) => height >= 48 && height < 96),
         `Mobile action buttons should fit their text instead of inheriting a 176px flex basis: ${layout.actionButtonHeights}.`)
       assert.ok(layout.finalRowReachable, 'The final squad member should be reachable at the end of the preparation list.')
       assert.ok(layout.finalActionsReachable, 'Accept/skip actions should remain reachable at the end of the preparation document.')
      await closeViewportFrame(driver)
    }
  } finally {
    await driver.quit()
  }
})

test('accepts a manually reviewed jersey distribution and restores it after kickoff and reload', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const setId = 'manual-flow-blue-set'
  const players = [
    { id: 'alex-id', name: 'Alex', positions: [], jerseySize: 'M', archived: false, createdAt: 1, updatedAt: 1 },
    { id: 'ben-id', name: 'Ben', positions: [], jerseySize: null, archived: false, createdAt: 2, updatedAt: 2 },
  ]
  const preferredNumbers = [
    { playerId: 'alex-id', number: 44 },
    { playerId: 'ben-id', number: 55 },
  ]
  const jerseys = [
    { id: 'blue-seven-m', number: 7, size: 'M', ownerPlayerId: null },
    { id: 'blue-seven-l', number: 7, size: 'L', ownerPlayerId: null },
    { id: 'private-ninety-nine', number: 99, size: 'XL', ownerPlayerId: 'ben-id' },
    { id: 'blue-eight-unknown', number: 8, size: '164', ownerPlayerId: null },
  ]

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await createMatchInPreparation(driver, 'North City', 'South Town')
    const skippedCreation = await readSavedMatch(driver)
    assert.equal(skippedCreation.clock.status, 'not-started')
    assert.equal(skippedCreation.firstKickoffAt, null)
    assert.equal(skippedCreation.participation, null)
    await skipPlayerTrackingAndOpenMatch(driver)
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await seedJerseyPreparationData(driver, {
      players,
      sets: [{
        id: setId,
        name: 'Blue home set',
        jerseys,
        preferredNumbers,
        createdAt: 1,
        updatedAt: 1,
      }],
      squad: [
        { playerId: 'alex-id', nameSnapshot: 'Alex' },
        { playerId: 'ben-id', nameSnapshot: 'Ben' },
      ],
      starterIds: ['alex-id'],
    })

    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await openPreparationJerseys(driver)
    await new Select(await driver.findElement(By.id('jersey-assignment-set'))).selectByValue(setId)
    await click(driver, '.generate-button')
    await driver.wait(until.elementLocated(By.id('jersey-for-ben-id-error')), 10_000)
    assert.match(await driver.findElement(By.id('jersey-for-ben-id-error')).getText(), /Player size is missing/)
    const generated = await driver.executeScript(() => ({
      alex: document.querySelector('#jersey-for-alex-id').value,
      ben: document.querySelector('#jersey-for-ben-id').value,
    }))
    assert.equal(generated.alex, 'blue-seven-m')
    assert.equal(generated.ben, '')

    await scrollMatchControlIntoReachableArea(driver, '#jersey-for-ben-id')
    await new Select(await driver.findElement(By.id('jersey-for-ben-id'))).selectByValue('blue-seven-l')
    await waitForText(driver, '.editor-message', 'Number 7 is already assigned to Alex.')
    assert.equal(await driver.findElement(By.id('jersey-for-alex-id')).getAttribute('value'), 'blue-seven-m')

    await scrollMatchControlIntoReachableArea(driver, '#jersey-for-alex-id')
    await new Select(await driver.findElement(By.id('jersey-for-alex-id'))).selectByValue('private-ninety-nine')
    await scrollMatchControlIntoReachableArea(driver, '#jersey-for-ben-id')
    await new Select(await driver.findElement(By.id('jersey-for-ben-id'))).selectByValue('blue-eight-unknown')
    await scrollMatchControlIntoReachableArea(driver, '.accept-button')
    await click(driver, '.accept-button')
    await driver.wait(until.elementLocated(By.css('.preparation-summary')), 10_000)
    await click(driver, '.accepted-snapshots summary')
    const acceptedSummary = await driver.findElement(By.css('.accepted-snapshots')).getText()
    assert.match(acceptedSummary, /#99\s+Alex[\s\S]*Size XL · Owned by Ben/)
    assert.match(acceptedSummary, /#8\s+Ben[\s\S]*Size 164 · Owned by Team/)
    assert.doesNotMatch(acceptedSummary, /No jersey assigned/)

    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await click(driver, '#player-times-tab')
    const liveLineup = await driver.findElement(By.css('#player-times-panel .match-lineup')).getText()
    assert.match(liveLineup, /#99\s+Alex/)
    assert.match(liveLineup, /#8\s+Ben/)
    assert.doesNotMatch(liveLineup, /Size XL|Size 164|Owned by/)
    assert.equal(await driver.findElements(By.css('#player-times-panel .jersey-summary')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.prepare-match-button')).then((items) => items.length), 0,
      'Preparation editing should close after kickoff.')

    const savedFacts = await driver.executeScript(() => {
      const playerDirectory = JSON.parse(localStorage.getItem('touchline.player-store'))
      const inventory = JSON.parse(localStorage.getItem('touchline.jersey-set-store'))
      const set = inventory.sets.find(({ id }) => id === 'manual-flow-blue-set')
      return {
        playerSizes: playerDirectory.players.map(({ id, jerseySize }) => [id, jerseySize]),
        owners: set.jerseys.map(({ id, ownerPlayerId }) => [id, ownerPlayerId]),
        preferences: set.preferredNumbers,
      }
    })
    assert.deepEqual(savedFacts.playerSizes, [['alex-id', 'M'], ['ben-id', null]])
    assert.deepEqual(savedFacts.owners, [
      ['blue-seven-m', null],
      ['blue-seven-l', null],
      ['private-ninety-nine', 'ben-id'],
      ['blue-eight-unknown', null],
    ])
    assert.deepEqual(savedFacts.preferences, preferredNumbers)

    const savedMatch = await readSavedMatch(driver)
    assert.equal(savedMatch.firstKickoffAt > 0, true)
    assert.deepEqual(savedMatch.jerseyAssignment.rows, [
      { playerId: 'alex-id', jersey: { jerseyId: 'private-ninety-nine', number: 99, size: 'XL', ownerPlayerId: 'ben-id' } },
      { playerId: 'ben-id', jersey: { jerseyId: 'blue-eight-unknown', number: 8, size: '164', ownerPlayerId: null } },
    ])

    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await click(driver, '#player-times-tab')
    const reloadedLineup = await driver.findElement(By.css('#player-times-panel .match-lineup')).getText()
    assert.match(reloadedLineup, /#99\s+Alex/)
    assert.match(reloadedLineup, /#8\s+Ben/)
    assert.doesNotMatch(reloadedLineup, /Size XL|Size 164|Owned by/)
    assert.equal(await driver.findElements(By.css('#player-times-panel .jersey-summary')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.prepare-match-button')).then((items) => items.length), 0,
      'Preparation editing should remain unavailable after kickoff and reload.')
  } finally {
    await driver.quit()
  }
})

test('reuses per-set jersey history across matches and preserves partial snapshots through roster and event changes', async () => {
  const options = new firefox.Options().addArguments('-headless')
  const binary = availableFirefoxBinary()
  if (binary) options.setBinary(binary)
  const driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(options).build()
  const players = [
    { id: 'alex-id', name: 'Alex', positions: [], jerseySize: 'M', archived: false, createdAt: 1, updatedAt: 1 },
    { id: 'ben-id', name: 'Ben', positions: [], jerseySize: 'M', archived: false, createdAt: 2, updatedAt: 2 },
    { id: 'cai-id', name: 'Cai', positions: [], jerseySize: 'M', archived: false, createdAt: 3, updatedAt: 3 },
  ]
  const blueSet = {
    id: 'blue-history-set',
    name: 'Blue home set',
    jerseys: [
      { id: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null },
      { id: 'blue-eight', number: 8, size: 'M', ownerPlayerId: null },
      { id: 'blue-nine', number: 9, size: 'M', ownerPlayerId: null },
    ],
    preferredNumbers: [],
    createdAt: 1,
    updatedAt: 1,
  }
  const whiteSet = {
    id: 'white-history-set',
    name: 'White away set',
    jerseys: [{ id: 'white-twelve', number: 12, size: 'M', ownerPlayerId: null }],
    preferredNumbers: [],
    createdAt: 2,
    updatedAt: 2,
  }
  const alexBen = [
    { playerId: 'alex-id', nameSnapshot: 'Alex' },
    { playerId: 'ben-id', nameSnapshot: 'Ben' },
  ]
  const alexOnly = [{ playerId: 'alex-id', nameSnapshot: 'Alex' }]
  const historyFixtures = [
    {
      id: 'blue-older-history', homeTeam: 'Older City', awayTeam: 'Older Town', status: 'running',
      firstKickoffAt: 1_000, updatedAt: 1_000,
      participation: { ownSide: 'home', squad: alexBen, starterIds: ['alex-id'], substitutions: [] },
      jerseyAssignment: {
        setId: blueSet.id, setNameSnapshot: 'Blue at the older match',
        rows: [
          { playerId: 'alex-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } },
          { playerId: 'ben-id', jersey: { jerseyId: 'blue-nine', number: 9, size: 'M', ownerPlayerId: null } },
        ],
      },
    },
    {
      id: 'white-newer-history', homeTeam: 'White City', awayTeam: 'White Town', status: 'running',
      firstKickoffAt: Date.now() + 10_000_000, updatedAt: Date.now() + 10_000_000,
      participation: { ownSide: 'home', squad: alexOnly, starterIds: ['alex-id'], substitutions: [] },
      jerseyAssignment: {
        setId: whiteSet.id, setNameSnapshot: 'White at the newer match',
        rows: [{ playerId: 'alex-id', jersey: { jerseyId: 'white-twelve', number: 12, size: 'M', ownerPlayerId: null } }],
      },
    },
    {
      id: 'unstarted-blue-preparation', homeTeam: 'Future City', awayTeam: 'Future Town', status: 'not-started',
      firstKickoffAt: null, updatedAt: Date.now() + 20_000_000,
      participation: { ownSide: 'home', squad: alexOnly, starterIds: ['alex-id'], substitutions: [] },
      jerseyAssignment: {
        setId: blueSet.id, setNameSnapshot: 'Blue at an unstarted match',
        rows: [{ playerId: 'alex-id', jersey: { jerseyId: 'blue-seven', number: 7, size: 'M', ownerPlayerId: null } }],
      },
    },
  ]

  try {
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.get(baseUrl)
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await createMatchInPreparation(driver, 'North City', 'South Town')
    await skipPlayerTrackingAndOpenMatch(driver)
    await seedJerseyPreparationData(driver, {
      players,
      sets: [blueSet, whiteSet],
      squad: alexOnly,
      starterIds: ['alex-id'],
      otherMatches: historyFixtures,
    })
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open North City versus South Town"]')
    await openPreparationJerseys(driver)
    await new Select(await driver.findElement(By.id('jersey-assignment-set'))).selectByValue(blueSet.id)
    await click(driver, '.generate-button')
    await driver.wait(until.elementLocated(By.id('jersey-for-alex-id')), 10_000)
    await scrollMatchControlIntoReachableArea(driver, '#jersey-for-alex-id')
    await new Select(await driver.findElement(By.id('jersey-for-alex-id'))).selectByValue('blue-eight')
    await scrollMatchControlIntoReachableArea(driver, '.accept-button')
    await click(driver, '.accept-button')
    await waitForTextContaining(driver, '.preparation-summary', 'Saved · Blue home set · 1 of 1 assigned')
    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    const firstStartedMatch = await readSavedMatch(driver)
    assert.equal(firstStartedMatch.jerseyAssignment.rows[0].jersey.number, 8, 'The first match should record the explicit manual number.')

    await click(driver, '.back-button')
    await driver.wait(until.elementLocated(By.css('.new-match-card')), 10_000)
    await createMatchInPreparation(driver, 'East Point', 'West Point')
    await skipPlayerTrackingAndOpenMatch(driver, 'East Point')
    await seedJerseyPreparationData(driver, {
      players,
      sets: [blueSet, whiteSet],
      squad: alexBen,
      starterIds: ['alex-id'],
      matchTeams: { home: 'East Point', away: 'West Point' },
    })
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open East Point versus West Point"]')
    await openPreparationJerseys(driver)
    await new Select(await driver.findElement(By.id('jersey-assignment-set'))).selectByValue(blueSet.id)
    await click(driver, '.generate-button')
    await driver.wait(until.elementLocated(By.id('jersey-for-ben-id')), 10_000)
    const historicalProposal = await driver.executeScript(() => ({
      alex: document.querySelector('#jersey-for-alex-id').value,
      ben: document.querySelector('#jersey-for-ben-id').value,
    }))
    assert.deepEqual(historicalProposal, { alex: 'blue-eight', ben: 'blue-nine' },
      'Alex should reuse the accepted manual Blue number; Ben should look past his absence to the older Blue match, not White or unstarted history.')
    await scrollMatchControlIntoReachableArea(driver, '.accept-button')
    await click(driver, '.accept-button')
    await waitForTextContaining(driver, '.preparation-summary', 'Saved · Blue home set · 2 of 2 assigned')

    await click(driver, '.prepare-match-button')
    await waitForText(driver, '#preparation-heading', 'Match squad')
    await driver.wait(until.elementLocated(By.css('.squad-form')), 10_000)
    await driver.findElement(By.css('[aria-label="Include Ben in match squad"]')).click()
    await driver.findElement(By.css('[aria-label="Include Cai in match squad"]')).click()
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.jersey-editor')), 10_000)
    await driver.wait(async () => await driver.findElement(By.css('#jersey-for-alex-id')).getAttribute('value') === 'blue-eight', 10_000)
    assert.equal(await driver.findElement(By.css('#jersey-for-cai-id')).getAttribute('value'), '')
    assert.equal(await driver.findElements(By.css('#jersey-for-ben-id')).then((items) => items.length), 0)

    await scrollMatchControlIntoReachableArea(driver, '.accept-button')
    await click(driver, '.accept-button')
    await waitForTextContaining(driver, '.preparation-summary', 'Saved · Blue home set · 1 of 2 assigned')
    await click(driver, '.accepted-snapshots summary')
    const reconciled = await driver.findElement(By.css('.accepted-snapshots')).getText()
    assert.match(reconciled, /#8[\s\S]*Size M · Owned by Team/)
    assert.match(reconciled, /Cai[\s\S]*No jersey assigned/)
    assert.doesNotMatch(reconciled, /Ben/)
    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await click(driver, '#player-times-tab')
    await driver.wait(until.elementLocated(By.css('#player-times-panel .match-lineup')), 10_000)
    assert.equal(await driver.findElements(By.css('#player-times-panel .jersey-summary')).then((items) => items.length), 0)
    assert.match(await driver.findElement(By.css('#player-times-panel .match-lineup')).getText(), /#8[\s\S]*No jersey assigned/)

    await click(driver, '.match-action-area__inner > .goal-button:first-child')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
    await dismissAutomaticGoalDetails(driver)
    await click(driver, '[data-action="start-substitution"]')
    const substitutionDialog = await driver.wait(
      until.elementLocated(By.css('[role="dialog"][aria-label="Make a substitution"]')),
      10_000,
    )
    await driver.findElement(By.css('[name="outgoingPlayer"][value="alex-id"]')).click()
    await driver.findElement(By.css('[name="incomingPlayer"][value="cai-id"]')).click()
    await click(driver, '.save-substitution-button')
    await driver.wait(until.stalenessOf(substitutionDialog), 10_000)
    await driver.wait(until.elementLocated(By.css('.timeline-event[data-event-type="substitution"]')), 10_000)
    const afterMatchActions = await readSavedMatch(driver, 'East Point', 'West Point')
    assert.equal(afterMatchActions.goals.length, 1)
    assert.equal(afterMatchActions.participation.substitutions.length, 1)
    assert.deepEqual(afterMatchActions.jerseyAssignment.rows, [
      { playerId: 'alex-id', jersey: { jerseyId: 'blue-eight', number: 8, size: 'M', ownerPlayerId: null } },
      { playerId: 'cai-id', jersey: null },
    ])

    await driver.executeScript((inventoryKey, targetSetId) => {
      const inventory = JSON.parse(localStorage.getItem(inventoryKey))
      const set = inventory.sets.find(({ id }) => id === targetSetId)
      set.name = 'Blue renamed after the match'
      set.jerseys = set.jerseys.filter(({ id }) => id !== 'blue-eight')
      localStorage.setItem(inventoryKey, JSON.stringify(inventory))
    }, 'touchline.jersey-set-store', blueSet.id)
    await driver.navigate().refresh()
    await driver.wait(until.elementLocated(By.css('.empty-archive, .match-list-item')), 10_000)
    await click(driver, '[aria-label="Open East Point versus West Point"]')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await click(driver, '#player-times-tab')
    const finalLineup = await driver.findElement(By.css('#player-times-panel .match-lineup')).getText()
    assert.match(finalLineup, /#8/)
    assert.match(finalLineup, /Cai[\s\S]*No jersey assigned/)
    assert.doesNotMatch(finalLineup, /Blue home set|Size M|Owned by/)
    assert.equal(await driver.findElements(By.css('#player-times-panel .jersey-summary')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.prepare-match-button')).then((items) => items.length), 0,
      'Preparation editing should remain unavailable after kickoff.')
    const finalRecord = await readSavedMatch(driver, 'East Point', 'West Point')
    assert.equal(finalRecord.jerseyAssignment.setNameSnapshot, 'Blue home set')
    assert.equal(finalRecord.jerseyAssignment.rows[0].jersey.number, 8)
    assert.equal(finalRecord.jerseyAssignment.rows[1].jersey, null)
  } finally {
    await driver.quit()
  }
})
