/* ============================================================
   SIDEBAR — Módulos colapsables con memoria
   Guarda en localStorage qué módulo está abierto
   para mantenerlo al navegar entre páginas
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const KEY_ABIERTO = 'sidebar_modulo_abierto';

  // Detectar cuál módulo debe estar abierto según la página actual
  function moduloPorPagina() {
    const pagina = location.pathname.split('/').pop() || 'dashboard.html';
    if (['bienes.html', 'actas.html', 'dashboard.html'].includes(pagina)) return 'patrimonio';
    if (['catalogo-suministros.html', 'ingresos.html', 'salidas.html',
         'stock.html', 'kardex.html'].includes(pagina)) return 'almacen';
    return 'configuracion';
  }

  // 1. Restaurar el módulo abierto (prioridad: página actual > localStorage)
  const moduloAuto = moduloPorPagina();
  const moduloGuardado = localStorage.getItem(KEY_ABIERTO);

  // El de la página actual siempre gana
  const abrirInicial = moduloAuto || moduloGuardado || 'patrimonio';

  document.querySelectorAll('.sidebar-modulo').forEach(mod => {
    if (mod.dataset.modulo === abrirInicial) {
      mod.classList.add('abierto');
    } else {
      mod.classList.remove('abierto');
    }
  });

  // 2. Guardar el estado al hacer clic y permitir alternar
  document.querySelectorAll('.sidebar-modulo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modulo = btn.closest('.sidebar-modulo');
      const estaAbierto = modulo.classList.contains('abierto');

      // Cerrar todos los demás
      document.querySelectorAll('.sidebar-modulo').forEach(m => m.classList.remove('abierto'));

      // Abrir/cerrar el que hicimos clic
      if (!estaAbierto) {
        modulo.classList.add('abierto');
        localStorage.setItem(KEY_ABIERTO, modulo.dataset.modulo);
      } else {
        localStorage.removeItem(KEY_ABIERTO);
      }
    });
  });
});