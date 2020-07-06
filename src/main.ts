import WebSocket from 'ws';
import i2c from 'i2c-bus';

interface CounterState extends Object {
  serverOffset: number;
  startTimeMs: number;
  delayMinutesBetweenHeats: number;
  numHeats: number;
  currentHeat: number;
  started: boolean;
  finnished: boolean;
  intervalFunc?: NodeJS.Timeout;
  isNegative: boolean;
  secondsLeft: number;
  minutesLeft: number;
  hoursLeft: number;
}

interface SetState {
  serverNow: number;
  startTimeMs: number;
  delayMinutesBetweenHeats: number;
  numHeats: number;
  started: boolean;
  password: string;
}

// Change the following value if your Relay board uses a different I2C address.
const DEVICE_ADDRESS = 0x20; // 7 bit address (will be left shifted to add the read write bit)
// Don't change the values, there's no need for that.
const DEVICE_REG_MODE1 = 0x06;

//Device registry data

class CountDownStore {
  private socket?: WebSocket;
  private connected = false;
  private state: CounterState;
  private isHornOn: boolean;
  private i2cBus?: i2c.I2CBus;
  private regData = 0xff;

  constructor() {
    this.state = {
      serverOffset: 0,
      startTimeMs: Date.now() + 60 * 60 * 1000,
      delayMinutesBetweenHeats: 5,
      numHeats: 3,
      currentHeat: 0,
      started: false,
      finnished: false,
      intervalFunc: undefined,
      isNegative: false,
      secondsLeft: 99,
      minutesLeft: 99,
      hoursLeft: 99,
    };
    this.isHornOn = false;
    setInterval(() => this.getTimeleft(), 100);
    this.connectI2C();
    this.connectWS();
  }

  now() {
    return Date.now() + this.state.serverOffset;
  }
  closeWS() {
    if (this.socket) this.socket.close();
    this.connected = false;
  }
  connectI2C() {
    console.log('Opening ic2-bus');
    this.i2cBus = i2c.openSync(1); // # 0 = /dev/i2c-0 (port I2C0), 1 = /dev/i2c-1 (port I2C1)
    console.log('ic2-bus is open');
  }
  connectWS() {
    if (this.socket) this.socket.close();
    // Create WebSocket connection.
    this.socket = new WebSocket('wss://regattastart.herokuapp.com/ws', {
      origin: 'https://regattastart.herokuapp.com.org',
    });
    this.connected = true;
    // Listen for message
    this.socket.on('message', (data) => {
      console.log(data);
      try {
        const newState = JSON.parse(data.toString()); // TODO check for correct data
        this.setState(newState);
      } catch (err) {
        console.error(err);
      }
    });

    this.socket.on('close', () => {
      if (this.connected) {
        console.error(
          'Socket is closed. Reconnect will be attempted in 1 second.'
        );
        setTimeout(() => {
          this.connectWS();
        }, 1000);
      }
    });
  }

  setState(newState: SetState) {
    const {
      serverNow,
      startTimeMs,
      delayMinutesBetweenHeats,
      numHeats,
      started,
    } = newState;
    this.state.serverOffset = serverNow - Date.now();
    console.log(
      `Date.now: ${Date.now()} Server now: ${serverNow} Diff: ${
        this.state.serverOffset
      } Adjusted now: ${this.now()}`
    );

    this.state.startTimeMs = startTimeMs;
    this.state.delayMinutesBetweenHeats = delayMinutesBetweenHeats;
    this.state.numHeats = numHeats;
    this.state.started = started;

    if (started) {
      this.state.finnished = false;
      const msSinceStart = this.now() - startTimeMs;

      if (msSinceStart < 0) {
        // Not started heat 1

        this.state.currentHeat = 0;
      } else {
        let currentHeat = Math.ceil(
          msSinceStart / (delayMinutesBetweenHeats * 60 * 1000)
        );
        console.log(`Current heat raw ${currentHeat}`);

        if (currentHeat >= numHeats || numHeats <= 1) {
          this.state.finnished = true;
          currentHeat = numHeats;
          console.log(`Current heat raw2 ${currentHeat}`);
        }
        this.state.currentHeat = currentHeat;
      }

      if (!this.state.finnished) {
        this.startTimer();
      }
    } else {
      this.stopTimer();
    }
  }

  nextStartTimeMs() {
    const currentHeat = this.state.finnished
      ? this.state.currentHeat - 1
      : this.state.currentHeat;
    return (
      this.state.startTimeMs +
      currentHeat * this.state.delayMinutesBetweenHeats * 60 * 1000
    );
  }

  startTimer() {
    if (!this.state.started) return;

    if (this.state.intervalFunc) this.stopTimer();
    console.log('Starting timer');
    this.state.intervalFunc = setInterval(() => {
      const newtime = this.nextStartTimeMs() - this.now();

      if (newtime < 0) {
        this.state.currentHeat++;
        if (this.state.currentHeat > this.state.numHeats - 1) {
          this.state.finnished = true;
          this.stopTimer();
        }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.state.intervalFunc) {
      console.log('Stopping timer');
      clearInterval(this.state.intervalFunc);
      this.state.intervalFunc = undefined;
    } else {
      console.log('Timer does not exists timer');
    }
  }
  hornOff() {
    console.log('Horn is off');
    this.isHornOn = false;
    if (this.i2cBus) {
      this.regData |= 0xf << 0;
      this.i2cBus.writeByteSync(DEVICE_ADDRESS, DEVICE_REG_MODE1, this.regData);
    }
  }
  hornOn() {
    console.log('Horn is on');
    this.isHornOn = true;
    if (this.i2cBus) {
      this.regData &= ~(0xf << 0);
      this.i2cBus.writeByteSync(DEVICE_ADDRESS, DEVICE_REG_MODE1, this.regData);
    }
    setTimeout(() => this.hornOff(), 1500);
  }

  checkForHorn() {
    if (
      !this.isHornOn &&
      this.state.started &&
      !this.state.finnished &&
      this.state.hoursLeft == 0 &&
      this.state.secondsLeft == 0
    ) {
      if (
        this.state.minutesLeft == 5 ||
        this.state.minutesLeft == 4 ||
        this.state.minutesLeft == 1 ||
        this.state.minutesLeft == 0
      ) {
        setTimeout(() => this.hornOn(), 10); //TODO handle overlaping timeouts
      }
    }
  }
  getTimeleft() {
    if (!this.state.started) return;

    const now = this.now();

    let timeDif = this.nextStartTimeMs() - now;

    let isNegative = false;
    if (timeDif < 0) {
      if (this.state.finnished) {
        timeDif = Math.abs(timeDif);
        isNegative = true;
      } else {
        // to stop clock "flickering"
        timeDif = 0;
      }
    }

    timeDif = Math.ceil(timeDif / 1000); // Now in whole seconds left
    let seconds = timeDif % 60;
    timeDif = (timeDif - seconds) / 60; // Now in whole minutes left
    let minutes = timeDif % 60;
    timeDif = (timeDif - minutes) / 60; // Now in whole hours left
    let hours = timeDif;

    if (hours > 99) {
      seconds = 99;
      minutes = 99;
      hours = 99;
    }

    if (this.state.isNegative != isNegative) this.state.isNegative = isNegative;
    if (this.state.secondsLeft != seconds) this.state.secondsLeft = seconds;
    if (this.state.minutesLeft != minutes) this.state.minutesLeft = minutes;
    if (this.state.hoursLeft != hours) this.state.hoursLeft = hours;

    this.checkForHorn();
  }
}

export const useCountDown: CountDownStore = new CountDownStore();
