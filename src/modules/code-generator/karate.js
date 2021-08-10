import { headlessActions, eventsToRecord } from '@/modules/code-generator/constants'
import Block from '@/modules/code-generator/block'
import BaseGenerator from '@/modules/code-generator/base-generator'

const featureName = `Feature:\n`

const header = `Scenario: Chrome Recorded Scenario\n`

const footer = ``

const wrappedHeader = `${header}\n`

const wrappedFooter = `${footer}`

export default class KarateCodeGenerator extends BaseGenerator {
  constructor(options) {
    super(options)
    this._header = header
    this._wrappedHeader = wrappedHeader
    this._footer = footer
    this._wrappedFooter = wrappedFooter
  }

  generate(events) {
    return featureName + this._getHeader() + this._parseEvents(events) + this._getFooter()
  }

  // from here onwards it was in the CodeGenerator.js

  _getHeader() {
    console.debug(this._options)
    let hdr = this._options.wrapAsync ? this._wrappedHeader : this._header
    // hdr = this._options.headless ? hdr : hdr.replace('launch()', 'launch({ headless: false })')
    return hdr
  }

  _getFooter() {
    return this._options.wrapAsync ? this._wrappedFooter : this._footer
  }

  _parseEvents(events) {
    console.debug(`generating code for ${events ? events.length : 0} events`)
    let result = ''

    if (!events) return result

    for (let event of events) {
      const { action, selector, value, href, keyCode, tagName, frameId, frameUrl } = event
      const escapedSelector = selector ? selector.replace(/\\/g, '\\\\') : selector

      // we need to keep a handle on what frames events originate from
      this._setFrames(frameId, frameUrl)

      switch (action) {
        case 'keydown':
          if (keyCode === this._options.keyCode) {
            this._blocks.push(this._handleKeyDown(escapedSelector, value, keyCode))
          }
          break
        case 'click':
          this._blocks.push(this._handleClick(escapedSelector, events))
          break
        case 'change':
          if (tagName === 'SELECT') {
            this._blocks.push(this._handleChange(escapedSelector, value))
          }
          break
        case headlessActions.GOTO:
          this._blocks.push(this._handleGoto(href, frameId))
          break
        case headlessActions.VIEWPORT:
          this._blocks.push(this._handleViewport(value.width, value.height))
          break
        case headlessActions.NAVIGATION:
          this._blocks.push(this._handleWaitForNavigation())
          this._hasNavigation = true
          break
        case headlessActions.SCREENSHOT:
          this._blocks.push(this._handleScreenshot(value))
          break
      }
    }

    /* if (this._hasNavigation && this._options.waitForNavigation) {
      console.debug('Adding navigationPromise declaration')
      const block = new Block(this._frameId, { type: headlessActions.NAVIGATION_PROMISE, value: 'const navigationPromise = page.waitForNavigation()' })
      this._blocks.unshift(block)
    } */

    console.debug('post processing blocks:', this._blocks)
    this._postProcess()

    const indent = this._options.wrapAsync ? '  ' : ''
    const newLine = `\n`

    for (let block of this._blocks) {
      const lines = block.getLines()
      for (let line of lines) {
        result += indent + line.value + newLine
      }
    }

    return result
  }

  _setFrames(frameId, frameUrl) {
    if (frameId && frameId !== 0) {
      this._frameId = frameId
      this._frame = `frame_${frameId}`
      this._allFrames[frameId] = frameUrl
    } else {
      this._frameId = 0
      this._frame = 'page'
    }
  }

  _postProcess() {
    // when events are recorded from different frames, we want to add a frame setter near the code that uses that frame
    if (Object.keys(this._allFrames).length > 0) {
      this._postProcessSetFrames()
    }

    if (this._options.blankLinesBetweenBlocks && this._blocks.length > 0) {
      this._postProcessAddBlankLines()
    }
  }

  _handleKeyDown(selector, value) {
    const block = new Block(this._frameId)
    block.addLine({
      type: eventsToRecord.KEYDOWN,
      value: `* input('${selector}', '${this._escapeUserInput(value)}')`,
    })
    return block
  }

  _handleClick(selector) {
    const block = new Block(this._frameId)
    if (this._options.waitForSelectorOnClick) {
      block.addLine({ type: eventsToRecord.CLICK, value: `* waitFor('${selector}').click()` })
    } else {
      block.addLine({ type: eventsToRecord.CLICK, value: `* click('${selector}')` })
    }
    return block
  }

  _handleChange(selector, value) {
    return new Block(this._frameId, {
      type: headlessActions.CHANGE,
      value: `* select('${selector}', '${value}')`,
    })
  }

  _handleGoto(href) {
    return new Block(this._frameId, { type: headlessActions.GOTO, value: `* driver '${href}'` })
  }

  _handleViewport(width, height) {
    return new Block(this._frameId, {
      type: headlessActions.VIEWPORT,
      value: `* driver.dimensions = { x: 0, y: 0, width: ${width}, height: ${height} }`,
    })
  }

  _handleScreenshot(value) {
    this._screenshotCounter += 1

    if (value) {
      return new Block(this._frameId, {
        type: headlessActions.SCREENSHOT,
        value: `const element${this._screenshotCounter} = await page.$('${value}')
await element${this._screenshotCounter}.screenshot({ path: 'screenshot_${this._screenshotCounter}.png' })`,
      })
    }

    return new Block(this._frameId, {
      type: headlessActions.SCREENSHOT,
      value: `await ${this._frame}.screenshot({ path: 'screenshot_${this._screenshotCounter}.png', fullPage: true })`,
    })
  }

  _handleWaitForNavigation() {
    const block = new Block(this._frameId)
    if (this._options.waitForNavigation) {
      block.addLine({
        type: headlessActions.NAVIGATION,
        value: `# page navigation, Karate will handle automatically`,
      })
    }
    return block
  }

  _postProcessSetFrames() {
    for (let [i, block] of this._blocks.entries()) {
      const lines = block.getLines()
      for (let line of lines) {
        if (line.frameId && Object.keys(this._allFrames).includes(line.frameId.toString())) {
          const declaration = `const frame_${line.frameId} = frames.find(f => f.url() === '${
            this._allFrames[line.frameId]
          }')`
          this._blocks[i].addLineToTop({ type: headlessActions.FRAME_SET, value: declaration })
          this._blocks[i].addLineToTop({
            type: headlessActions.FRAME_SET,
            value: 'let frames = await page.frames()',
          })
          delete this._allFrames[line.frameId]
          break
        }
      }
    }
  }

  _postProcessAddBlankLines() {
    let i = 0
    while (i <= this._blocks.length) {
      const blankLine = new Block()
      blankLine.addLine({ type: null, value: '' })
      this._blocks.splice(i, 0, blankLine)
      i += 2
    }
  }

  _escapeUserInput(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  }
}
