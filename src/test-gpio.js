// Test GPIO LED blinking - ES Module version
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Gpio } = require('onoff');

// GPIO pin to use
const LED_PIN = 18;

// First, try to unexport the pin if it's already exported (prevents EINVAL errors)
try {
  execSync(`echo ${LED_PIN} > /sys/class/gpio/unexport 2>/dev/null`, { stdio: 'ignore' });
  console.log(`Unexported GPIO pin ${LED_PIN} if it was already in use`);
} catch (e) {
  // Pin might not be exported, that's fine
}

// Small delay to ensure pin is released
await new Promise(resolve => setTimeout(resolve, 100));

// Use GPIO pin 4 (or change to your pin)
let LED;
try {
  LED = new Gpio(LED_PIN, 'out'); // use GPIO pin 4, and specify that it is output
  console.log(`✓ GPIO LED initialized on pin ${LED_PIN}`);
} catch (error) {
  console.error(`✗ Failed to initialize GPIO pin ${LED_PIN}:`, error.message);
  console.error('  Try running with: sudo');
  console.error(`  Or manually unexport: sudo sh -c "echo ${LED_PIN} > /sys/class/gpio/unexport"`);
  process.exit(1);
}

let blinkInterval = setInterval(blinkLED, 250); // run the blinkLED function every 250ms

function blinkLED() {
  // function to start blinking
  if (LED.readSync() === 0) {
    // check the pin state, if the state is 0 (or off)
    LED.writeSync(1); // set pin state to 1 (turn LED on)
  } else {
    LED.writeSync(0); // set pin state to 0 (turn LED off)
  }
}

function endBlink() {
  // function to stop blinking
  clearInterval(blinkInterval); // Stop blink intervals
  LED.writeSync(0); // Turn LED off
  LED.unexport(); // Unexport GPIO to free resources
  console.log('Blinking stopped and GPIO cleaned up');
}

setTimeout(endBlink, 5000); // stop blinking after 5 seconds
console.log('LED blinking started on GPIO pin 4. Will stop in 5 seconds...');

