/* ============================================================
   SISTEMA DE ALERTAS MODALES - Micro Red Paucará
   UI.alert, UI.confirm, UI.success, UI.error, UI.warning, UI.info
   ============================================================ */

const ICONOS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'i'
};

const COLORES = {
  success: { grad: 'linear-gradient(135deg, #16a34a, #22c55e)', shadow: 'rgba(34,197,94,.5)' },
  error:   { grad: 'linear-gradient(135deg, #dc2626, #ef4444)', shadow: 'rgba(239,68,68,.5)' },
  warning: { grad: 'linear-gradient(135deg, #d97706, #fbbf24)', shadow: 'rgba(251,191,36,.5)' },
  info:    { grad: 'linear-gradient(135deg, #2563eb, #0ea5e9)', shadow: 'rgba(59,130,246,.5)' }
};

const TITULOS_DEF = {
  success: 'Éxito',
  error:   'Error',
  warning: 'Atención',
  info:    'Información'
};

/* ============================================================
   Construir el modal
   ============================================================ */
function construirModal({ tipo = 'info', titulo, mensaje, htmlExtra = '', botones }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ui-modal-backdrop';
  wrapper.setAttribute('data-tipo', tipo);

  const color = COLORES[tipo] || COLORES.info;
  const icono = ICONOS[tipo] || ICONOS.info;
  const tituloFinal = titulo || TITULOS_DEF[tipo] || 'Mensaje';

  // Botones
  const botonesHTML = botones.map(b => `
    <button class="ui-btn ${b.estilo || 'ui-btn-primary'}" data-action="${b.action}">
      ${b.texto}
    </button>
  `).join('');

  wrapper.innerHTML = `
    <div class="ui-modal">
      <div class="ui-icono" style="background:${color.grad};box-shadow:0 15px 40px ${color.shadow};">
        ${icono}
      </div>
      <div class="ui-contenido">
        <h3 class="ui-titulo">${escapeHtml(tituloFinal)}</h3>
        <p class="ui-mensaje">${escapeHtml(mensaje)}</p>
        ${htmlExtra ? `<div class="ui-extra">${htmlExtra}</div>` : ''}
      </div>
      <div class="ui-acciones">
        ${botonesHTML}
      </div>
    </div>
  `;

  return wrapper;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

/* ============================================================
   API PÚBLICA
   ============================================================ */

/**
 * Alerta simple con botón Aceptar
 */
function alert(tipo, mensaje, titulo = null) {
  return new Promise((resolve) => {
    const wrapper = construirModal({
      tipo,
      titulo,
      mensaje,
      botones: [{ texto: 'Aceptar', action: 'aceptar', estilo: 'ui-btn-primary' }]
    });

    document.body.appendChild(wrapper);

    // Animar entrada
    requestAnimationFrame(() => wrapper.classList.add('visible'));

    // Cerrar con botón
    wrapper.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        wrapper.classList.remove('visible');
        setTimeout(() => { wrapper.remove(); resolve(); }, 250);
      });
    });

    // Cerrar con ESC
    const onEsc = e => {
      if (e.key === 'Escape') {
        wrapper.classList.remove('visible');
        setTimeout(() => { wrapper.remove(); resolve(); }, 250);
        document.removeEventListener('keydown', onEsc);
      }
    };
    document.addEventListener('keydown', onEsc);
  });
}

/**
 * Diálogo de confirmación (Aceptar / Cancelar)
 * Retorna true si Aceptar, false si Cancelar o ESC
 */
function confirm(mensaje, titulo = 'Confirmar', opciones = {}) {
  return new Promise((resolve) => {
    const wrapper = construirModal({
      tipo: opciones.tipo || 'warning',
      titulo,
      mensaje,
      botones: [
        { texto: opciones.textoCancelar || 'Cancelar', action: 'cancelar', estilo: 'ui-btn-ghost' },
        { texto: opciones.textoAceptar || 'Aceptar',   action: 'aceptar',  estilo: 'ui-btn-primary' }
      ]
    });

    document.body.appendChild(wrapper);
    requestAnimationFrame(() => wrapper.classList.add('visible'));

    wrapper.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        wrapper.classList.remove('visible');
        setTimeout(() => { wrapper.remove(); resolve(action === 'aceptar'); }, 250);
      });
    });

    const onEsc = e => {
      if (e.key === 'Escape') {
        wrapper.classList.remove('visible');
        setTimeout(() => { wrapper.remove(); resolve(false); }, 250);
        document.removeEventListener('keydown', onEsc);
      }
    };
    document.addEventListener('keydown', onEsc);
  });
}

/* ============================================================
   Atajos por tipo
   ============================================================ */
const UI = {
  alert:   (msg, titulo) => alert('info', msg, titulo),
  success: (msg, titulo) => alert('success', msg, titulo),
  error:   (msg, titulo) => alert('error', msg, titulo),
  warning: (msg, titulo) => alert('warning', msg, titulo),
  info:    (msg, titulo) => alert('info', msg, titulo),
  confirm
};

export default UI;
export { alert, confirm };