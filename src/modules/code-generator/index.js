import PuppeteerCodeGenerator from '@/modules/code-generator/puppeteer'
import PlaywrightCodeGenerator from '@/modules/code-generator/playwright'
import KarateCodeGenerator from '@/modules/code-generator/karate'

export default class CodeGenerator {
  constructor(options = {}) {
    this.puppeteerGenerator = new PuppeteerCodeGenerator(options)
    this.playwrightGenerator = new PlaywrightCodeGenerator(options)
    this.karateGenerator = new KarateCodeGenerator(options)
  }

  generate(recording) {
    return {
      puppeteer: this.puppeteerGenerator.generate(recording),
      playwright: this.playwrightGenerator.generate(recording),
      karate: this.karateGenerator.generate(recording),
    }
  }
}
