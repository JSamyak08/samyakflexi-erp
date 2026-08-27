/**
 * RS-232 Digital Weighing Scale Web Serial Service
 * Connects directly to industrial weighing indicators via RS-232 (COM / USB-Serial)
 * using the browser's Web Serial API.
 */

class WeighingScaleService {
  constructor() {
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.keepReading = false;
    this.isConnected = false;
    this.isSimulated = false;
    this.simulationTimer = null;
    
    // Scale live state
    this.currentWeight = 0.0;
    this.grossWeight = 0.0;
    this.tareWeight = 0.0;
    this.netWeight = 0.0;
    this.unit = 'kg';
    this.isStable = true;
    this.lastReadingTime = null;
    this.rawBuffer = '';
    this.lastRawLine = '';
    this.errorMessage = null;

    // Config defaults (Standard Industrial Scale: 9600 baud, 8 data bits, 1 stop bit, no parity)
    this.config = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      filterNoise: true,
      autoReconnect: true
    };

    // Load saved config
    try {
      const saved = localStorage.getItem('samyak_erp_scale_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // Subscribed listeners
    this.listeners = new Set();
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem('samyak_erp_scale_config', JSON.stringify(this.config));
    } catch (e) {}
    this.notify();
  }

  getStatus() {
    return {
      isSupported: this.isSupported(),
      isConnected: this.isConnected,
      isSimulated: this.isSimulated,
      currentWeight: this.currentWeight,
      grossWeight: this.grossWeight,
      tareWeight: this.tareWeight,
      netWeight: this.netWeight,
      unit: this.unit,
      isStable: this.isStable,
      lastReadingTime: this.lastReadingTime,
      lastRawLine: this.lastRawLine,
      errorMessage: this.errorMessage,
      config: { ...this.config }
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Send immediate initial status
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const status = this.getStatus();
    this.listeners.forEach(cb => {
      try { cb(status); } catch (err) { console.error('Scale listener error:', err); }
    });
  }

  /**
   * Connect to physical RS-232 COM port via Web Serial API
   */
  async connect() {
    if (!this.isSupported()) {
      this.errorMessage = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.notify();
      throw new Error(this.errorMessage);
    }

    if (this.isConnected) {
      return true;
    }

    try {
      this.errorMessage = null;

      // If previous connection/port is dangling or open, clean up first
      if (this.port) {
        try {
          await this.disconnect();
        } catch (e) {
          console.warn('Cleanup previous port warning:', e);
        }
      }

      // Prompt user to pick USB-Serial / RS-232 COM port
      this.port = await navigator.serial.requestPort();

      // Ensure port is not already opened
      if (!this.port.readable) {
        const baud = parseInt(this.config.baudRate, 10) || 9600;
        const dataBits = parseInt(this.config.dataBits, 10) || 8;
        const stopBits = parseInt(this.config.stopBits, 10) || 1;
        const parity = this.config.parity || 'none';

        await this.port.open({
          baudRate: baud,
          dataBits: dataBits,
          stopBits: stopBits,
          parity: parity,
          bufferSize: 255
        });
      }

      this.isConnected = true;
      this.isSimulated = false;
      this.keepReading = true;
      this.lastReadingTime = new Date();
      this.notify();

      // Start continuous background read stream
      this.readStream();
      return true;
    } catch (err) {
      console.error('Failed to open RS-232 serial port:', err);
      this.isConnected = false;
      
      let humanMsg = err.message || String(err);
      if (err.name === 'NotFoundError') {
        humanMsg = 'No serial port selected by user.';
      } else if (
        humanMsg.toLowerCase().includes('failed to open serial port') || 
        err.name === 'NetworkError' || 
        err.name === 'InvalidStateError'
      ) {
        humanMsg = 'Windows COM Port is in use or locked. Please close any other browser tabs, PuTTY, or scale apps using this COM port, or unplug and re-insert the USB-to-RS232 adapter and try again.';
      }

      this.errorMessage = humanMsg;
      this.notify();
      
      const customErr = new Error(humanMsg);
      customErr.name = err.name;
      throw customErr;
    }
  }

  /**
   * Force reset / release all serial handles and locks
   */
  async forceReset() {
    await this.disconnect().catch(() => {});
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.errorMessage = null;
    this.notify();
  }

  async readStream() {
    while (this.port && this.port.readable && this.keepReading) {
      try {
        if (typeof TextDecoderStream !== 'undefined') {
          try {
            const textDecoder = new TextDecoderStream();
            this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();
          } catch (streamErr) {
            this.reader = this.port.readable.getReader();
          }
        } else {
          this.reader = this.port.readable.getReader();
        }

        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            const chunk = typeof value === 'string' ? value : decoder.decode(value);
            this.handleIncomingChunk(chunk);
          }
        }
      } catch (err) {
        console.warn('Serial reader error:', err);
      } finally {
        if (this.reader) {
          try { this.reader.releaseLock(); } catch (e) {}
        }
      }
    }
  }

  /**
   * Parse continuous ASCII stream from RS-232 weighing indicators
   */
  handleIncomingChunk(chunk) {
    this.rawBuffer += chunk;

    // Split on newline (\r\n or \n)
    const lines = this.rawBuffer.split(/[\r\n]+/);
    // Keep any incomplete trailing fragment in buffer
    this.rawBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.lastRawLine = trimmed;
      this.parseScaleLine(trimmed);
    }
  }

  /**
   * Robust parser for various digital scale protocols
   * Supports: Essae, Avery, Mettler Toledo, CAS, Yaohua, Phoenix, Generic ASCII
   */
  parseScaleLine(line) {
    try {
      // Examples of formats:
      // "ST,GS,+00124.50kg" -> 124.50
      // "US,GS,  124.50 kg"
      // "WN00124.50"
      // "WT: 124.50 KG"
      // "+  124.50"
      // "124.50"

      let weightVal = null;
      let isStable = true;

      if (line.includes('US,') || line.includes('UNSTABLE') || line.includes('~')) {
        isStable = false;
      }

      // 1. Regex to extract numeric weight with optional +/- and decimal
      const match = line.match(/([+-]?\s*\d+(?:\.\d+)?)/);
      if (match) {
        const cleanedStr = match[1].replace(/\s+/g, '');
        const num = parseFloat(cleanedStr);
        if (!isNaN(num) && num >= -50 && num < 100000) {
          weightVal = num;
        }
      }

      if (weightVal !== null) {
        this.grossWeight = weightVal;
        this.netWeight = Math.max(0, parseFloat((this.grossWeight - this.tareWeight).toFixed(2)));
        this.currentWeight = this.netWeight;
        this.isStable = isStable;
        this.lastReadingTime = new Date();
        this.notify();
      }
    } catch (e) {
      console.warn('Error parsing scale line:', line, e);
    }
  }

  /**
   * Disconnect the active RS-232 serial connection
   */
  async disconnect() {
    this.keepReading = false;
    this.stopSimulation();

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }

    if (this.readableStreamClosed) {
      try {
        await this.readableStreamClosed.catch(() => {});
      } catch (e) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }

    this.isConnected = false;
    this.isSimulated = false;
    this.notify();
  }

  /**
   * Set Tare (Zero out current load)
   */
  tare() {
    this.tareWeight = this.grossWeight;
    this.netWeight = 0.0;
    this.currentWeight = 0.0;
    this.notify();
  }

  /**
   * Clear Tare
   */
  clearTare() {
    this.tareWeight = 0.0;
    this.netWeight = this.grossWeight;
    this.currentWeight = this.grossWeight;
    this.notify();
  }

  /**
   * Start built-in simulation mode for development/testing
   */
  startSimulation(baseWeight = 245.5) {
    this.stopSimulation();
    this.isConnected = true;
    this.isSimulated = true;
    this.grossWeight = baseWeight;
    this.netWeight = baseWeight;
    this.currentWeight = baseWeight;
    this.isStable = true;
    this.lastReadingTime = new Date();
    this.notify();

    this.simulationTimer = setInterval(() => {
      // Add subtle +/- 0.2kg fluctuation to simulate real industrial load cell noise
      const jitter = (Math.random() * 0.4 - 0.2);
      this.grossWeight = Math.max(0, parseFloat((baseWeight + jitter).toFixed(2)));
      this.netWeight = Math.max(0, parseFloat((this.grossWeight - this.tareWeight).toFixed(2)));
      this.currentWeight = this.netWeight;
      this.lastReadingTime = new Date();
      this.lastRawLine = `ST,GS,+${String(this.grossWeight).padStart(8, '0')}kg`;
      this.notify();
    }, 400);
  }

  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.isSimulated) {
      this.isSimulated = false;
      this.isConnected = false;
      this.notify();
    }
  }

  setManualWeight(weight) {
    const num = parseFloat(weight) || 0;
    this.grossWeight = num;
    this.netWeight = Math.max(0, parseFloat((num - this.tareWeight).toFixed(2)));
    this.currentWeight = this.netWeight;
    this.lastReadingTime = new Date();
    this.notify();
  }
}

// Global Singleton Instance
export const weighingScaleService = new WeighingScaleService();
export default weighingScaleService;
