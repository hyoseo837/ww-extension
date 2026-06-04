document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('skip').addEventListener('click', () => {
  window.location.href = 'https://waterlooworks.uwaterloo.ca/home.htm';
});
