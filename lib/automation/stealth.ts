import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

const stealth = StealthPlugin()
stealth.enabledEvasions.delete('chrome.runtime')
stealth.enabledEvasions.delete('iframe.contentWindow')
chromium.use(stealth)

export const playwright = chromium

export async function applyAdvancedStealth(page: any) {
    await page.addInitScript(() => {
        // Patch both WebGL1 and WebGL2 — CreepJS queries both
        function patchWebGL(ctx: any) {
            const orig = ctx.prototype.getParameter
            ctx.prototype.getParameter = function (parameter: number) {
                if (parameter === 37445) return 'Intel Inc.'                         // UNMASKED_VENDOR_WEBGL
                if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics 640' // UNMASKED_RENDERER_WEBGL
                return orig.apply(this, [parameter])
            }
        }
        patchWebGL(WebGLRenderingContext)
        if (typeof WebGL2RenderingContext !== 'undefined') patchWebGL(WebGL2RenderingContext)

        // Mask hardware concurrency and memory
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
        // @ts-ignore
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })

        // Mask battery — always plugged in, full
        // @ts-ignore
        if (navigator.getBattery) {
            // @ts-ignore
            navigator.getBattery = () => Promise.resolve({
                charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
            })
        }

        // Mask permissions — always granted for common APIs
        const origQuery = navigator.permissions?.query?.bind(navigator.permissions)
        if (origQuery) {
            navigator.permissions.query = (desc: any) => {
                if (['notifications', 'clipboard-read', 'clipboard-write'].includes(desc.name)) {
                    return Promise.resolve({ state: 'granted', onchange: null } as any)
                }
                return origQuery(desc)
            }
        }
    })
}
