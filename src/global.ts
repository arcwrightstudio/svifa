// The <script> tag build: window.Svifa is the class itself, with easeOut and version on it.
import { Svifa, easeOut, version } from './index'

;(window as unknown as { Svifa: unknown }).Svifa = Object.assign(Svifa, { Svifa, easeOut, version })
