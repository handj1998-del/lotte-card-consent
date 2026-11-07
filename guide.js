'use strict';
// Read-only view switching between the translated guidance and the entry form.
// Never reads, stores or submits customer fields; inputs/signatures stay in the DOM.
(function(){
  const body=document.body,panel=document.getElementById('guidancePanel'),entry=document.getElementById('entry');
  function show(view){
    body.classList.toggle('view-guide',view==='guide');body.classList.toggle('view-entry',view==='entry');
    panel.hidden=view!=='guide';panel.open=true;
    const target=view==='guide'?document.getElementById('guideHeading'):document.getElementById('entryHeading');
    window.scrollTo({top:0,behavior:'auto'});
    target.focus({preventScroll:true}); // focuses a heading/container, not an input: no keyboard pop-up
  }
  document.getElementById('guideStart').addEventListener('click',e=>{e.preventDefault();show('entry');});
  document.getElementById('guideReturn').addEventListener('click',e=>{e.preventDefault();show('guide');});
  body.classList.add('view-guide');
})();
