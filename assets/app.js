// Configuration is provided via assets/config.js (window.WEBHOOK_URL)
(function () {
  const form = document.getElementById('lsmc-form');
  const expRadios = form.querySelectorAll('input[name="exp_med"]');
  const expDetails = document.getElementById('exp-details');
  const toast = document.getElementById('toast');
  const csvBtn = document.getElementById('export-csv-btn');
  const submitBtn = document.getElementById('submit-btn');
  const configNotice = document.getElementById('config-notice');
  const aiWarning = document.getElementById('ai-warning');
  const aiWarningList = document.getElementById('ai-warning-list');

  const WEBHOOK = (typeof window.WEBHOOK_URL === 'string' && window.WEBHOOK_URL.trim()) ? window.WEBHOOK_URL.trim() : null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  // ===== Détection texte IA (heuristiques légères) =====
  function aiSignals(text) {
    const t = (text || '').trim();
    const l = t.toLowerCase();
    let score = 0; const reasons = [];

    const phrasePatterns = [
      /en tant qu'ia|en tant que ia|comme ia|modèle de langage/gi,
      /as an ai|as a language model|i am an ai/gi,
      /je ne peux pas fournir|je ne peux pas donner/gi,
      /i cannot provide|i can\'t provide/gi
    ];
    phrasePatterns.forEach(r => { if (r.test(l)) { score += 50; reasons.push('Formulation de type “en tant qu’IA/LM”.'); } });

    const tokens = l.match(/[a-zA-ZÀ-ÖØ-öø-ÿ']+/g) || [];
    const unique = new Set(tokens);
    const len = tokens.length;
    const uniqRatio = len ? unique.size / len : 1;
    if (len > 100 && uniqRatio < 0.42) { score += 20; reasons.push('Faible diversité lexicale (répétitions importantes).'); }

    const connectors = [
      'premièrement','deuxièmement','en conclusion','de plus','par ailleurs','néanmoins','par conséquent',
      'firstly','secondly','in conclusion','moreover','furthermore'
    ];
    const connCount = connectors.reduce((acc, w) => acc + (l.split(w).length - 1), 0);
    if (connCount >= 3 && len > 120) { score += 15; reasons.push('Connecteurs académiques répétitifs (style générique IA).'); }

    const sentences = t.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length >= 4) {
      const starts = sentences.map(s => s.split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
      const freq = starts.reduce((m, w) => (m[w] = (m[w]||0)+1, m), {});
      const topStart = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
      if (topStart && (topStart[1] / starts.length) > 0.6) { score += 10; reasons.push('Début de phrase trop uniforme.'); }
    }

    const longLines = t.split(/\n/).filter(s => s.length > 240).length;
    if (longLines >= 2) { score += 10; reasons.push('Paragraphes très longs sans respiration.'); }

    return { score, reasons, flagged: score >= 40 };
  }

  function checkAIContent() {
    const areas = form.querySelectorAll('textarea');
    let anyFlag = false; const report = [];
    areas.forEach(area => {
      const { flagged, reasons } = aiSignals(area.value);
      const label = form.querySelector(`label[for="${area.id}"]`);
      if (flagged) {
        anyFlag = true;
        area.classList.add('invalid-ai');
        report.push(`${label ? label.textContent : area.name}: ${reasons[0] || 'Texte suspect.'}`);
      } else {
        area.classList.remove('invalid-ai');
      }
    });

    if (anyFlag) {
      aiWarningList.innerHTML = '';
      report.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        aiWarningList.appendChild(li);
      });
      show(aiWarning);
      submitBtn.disabled = true;
    } else {
      hide(aiWarning);
      submitBtn.disabled = false;
    }
    return !anyFlag;
  }

  // Toggle experience details visibility
  expRadios.forEach(r => {
    r.addEventListener('change', () => {
      if (r.value === 'oui') {
        show(expDetails);
        // Make details required when experience is yes
        form.exp_poste.required = true;
        form.exp_duree.required = true;
      } else {
        hide(expDetails);
        form.exp_poste.required = false;
        form.exp_duree.required = false;
      }
    });
  });

  // Webhook config state
  if (!WEBHOOK) {
    show(configNotice);
  }

  // Helper: collect form values
  function collectData() {
    const data = {
      nom: form.nom.value.trim(),
      age: form.age.value.trim(),
      exp_med: form.querySelector('input[name="exp_med"]:checked')?.value || '',
      exp_poste: form.exp_poste.value.trim(),
      exp_duree: form.exp_duree.value.trim(),
      poste: form.poste.value,
      motivation_1: form.motivation_1.value.trim(),
      motivation_2: form.motivation_2.value.trim(),
      motivation_3: form.motivation_3.value.trim(),
      motivation_4: form.motivation_4.value.trim(),
      med_1: form.med_1.value.trim(),
      med_2: form.med_2.value.trim(),
      med_3: form.med_3.value.trim(),
      med_4: form.med_4.value.trim(),
      reg_1: form.reg_1.value.trim(),
      reg_2: form.reg_2.value.trim(),
      reg_3: form.reg_3.value.trim(),
      disp_1: form.disp_1.value.trim(),
      nuit: form.querySelector('input[name="nuit"]:checked')?.value || '',
      formation: form.querySelector('input[name="formation"]:checked')?.value || '',
      certif: form.certif.checked ? 'oui' : 'non',
      auto_confirm: form.auto_confirm.checked ? 'oui' : 'non'
    };
    return data;
  }

  // Helper: validate required fields manually if needed
  function validateForm() {
    const required = form.querySelectorAll('[required]');
    let valid = true;
    required.forEach(el => {
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checkValidity()) {
        valid = false;
      } else if (!el.value || !el.checkValidity()) {
        valid = false;
      }
    });
    return valid;
  }

  // Helper: build CSV
  function toCSV(data) {
    const headers = Object.keys(data);
    const values = headers.map(h => {
      const v = data[h].replaceAll('\n', ' ').replaceAll('"', '""');
      return `"${v}"`;
    });
    return headers.join(',') + '\n' + values.join(',') + '\n';
  }

  // Helper: trigger download
  function downloadCSV(csv, filename = 'candidature_lsmc.csv') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Discord webhook payload (embed amélioré et hiérarchisé)
  function buildDiscordPayload(data) {
    const bullet = (label, value) => `• **${label}:** ${value}`;
    const description = [
      'Nouvelle candidature LSMC',
      bullet('Poste', `**${data.poste}**`),
      bullet('Disponibilités', data.disp_1 || '—'),
      bullet('Certification règlement', (data.certif || 'non').toUpperCase())
    ].join('\n');

    const baseInline = [
      { name: 'Nom RP', value: data.nom || '—', inline: true },
      { name: 'Âge RP', value: data.age || '—', inline: true },
      { name: 'Poste', value: data.poste || '—', inline: true },
      {
        name: 'Expérience',
        value: `${data.exp_med || '—'}${data.exp_med === 'oui' ? ` • ${data.exp_poste || 'poste ?'}, ${data.exp_duree || 'durée ?'}` : ''}`,
        inline: true
      },
      { name: 'Nuit', value: data.nuit || '—', inline: true },
      { name: 'Formation', value: data.formation || '—', inline: true }
    ];

    const fields = [
      { name: '— Informations —', value: ' ', inline: false },
      ...baseInline,
      { name: '— Motivation —', value: ' ', inline: false },
      { name: 'Pourquoi LSMC ?', value: data.motivation_1 || '—', inline: false },
      { name: 'Apports à l’équipe', value: data.motivation_2 || '—', inline: false },
      { name: 'Patient agressif', value: data.motivation_3 || '—', inline: false },
      { name: 'Ordre du supérieur', value: data.motivation_4 || '—', inline: false },
      { name: '— Connaissances RP —', value: ' ', inline: false },
      { name: 'Arrêt cardiaque vs coma RP', value: data.med_1 || '—', inline: false },
      { name: 'Étapes intervention RP', value: data.med_2 || '—', inline: false },
      { name: 'Multiples blessés dont un critique', value: data.med_3 || '—', inline: false },
      { name: 'Communication radio en urgence', value: data.med_4 || '—', inline: false },
      { name: '— Règlement & discipline —', value: ' ', inline: false },
      { name: 'Règles du LSMC', value: data.reg_1 || '—', inline: false },
      { name: 'Oubli volontaire de facturation', value: data.reg_2 || '—', inline: false },
      { name: 'RP réaliste et immersif', value: data.reg_3 || '—', inline: false }
    ];

    return {
      content: null,
      allowed_mentions: { parse: [] },
      username: 'LSMC Recrutement',
      embeds: [{
        title: 'Candidature – Los Santos Medical Center',
        description,
        color: 0x00B4D8,
        author: { name: 'LSMC • Recrutement' },
        footer: { text: 'Dossier RH — Ne pas répondre dans ce canal.' },
        fields,
        timestamp: new Date().toISOString()
      }]
    };
  }

  async function sendToDiscord(payload) {
    if (!WEBHOOK) throw new Error('Webhook non configuré');
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Envoi Discord échoué');
  }

  function showToast() {
    show(toast);
    setTimeout(() => hide(toast), 5000);
  }

  // Submit handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Vérif IA avant la validation HTML
    const aiOk = checkAIContent();
    if (!aiOk) {
      alert('Certaines réponses semblent rédigées par IA. Merci de reformuler manuellement.');
      return;
    }
    if (!validateForm()) {
      form.reportValidity();
      return;
    }
    const data = collectData();
    const csv = toCSV(data);

    // Disable button during processing
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    try {
      if (WEBHOOK) {
        const payload = buildDiscordPayload(data);
        await sendToDiscord(payload);
        if (data.auto_confirm === 'oui') {
          // optional confirmation post
          await sendToDiscord({ content: `Confirmation: Candidature envoyée pour **${data.nom}** – Poste **${data.poste}**.` });
        }
      }
      showToast();
    } catch (err) {
      alert('Échec de l’envoi Discord. Vérifiez la configuration ou un proxy côté serveur (CORS).');
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer ma candidature';
    }
  });

  // Export CSV handler
  csvBtn.addEventListener('click', () => {
    const data = collectData();
    const csv = toCSV(data);
    downloadCSV(csv);
  });

  // Vérification IA en temps réel
  form.querySelectorAll('textarea').forEach(area => {
    area.addEventListener('input', () => { checkAIContent(); });
    area.addEventListener('blur', () => { checkAIContent(); });
  });
})();