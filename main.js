const i2c = require('i2c-bus');

console.log('Opening ic2-bus');
const i2c1 = i2c.openSync(1); // # 0 = /dev/i2c-0 (port I2C0), 1 = /dev/i2c-1 (port I2C1)
console.log('ic2-bus is open');
// The number of relay ports on the relay board.
// This value should never change!
const NUM_RELAY_PORTS = 4;

// Change the following value if your Relay board uses a different I2C address.
const DEVICE_ADDRESS = 0x20; // 7 bit address (will be left shifted to add the read write bit)
// Don't change the values, there's no need for that.
const DEVICE_REG_MODE1 = 0x06;

//Device registry data
let DEVICE_REG_DATA = 0xff;


const allOn  = () => {
  console.log('Turning all relays ON');
  DEVICE_REG_DATA &= ~(0xf << 0);
  i2c1.writeByteSync(DEVICE_ADDRESS, DEVICE_REG_MODE1, DEVICE_REG_DATA);
};

const allOff = () => {
  console.log('Turning all relays Off');
  DEVICE_REG_DATA |= 0xf << 0;
  i2c1.writeByteSync(DEVICE_ADDRESS, DEVICE_REG_MODE1, DEVICE_REG_DATA);
};

setTimeout(allOn,10);
setTimeout(allOff,1000);

sdsf


