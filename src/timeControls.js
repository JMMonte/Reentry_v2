// timeControls.js

export function initTimeControls(timeUtils) {
  const timeWarpOptions = [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
  let currentTimeWarpIndex = 1; // Start at 1x

  const decreaseTimeWarpBtn = document.getElementById('decrease-time-warp');
  const increaseTimeWarpBtn = document.getElementById('increase-time-warp');
  const resetTimeWarpBtn = document.getElementById('reset-time-warp');
  const currentTimeWarpSpan = document.getElementById('current-time-warp');
  const currentTimeSpan = document.getElementById('current-time');

  function updateTimeWarpDisplay() {
    const currentValue = timeWarpOptions[currentTimeWarpIndex];
    currentTimeWarpSpan.textContent = currentValue + 'x';
    document.dispatchEvent(new CustomEvent('updateTimeWarp', { detail: { value: currentValue } }));
    timeUtils.setTimeWarp(currentValue);
  }

  decreaseTimeWarpBtn.addEventListener('click', () => {
    if (currentTimeWarpIndex > 0) {
      currentTimeWarpIndex--;
      updateTimeWarpDisplay();
    }
  });

  increaseTimeWarpBtn.addEventListener('click', () => {
    if (currentTimeWarpIndex < timeWarpOptions.length - 1) {
      currentTimeWarpIndex++;
      updateTimeWarpDisplay();
    }
  });

  resetTimeWarpBtn.addEventListener('click', () => {
    currentTimeWarpIndex = 1; // Reset to 1x
    updateTimeWarpDisplay();
  });

  // Listen for time updates from the main app
  document.addEventListener('timeUpdate', (event) => {
    const { simulatedTime } = event.detail;
    const date = new Date(simulatedTime);

    // Format the time as HH:MM:SS.cc (24-hour format with centesimals)
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds();
    const centesimals = Math.floor(milliseconds / 10).toString().padStart(2, '0');

    const formattedTime = `${hours}:${minutes}:${seconds}.${centesimals}`;

    currentTimeSpan.textContent = formattedTime;
  });

  // Initialize with the default time warp value
  updateTimeWarpDisplay();
}
