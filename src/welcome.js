chrome.storage.local.get('theme', d => {
  if (d.theme === 'light') document.body.classList.add('light');
});

document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('skip').addEventListener('click', () => {
  window.location.href = 'https://waterlooworks.uwaterloo.ca/home.htm';
});
