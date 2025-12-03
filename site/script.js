
async function load(){
  const r = await fetch("/stats");
  const j = await r.json();
  document.getElementById("out").textContent = JSON.stringify(j,null,2);
}
setInterval(load,1000);
load();
