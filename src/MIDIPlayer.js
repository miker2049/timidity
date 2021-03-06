// import "core-js/stable"
import "regenerator-runtime/runtime"
import URL from 'url-parse'
import { EventEmitter } from 'events'

export function createURL(str) {
  return new URL(str)
}

export default class MIDIPlayer extends EventEmitter {

  constructor(worklet, context, baseURL) {
    super()
    this._worklet = worklet
    this._baseURL = baseURL
    this._worklet.port.onmessage = this._handleMessage.bind(this)
    this.context = context
    this._worklet.connect(context.destination)
  }

  async _handleMessage(message) {
    // console.log(message)
    if (message.data.type === 'missingInstruments') {
      let instBuffs = []
      try {
        instBuffs = await Promise.all(message.data.instruments.map((instrument) => {
          return this.fetchInstrument(instrument)
        }))
      } catch (err) {
        // Do something
        console.log('Error loading instrument patch files')
        console.log(err)
      }
      // console.log(instBuffs)
      this._worklet.port.postMessage({ type: 'instPayload', buffs: instBuffs })
    }
  }

  play() {
    this.context.resume()
    this._worklet.port.postMessage("play")
  }

  pause() {
    this._worklet.port.postMessage("pause")
  }

  seek(sec) {
    this._worklet.port.postMessage({ type: 'seek', sec: sec })
  }

  load(midiURL) {
    fetchBuff(midiURL).then(buff => {
      // console.log(buff)
      this._worklet.port.postMessage({
        type: 'loadMIDI',
        midiBuff: buff
      })
    })
  }

  static async createMIDIPlayer(timidityCfgURL = '/gravis.cfg', acontext = new AudioContext()) {
    await acontext.audioWorklet.addModule(`worklet-bundle.js`)
    const timidityCfg = await fetchText(timidityCfgURL)
    let baseURL = timidityCfgURL.substring(0, timidityCfgURL.lastIndexOf("/") + 1);
    if (baseURL.length === 0) baseURL = '/'


    const workletNode = new AudioWorkletNode(acontext, 'midiplayer', {
      outputChannelCount: [2],
      processorOptions: {
        baseURL: baseURL,
        timidityCfg: timidityCfg
      }
    })
    return new MIDIPlayer(workletNode, acontext, baseURL)
  }

  async fetchInstrument(instrument) {
    let path = this._baseURL + instrument
    const extRegex = /(?:\.([^.]+))?$/
    if (extRegex.exec(instrument) !== 'pat') path = this._baseURL + instrument + '.pat'
    return { instrumentName: instrument, instrumentBuff: await fetchBuff(path) }
  }
}


async function fetchBuff(url) {
  const response = await _fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const buf = new Uint8Array(arrayBuffer)
  return buf
}

export async function fetchText(url) {
  const response = await _fetch(url)
  const text = await response.text()
  return text
}

async function _fetch(url) {
  const opts = {
    mode: 'cors',
    credentials: 'same-origin'
  }
  const response = await window.fetch(url, opts)
  if (response.status !== 200) throw new Error(`Could not load ${url}`)
  return response
}
