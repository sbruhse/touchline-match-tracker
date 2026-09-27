import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { after, before, test } from 'node:test'
import { Builder, Browser, By, Key, until } from 'selenium-webdriver'
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

async function closeViewportFrame(driver) {
  await driver.switchTo().defaultContent()
  await driver.executeScript(() => document.querySelector('#viewport-check-frame')?.remove())
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

async function readSavedMatch(driver) {
  return driver.executeAsyncScript((done) => {
    const request = indexedDB.open('touchline', 1)
    request.onerror = () => done(null)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('matches', 'readonly')
      const listRequest = transaction.objectStore('matches').getAll()
      listRequest.onsuccess = () => {
        const match = listRequest.result.find((record) => record.homeTeam === 'North City' && record.awayTeam === 'South Town')
        done(match ?? null)
        database.close()
      }
      listRequest.onerror = () => {
        database.close()
        done(null)
      }
    }
  })
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
      return { width: window.innerWidth, sideBySide: form.left >= copy.right - 1, overflow: document.documentElement.scrollWidth > window.innerWidth, welcomeWidth: welcome.width }
    })
    assert.ok(desktopArchive.width > 760, `Expected a desktop viewport, got ${desktopArchive.width}px.`)
    assert.ok(desktopArchive.sideBySide, 'The archive creation form should sit beside the welcome copy on desktop.')
    assert.ok(!desktopArchive.overflow, 'The archive should not overflow horizontally on desktop.')

    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowArchive = await driver.executeScript(() => {
      const copy = document.querySelector('.welcome-copy').getBoundingClientRect()
      const form = document.querySelector('.new-match-card').getBoundingClientRect()
      return { width: window.innerWidth, stacked: form.top >= copy.bottom - 1, overflow: document.documentElement.scrollWidth > window.innerWidth }
    })
    assert.ok(narrowArchive.width <= 520, `Expected a narrow viewport, got ${narrowArchive.width}px.`)
    assert.ok(narrowArchive.stacked, 'The archive creation form should stack below the welcome copy on narrow screens.')
    assert.ok(!narrowArchive.overflow, 'The archive should not overflow horizontally on narrow screens.')
    await driver.findElement(By.id('home-team')).sendKeys('North City')
    await driver.findElement(By.id('away-team')).sendKeys('South Town')
    await click(driver, '.start-button')
    await waitForText(driver, '#match-heading', 'North City')
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    const desktopDetail = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      controlsDirection: getComputedStyle(document.querySelector('.clock-actions')).flexDirection,
      feedbackVisible: document.querySelector('.save-feedback')?.getBoundingClientRect().height > 0,
      feedbackOverflow: document.querySelector('.save-feedback')?.getBoundingClientRect().right > window.innerWidth,
      recordingTeams: document.querySelectorAll('.match-action-area__goal').length,
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
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      controlsDirection: getComputedStyle(document.querySelector('.clock-actions')).flexDirection,
      feedbackVisible: document.querySelector('.save-feedback')?.getBoundingClientRect().height > 0,
      feedbackOverflow: document.querySelector('.save-feedback')?.getBoundingClientRect().right > window.innerWidth,
    }))
    assert.ok(narrowDetail.width <= 520, `Expected a narrow viewport, got ${narrowDetail.width}px.`)
    assert.ok(!narrowDetail.overflow, 'The detail view should not overflow horizontally on narrow screens.')
    assert.equal(narrowDetail.controlsDirection, 'row')
    assert.ok(narrowDetail.feedbackVisible, 'Committed-save feedback should be visible on narrow screens.')
    assert.ok(!narrowDetail.feedbackOverflow, 'Committed-save feedback should fit on narrow screens.')

    const longHome = 'North City Football Club with an extremely long home team name'
    const longAway = 'South Town Athletic Association with an extraordinarily long away team name'
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
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          compactChrome: document.querySelector('.topbar--match').getBoundingClientRect().height <= 56,
          appFooterHidden: document.querySelector('.page-footer') === null,
          stickyTop: getComputedStyle(document.querySelector('.match-sticky-header')).position,
          headerTop: header.top,
          actionPosition: getComputedStyle(document.querySelector('.match-action-area')).position,
          actionBottom: actionArea.bottom,
          actionHeights: targets.map((target) => target.getBoundingClientRect().height),
          longNames: [...document.querySelectorAll('.match-header__team')].map((team) => team.textContent.trim()),
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
    await click(driver, '[aria-label="Record goal for North City"]')
    await waitForText(driver, '[data-testid="home-score"]', '1')
    await driver.wait(async () => (await driver.findElement(By.css('.match-save-feedback')).getText()).includes('Goal saved.'), 10_000)
    assert.equal(await driver.findElements(By.css('.app-save-feedback')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.match-save-feedback[role="status"]')).then((items) => items.length), 1)
    await click(driver, '.match-save-feedback button')
    await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 10_000)
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
    await driver.wait(async () => (await driver.findElement(By.css('.match-save-feedback')).getText()).includes('Goal saved.'), 10_000)

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
    await driver.wait(async () => (await driver.findElement(By.css('.match-save-feedback')).getText()).includes('Goal saved.'), 10_000)
    assert.equal(await driver.executeScript(() => navigator.onLine), false)
    assert.equal(await driver.executeScript(() => localStorage.getItem('touchline.match-store')), legacyPayload)

    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 === 0 ? 'home' : 'away'
      const score = side === 'home' ? 2 + Math.floor(index / 2) : 3 + Math.floor(index / 2)
      await click(driver, `[aria-label="Record goal for ${side === 'home' ? 'North City' : 'South Town'}"]`)
      await waitForText(driver, `[data-testid="${side}-score"]`, String(score))
      await driver.wait(async () => (await driver.findElement(By.css('.match-save-feedback')).getText()).includes('Goal saved.'), 10_000)
    }

    for (const width of [320, 390]) {
      await openViewportFrame(driver, width, '[aria-label="Open North City versus South Town"]')
      const bottomReachability = await driver.executeScript(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        const actionArea = document.querySelector('.match-action-area').getBoundingClientRect()
        const header = document.querySelector('.match-sticky-header').getBoundingClientRect()
        const events = document.querySelectorAll('.timeline-event')
        const lastEvent = events[events.length - 1].getBoundingClientRect()
        return {
          width: window.innerWidth,
          viewportHeight: window.innerHeight,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          actionBottom: actionArea.bottom,
          actionTop: actionArea.top,
          headerTop: header.top,
          lastEventTop: lastEvent.top,
          lastEventBottom: lastEvent.bottom,
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
        overflow: document.documentElement.scrollWidth > window.innerWidth,
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
        overflow: document.documentElement.scrollWidth > window.innerWidth,
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
    assert.ok(!enlargedText.overflow, 'Enlarged text should not create horizontal Match-page scrolling.')
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
      overflow: document.documentElement.scrollWidth > window.innerWidth,
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
    await driver.wait(until.elementLocated(By.id('new-player-name')), 10_000)
    for (const playerName of ['Alex Morgan', 'Sam Kerr']) {
      await driver.findElement(By.id('new-player-name')).sendKeys(playerName)
      await click(driver, '.player-create-form .primary-button')
      await driver.wait(until.elementLocated(By.css(`[data-testid="player-card"] strong`)), 10_000)
      await driver.wait(until.elementLocated(By.xpath(`//*[contains(@class,"player-card") and contains(.,"${playerName}")]`)), 10_000)
    }
    const playerIds = await driver.executeScript(() => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return Object.fromEntries(envelope.players.map((player) => [player.name, player.id]))
    })
    const alexId = playerIds['Alex Morgan']
    const samId = playerIds['Sam Kerr']
    assert.ok(alexId)
    assert.ok(samId)

    await click(driver, '[data-nav="matches"]')
    await driver.findElement(By.id('home-team')).sendKeys('North City')
    await driver.findElement(By.id('away-team')).sendKeys('South Town')
    await click(driver, '.start-button')
    await waitForText(driver, '#match-heading', 'North City')
    assert.ok(await driver.findElement(By.css('.squad-setup')).isDisplayed())
    assert.equal(await driver.findElements(By.css('.match-action-area .goal-button')).then((buttons) => buttons.length), 2)
    await click(driver, '.squad-setup button.primary-button')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowSquadForm = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      widthPx: document.querySelector('.squad-form').getBoundingClientRect().width,
    }))
    assert.ok(narrowSquadForm.width <= 520, `Expected a narrow squad form, got ${narrowSquadForm.width}px.`)
    assert.ok(!narrowSquadForm.overflow, 'The squad form should not overflow horizontally on a narrow screen.')
    const homeSide = driver.findElement(By.css('[name="own-side"][value="home"]'))
    assert.match(await homeSide.getAccessibleName(), /Home.*North City/)
    const alexSelection = driver.findElement(By.css('[aria-label="Include Alex Morgan in match squad"]'))
    assert.equal(await alexSelection.getAccessibleName(), 'Include Alex Morgan in match squad')
    await alexSelection.sendKeys(Key.SPACE)
    assert.ok(await alexSelection.isSelected(), 'The squad checkbox should respond to keyboard activation.')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.findElement(By.css('[name="own-side"][value="home"]')).click()
    // Alex was selected by keyboard above; keep that choice and add the bench player.
    await driver.findElement(By.css('[aria-label="Include Sam Kerr in match squad"]')).click()
    await driver.findElement(By.css('[aria-label="Select Alex Morgan as a starter"]')).click()
    await driver.executeScript(() => {
      const submit = document.querySelector('.squad-form button[type="submit"]')
      submit.scrollIntoView({ block: 'center' })
      const actions = document.querySelector('.match-action-area').getBoundingClientRect()
      const overlap = submit.getBoundingClientRect().bottom - actions.top
      if (overlap > 0) window.scrollBy(0, overlap + 16)
    })
    await click(driver, '.squad-form button[type="submit"]')
    await driver.wait(until.elementLocated(By.css('.saved-squad-summary')), 10_000)
    await waitForText(driver, '.save-feedback', 'All changes saved.')

    await click(driver, '.clock-primary')
    await waitForText(driver, '.clock-status', 'CLOCK RUNNING')
    await waitForText(driver, '.save-feedback', 'All changes saved.')
    assert.equal(await driver.findElements(By.css('.squad-setup')).then((items) => items.length), 0)
    assert.equal(await driver.findElements(By.css('.saved-squad-summary')).then((items) => items.length), 0)
    assert.ok(await driver.executeScript(() => window.__activeAppIntervals.size > 0), 'Live Match display timers should be active while the match is open.')
    await click(driver, '[data-nav="players"]')
    await driver.wait(until.elementLocated(By.id('new-player-name')), 10_000)
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
    const alexBreakdown = driver.findElement(By.css('[data-match-id="' + finishedMatch.id + '"]'))
    assert.match(await alexBreakdown.getText(), /vs South Town/)
    assert.match(await alexBreakdown.getText(), /Full time/)
    assert.equal(await alexBreakdown.findElement(By.css('.breakdown-time')).getText(), '35:01')
    assert.equal(await driver.findElements(By.css('.live-contribution')).then((items) => items.length), 0)
    assert.match(await driver.findElement(By.css('.statistics-time-note')).getText(), /includes stoppage time/i)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    const narrowStatistics = await driver.executeScript(() => ({
      width: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      summaryColumns: getComputedStyle(document.querySelector('.statistics-summary')).gridTemplateColumns.split(' ').length,
      breakdownWidth: document.querySelector('.breakdown-row').getBoundingClientRect().width,
    }))
    assert.ok(narrowStatistics.width <= 520, `Expected narrow statistics, got ${narrowStatistics.width}px.`)
    assert.ok(!narrowStatistics.overflow, 'Player statistics should not overflow horizontally on a narrow screen.')
    assert.equal(narrowStatistics.summaryColumns, 1, 'Statistics summary cards should stack on a narrow screen.')
    assert.ok(narrowStatistics.breakdownWidth > 0)
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 900 })
    await driver.sleep(1_100)
    assert.equal(await driver.findElement(By.css('[data-testid="total-playing-time"]')).getText(), '35:01')

    await click(driver, '.back-link')
    await click(driver, `[aria-label="Rename Alex Morgan"]`)
    const renamedInput = driver.findElement(By.css(`[data-player-id="${alexId}"] input`))
    await renamedInput.clear()
    await renamedInput.sendKeys('Alex Renamed')
    await click(driver, `[data-player-id="${alexId}"] button`)
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(@class,"player-card") and contains(.,"Alex Renamed")]`)), 10_000)
    await driver.wait(async () => driver.executeScript((id) => {
      const envelope = JSON.parse(localStorage.getItem('touchline.player-store') ?? '{"players":[]}')
      return envelope.players.some((player) => player.id === id && player.name === 'Alex Renamed')
    }, alexId), 10_000, 'Expected the directory rename to persist.')
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
