'use strict';
// Read-only guidance navigation. Never reads, stores or submits customer fields.
const guidancePanel = document.getElementById('guidancePanel');
document.getElementById('guideStart').addEventListener('click', () => {
  guidancePanel.open = false;
  const entry = document.getElementById('entry');
  entry.scrollIntoView({behavior: 'smooth', block: 'start'});
  entry.focus({preventScroll: true});
});
document.getElementById('guideReturn').addEventListener('click', () => {
  guidancePanel.open = true;
  guidancePanel.scrollIntoView({behavior: 'smooth', block: 'start'});
  guidancePanel.querySelector('summary').focus({preventScroll: true});
});
