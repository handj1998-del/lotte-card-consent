'use strict';
// View switching: reservation screen -> translated guidance -> entry form.
// Never reads, stores or submits customer fields; inputs/signatures stay in the DOM.
(function(){
  const body=document.body,panel=document.getElementById('guidancePanel'),res=document.getElementById('resScreen');
  function show(view){
    for(const v of ['reserve','guide','entry'])body.classList.toggle('view-'+v,view===v);
    panel.hidden=view!=='guide';panel.open=true;if(res)res.hidden=view!=='reserve';
    const target=document.getElementById(view==='guide'?'guideHeading':view==='entry'?'entryHeading':'resHeading');
    window.scrollTo({top:0,behavior:'auto'});
    if(target)target.focus({preventScroll:true}); // heading focus, not an input: no keyboard pop-up
  }
  window.consentShowView=show;
  document.getElementById('guideStart').addEventListener('click',e=>{e.preventDefault();show('entry');});
  document.getElementById('guideReturn').addEventListener('click',e=>{e.preventDefault();show('guide');});
  show(res?'reserve':'guide');
})();
