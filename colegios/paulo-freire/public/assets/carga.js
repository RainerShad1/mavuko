// Pantalla de carga con el logo animado.
// Uso: Carga.terminar(destino) — espera a que termine la animación y lleva el logo hasta "destino" (una <img>).
(function () {
  const c = document.getElementById('cargando');
  if (!c) { window.Carga = { terminar() {}, saltar() {} }; return; }
  const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Nombre: primero las iniciales I D P F, una por una; después el resto de las letras, una por una
  const palabras = ['Instituto', 'Dominicano', 'Paulo', 'Freire'];
  const nombre = c.querySelector('.cg-nombre');
  let n = 0, html = '';
  palabras.forEach((p, i) => {
    html += `<span class="p${i > 1 ? ' v' : ''}"><span class="ini" style="animation-delay:${300 + i * 200}ms">${p[0]}</span>`;
    for (const l of p.slice(1)) html += `<span style="animation-delay:${1250 + n++ * 40}ms">${l}</span>`;
    html += '</span>';
  });
  nombre.innerHTML = html;
  const DUR = reduce ? 0 : 1250 + n * 40 + 450;
  c.querySelector('.cg-sub').style.animationDelay = (DUR - 250) + 'ms';
  let hecho = false;
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
  function volar(destino, alFinal) {
    if (hecho) return; hecho = true;
    const mono = c.querySelector('.cg-mono');
    if (reduce || !visible(destino)) { c.classList.add('fuera'); alFinal && alFinal(); setTimeout(() => c.remove(), 600); return; }
    const r = mono.getBoundingClientRect(), d = destino.getBoundingClientRect();
    destino.style.visibility = 'hidden';
    c.classList.add('vuela');
    alFinal && alFinal();
    mono.style.transformOrigin = '0 0';
    requestAnimationFrame(() => { mono.style.transform = `translate(${d.left - r.left}px,${d.top - r.top}px) scale(${d.width / r.width},${d.height / r.height})`; });
    setTimeout(() => { destino.style.visibility = ''; c.remove(); }, 980);
  }
  window.Carga = {
    duracion: DUR,
    // Termina cuando la animación completa ya se vio
    terminar(destino, alFinal) { const falta = DUR - (performance.now() - t0); setTimeout(() => volar(typeof destino === 'function' ? destino() : destino, alFinal), Math.max(0, falta)); },
    // Sin animación (visitas siguientes en la misma sesión)
    saltar(alFinal) { hecho = true; c.style.transition = 'none'; c.classList.add('fuera'); alFinal && alFinal(); setTimeout(() => c.remove(), 50); },
  };
  setTimeout(() => volar(null), 6500); // seguro por si algo falla
})();
